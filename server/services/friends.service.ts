import { Types } from "mongoose";
import type { UserBrief, FriendDTO, FriendRequestDTO, FriendStatusDTO, FriendSuggestionDTO, FriendsSummaryDTO } from "@/lib/types";
import { ApiError, badRequest, forbidden, notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import { Friendship, pairKeyOf, type IFriendship } from "../models/Friendship";
import { Membership } from "../models/Membership";
import { User, type IUser } from "../models/User";
import { loadBriefs } from "../serializers";
import { blockedEitherWay, hiddenUserIds } from "./blocks";
import { sid } from "./helpers";
import { notify } from "./push.service";

type Id = Types.ObjectId | string;
const otherOf = (f: IFriendship, me: Id) => (sid(f.requesterId) === sid(me) ? f.recipientId : f.requesterId);

export async function areFriends(a: Id, b: Id): Promise<boolean> {
  return !!(await Friendship.exists({ pairKey: pairKeyOf(a as Types.ObjectId, b as Types.ObjectId), status: "accepted" }));
}

/** Where this viewer stands with `other`: for the Add friend / Pending / Accept / Friends button. */
export async function friendStatus(viewerId: Id, otherId: Id): Promise<FriendStatusDTO> {
  const f = await Friendship.findOne({ pairKey: pairKeyOf(viewerId as Types.ObjectId, otherId as Types.ObjectId) }).lean<IFriendship>();
  if (!f) return { state: "none" };
  if (f.status === "accepted") return { state: "friends", requestId: sid(f._id), since: (f.acceptedAt ?? f.createdAt).toISOString() };
  return { state: sid(f.requesterId) === sid(viewerId) ? "outgoing" : "incoming", requestId: sid(f._id) };
}

/** People who are friends with both `a` and `b` (never includes anyone either of them has blocked). */
export async function mutualFriends(a: Id, b: Id): Promise<UserBrief[]> {
  const idsOf = async (me: Id) => {
    const rows = await Friendship.find({ status: "accepted", $or: [{ requesterId: me }, { recipientId: me }] })
      .limit(500)
      .lean<IFriendship[]>();
    return rows.map((r) => sid(otherOf(r, me)));
  };
  const [fa, fb] = await Promise.all([idsOf(a), idsOf(b)]);
  const setB = new Set(fb);
  const shared = fa.filter((id) => setB.has(id)).slice(0, 50);
  if (!shared.length) return [];
  const hidden = new Set((await hiddenUserIds(a)).map(sid));
  const briefs = await loadBriefs(shared.filter((id) => !hidden.has(id)));
  return [...briefs.values()];
}

export async function listFriends(viewer: IUser): Promise<FriendDTO[]> {
  const rows = await Friendship.find({ status: "accepted", $or: [{ requesterId: viewer._id }, { recipientId: viewer._id }] })
    .sort({ acceptedAt: -1 })
    .limit(500)
    .lean<IFriendship[]>();
  const briefs = await loadBriefs(rows.map((r) => otherOf(r, viewer._id)));
  return rows.flatMap((r) => {
    const user = briefs.get(sid(otherOf(r, viewer._id)));
    return user ? [{ user, since: (r.acceptedAt ?? r.createdAt).toISOString() }] : [];
  });
}

export async function listRequests(viewer: IUser): Promise<FriendRequestDTO[]> {
  const rows = await Friendship.find({ status: "pending", $or: [{ requesterId: viewer._id }, { recipientId: viewer._id }] })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean<IFriendship[]>();
  const hidden = new Set((await hiddenUserIds(viewer._id)).map(sid)); // never show a blocked person's request
  const briefs = await loadBriefs(rows.map((r) => otherOf(r, viewer._id)));
  return rows.flatMap((r) => {
    const otherId = sid(otherOf(r, viewer._id));
    const user = briefs.get(otherId);
    if (!user || hidden.has(otherId)) return [];
    return [{ id: sid(r._id), user, direction: sid(r.requesterId) === sid(viewer._id) ? ("outgoing" as const) : ("incoming" as const), createdAt: r.createdAt.toISOString() }];
  });
}

/** Counts for the badges in the Messages panel. */
export async function friendsSummary(viewer: IUser): Promise<FriendsSummaryDTO> {
  const [friends, incoming] = await Promise.all([
    Friendship.countDocuments({ status: "accepted", $or: [{ requesterId: viewer._id }, { recipientId: viewer._id }] }),
    Friendship.countDocuments({ status: "pending", recipientId: viewer._id }),
  ]);
  return { friends, incoming };
}

export async function sendRequest(viewer: IUser, handle: string): Promise<FriendStatusDTO> {
  rateLimit(`friend-req:${sid(viewer._id)}`, 20, 60 * 60_000);
  const target = await User.findOne({ handle: handle.toLowerCase() }).select("_id handle").lean<{ _id: Types.ObjectId; handle: string }>();
  // Same answer whether the person doesn't exist or has blocked you.
  if (!target || (await blockedEitherWay(viewer._id, target._id))) throw notFound("We couldn't find anyone with that handle.");
  if (sid(target._id) === sid(viewer._id)) throw badRequest("You can't add yourself.");

  const key = pairKeyOf(viewer._id, target._id);
  const existing = await Friendship.findOne({ pairKey: key }).lean<IFriendship>();
  if (existing) {
    if (existing.status === "accepted") return { state: "friends", requestId: sid(existing._id) };
    if (sid(existing.requesterId) === sid(viewer._id)) return { state: "outgoing", requestId: sid(existing._id) };
    // They already asked you: asking back is a yes.
    await Friendship.updateOne({ _id: existing._id }, { status: "accepted", acceptedAt: new Date() });
    notify([existing.requesterId], { title: `${viewer.displayName} accepted your friend request`, body: "You can message each other now.", data: { href: `/?profile=${viewer.handle}` } }, { actorId: viewer._id, category: "friends", ref: "friends" });
    return { state: "friends", requestId: sid(existing._id) };
  }
  try {
    const f = await Friendship.create({ pairKey: key, requesterId: viewer._id, recipientId: target._id });
    notify([target._id], { title: `${viewer.displayName} sent you a friend request`, body: `@${viewer.handle}`, data: { href: "/messages/friends" } }, { actorId: viewer._id, category: "friends", groupKey: "friend-req", many: (n) => `${n} new friend requests`, ref: "friends" });
    return { state: "outgoing", requestId: sid(f._id) };
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return friendStatus(viewer._id, target._id); // both asked at once
    throw e;
  }
}

async function loadMine(viewer: IUser, id: string): Promise<IFriendship> {
  const f = await Friendship.findOne({ _id: id, $or: [{ requesterId: viewer._id }, { recipientId: viewer._id }] }).lean<IFriendship>();
  if (!f) throw notFound("We couldn't find that request.");
  return f;
}

/** The person asked decides: accept or decline. */
export async function respondToRequest(viewer: IUser, id: string, action: "accept" | "decline") {
  const f = await loadMine(viewer, id);
  if (f.status !== "pending") throw new ApiError(409, "That request was already answered.");
  if (sid(f.recipientId) !== sid(viewer._id)) throw forbidden("Only the person who was asked can answer.");
  if (action === "accept") {
    if (await blockedEitherWay(f.requesterId, f.recipientId)) throw notFound("We couldn't find that request.");
    await Friendship.updateOne({ _id: f._id }, { status: "accepted", acceptedAt: new Date() });
    notify([f.requesterId], { title: `${viewer.displayName} accepted your friend request`, body: "You can message each other now.", data: { href: `/?profile=${viewer.handle}` } }, { actorId: viewer._id, category: "friends", ref: "friends" });
  } else {
    await Friendship.deleteOne({ _id: f._id });
  }
  return { action };
}

/** Withdraw your own pending request. */
export async function cancelRequest(viewer: IUser, id: string) {
  const f = await loadMine(viewer, id);
  if (f.status !== "pending" || sid(f.requesterId) !== sid(viewer._id)) throw forbidden("You can only withdraw a request you sent.");
  await Friendship.deleteOne({ _id: f._id });
  return { cancelled: true };
}

export async function removeFriend(viewer: IUser, handle: string) {
  const target = await User.findOne({ handle: handle.toLowerCase() }).select("_id").lean<{ _id: Types.ObjectId }>();
  if (!target) throw notFound("We couldn't find anyone with that handle.");
  await Friendship.deleteOne({ pairKey: pairKeyOf(viewer._id, target._id), status: "accepted" });
  return { removed: true };
}

/** Blocking ends any friendship or pending request between the two. */
export async function dropFriendship(a: Id, b: Id) {
  await Friendship.deleteOne({ pairKey: pairKeyOf(a as Types.ObjectId, b as Types.ObjectId) });
}

/**
 * "People you may know": people who share communities with you, most in common first.
 * Excludes you, friends, anyone with a pending request either way, blocked people, and private profiles.
 */
export async function suggestions(viewer: IUser, limit = 5): Promise<FriendSuggestionDTO[]> {
  const mine = await Membership.find({ userId: viewer._id, status: "active", subcommunityId: null }).select("communityId").lean<{ communityId: Types.ObjectId }[]>();
  if (!mine.length) return [];
  const [related, hidden] = await Promise.all([
    Friendship.find({ $or: [{ requesterId: viewer._id }, { recipientId: viewer._id }] }).select("requesterId recipientId").lean<IFriendship[]>(),
    hiddenUserIds(viewer._id),
  ]);
  const exclude = new Set<string>([sid(viewer._id), ...hidden.map(sid), ...related.map((f) => sid(otherOf(f, viewer._id)))]);

  const shared = await Membership.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { communityId: { $in: mine.map((m) => m.communityId) }, status: "active", subcommunityId: null, userId: { $nin: [...exclude].map((x) => new Types.ObjectId(x)) } } },
    { $group: { _id: "$userId", n: { $sum: 1 } } },
    { $sort: { n: -1, _id: 1 } },
    { $limit: limit * 3 },
  ]);
  const users = await User.find({ _id: { $in: shared.map((s) => s._id) }, profileVisibility: { $ne: "private" } })
    .select("handle displayName avatarUrl avatarFrame nameEffect country city")
    .lean<IUser[]>();
  const byId = new Map(users.map((u) => [sid(u._id), u]));
  return shared
    .flatMap((s) => {
      const u = byId.get(sid(s._id));
      return u ? [{ user: { id: sid(u._id), handle: u.handle, displayName: u.displayName, avatarUrl: u.avatarUrl ?? null, avatarFrame: u.avatarFrame ?? null, nameEffect: u.nameEffect ?? null, country: u.country ?? "NG", city: u.city }, mutualCommunities: s.n }] : [];
    })
    .slice(0, limit);
}
