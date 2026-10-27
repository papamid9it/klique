import { isKlique } from "./klique-id";
import type { Types } from "mongoose";
import { deleteUploads } from "./media.service";
import type {
  InviteDTO,
  InvitePreviewDTO,
  JoinResult,
  MemberDTO,
  MembershipRequestDTO,
  Paginated,
  PostDTO,
  Role,
} from "@/lib/types";
import { ApiError, badRequest, conflict, forbidden, notFound } from "../http/errors";
import { ChannelMember } from "../models/Channel";
import { Community, type ICommunity } from "../models/Community";
import { Invitation, type IInvitation } from "../models/Invitation";
import { Membership, type IMembership } from "../models/Membership";
import { MembershipRequest, type IMembershipRequest } from "../models/MembershipRequest";
import { Post, type IPost } from "../models/Post";
import { Subcommunity, type ISubcommunity } from "../models/Subcommunity";
import { User, type IUser } from "../models/User";
import {
  assertCanManage,
  assertCanPost,
  assertCanView,
  assertSubVisibleOrHidden,
  canSetRole,
  gateOf,
  outranks,
  pointsShort,
  spaceAccess,
  type Space,
  type SpaceAccess,
} from "../policies/access";
import { loadBriefs, toPosts } from "../serializers";
import { escapeRegex, newInviteCode, recountMembers, sid } from "./helpers";
import { rateLimit } from "../http/rate-limit";
import { notify } from "./push.service";
import { leaveSpaceCrews } from "./crews.service";

/* ------------------------------------------------------------------ */
/* Resolving a space from URL params                                   */
/* ------------------------------------------------------------------ */

export async function resolveSpace(slug: string, subSlug?: string): Promise<Space> {
  const community = await Community.findOne({ slug: slug.toLowerCase() }).lean<ICommunity>();
  if (!community) throw notFound("We couldn't find that community.");
  if (!subSlug) return { community, sub: null };
  const sub = await Subcommunity.findOne({ communityId: community._id, slug: subSlug.toLowerCase() }).lean<ISubcommunity>();
  if (!sub) throw notFound("We couldn't find that group.");
  return { community, sub };
}

/** Resolve + authorise visibility in one step. Private groups 404 for outsiders, and so do 18+ communities for under-18s. */
export async function resolveSpaceFor(viewer: IUser | null, slug: string, subSlug?: string) {
  const space = await resolveSpace(slug, subSlug);
  const access = await spaceAccess(space, viewer);
  assertAdultGate(access);
  assertSubVisibleOrHidden(space, access);
  return { space, access };
}

/** An 18+ community this person may not enter: not found for under-18s, otherwise what they still need to do. */
export function assertAdultGate(access: SpaceAccess) {
  const gate = access.adultGate;
  if (!gate) return;
  if (gate === "under_18") throw notFound("We couldn't find that community.");
  throw new ApiError(403, ADULT_GATE_MESSAGE[gate], { code: "age_gate", errors: { gate } });
}

const ADULT_GATE_MESSAGE: Record<Exclude<NonNullable<SpaceAccess["adultGate"]>, "under_18">, string> = {
  sign_in: "Sign in to see this community. It's for people 18 and over.",
  dob_required: "This community is for people 18 and over. Add your date of birth to continue.",
  confirm_adult: "This community is for people 18 and over. Confirm you're 18 or older to continue.",
  explicit_optin: "This community shows explicit content. Turn on Show explicit content in Settings to see it.",
};

const spaceFilter = (space: Space) => ({
  communityId: space.community._id,
  subcommunityId: space.sub?._id ?? null,
});

const spaceLabel = (space: Space) => (space.sub ? space.sub.name : space.community.name);

/* ------------------------------------------------------------------ */
/* Joining & leaving                                                   */
/* ------------------------------------------------------------------ */

async function addMember(space: Space, userId: Types.ObjectId, role: Role = "member") {
  await Membership.updateOne(
    { userId, ...spaceFilter(space) },
    { $setOnInsert: { role }, $set: { status: "active" } },
    { upsert: true },
  );
  await MembershipRequest.updateMany(
    { userId, ...spaceFilter(space), status: "pending" },
    { status: "approved", decidedAt: new Date() },
  );
  await recountMembers(space.community._id, space.sub?._id ?? null);
}

export async function joinSpace(
  viewer: IUser,
  space: Space,
  input: { message?: string; inviteCode?: string },
  access: SpaceAccess,
): Promise<JoinResult> {
  if (access.isMember) return { status: "already_member", message: `You're already in ${spaceLabel(space)}.` };
  // groups are private and nobody joins them: a group's owner or admins add people from the community
  if (space.sub) throw forbidden("Groups are private. Ask one of the group's admins to add you.");
  if (access.banned) throw forbidden("You can't join this one.");

  // 1) Invite link — the one way into a private space without approval.
  if (input.inviteCode) {
    await requireParentSeat(viewer, space);
    await consumeInvite(input.inviteCode, space);
    await addMember(space, viewer._id);
    return { status: "joined", message: `Welcome to ${spaceLabel(space)}.` };
  }

  // the points this community asks for, to join or to ask to (site admins never need any; Klique never asks)
  const short = pointsShort(space.community.minPointsJoin, null, gateOf(viewer), !!space.community.official);
  if (short) throw forbidden(`${space.community.name} needs ${short.toLocaleString("en-NG")} points to join. You have ${(viewer.points ?? 0).toLocaleString("en-NG")}.`);

  // 2) Open to this person (public community, or a group open to its parent's members).
  if (access.canJoinDirectly) {
    await addMember(space, viewer._id);
    return { status: "joined", message: `You joined ${spaceLabel(space)}.` };
  }

  // 3) Private community: ask an admin.
  if (!space.sub && space.community.privacy === "private") {
    if (access.pendingRequest) {
      return { status: "already_requested", message: "Your request is waiting for an admin." };
    }
    rateLimit(`join-request:${sid(viewer._id)}`, 10, 60 * 60 * 1000);
    const request = await MembershipRequest.create({
      userId: viewer._id,
      ...spaceFilter(space),
      message: input.message ?? "",
    });
    // the people who decide hear about it, bundled: one line per community however many ask
    const staff = await Membership.find({ communityId: space.community._id, subcommunityId: null, status: "active", role: { $in: ["owner", "admin"] } }).select("userId").lean<{ userId: Types.ObjectId }[]>();
    notify(
      staff.map((m) => m.userId),
      { title: `${viewer.displayName} wants to join ${space.community.name}`, body: input.message ? `"${input.message}"` : "Tap to review the request.", data: { href: `/communities/${space.community.slug}?settings=requests` } },
      { actorId: viewer._id, action: { kind: "communityRequest", slug: space.community.slug, requestId: sid(request._id) }, category: "admin", groupKey: `join-req:${sid(space.community._id)}`, many: (n) => `${n} people want to join ${space.community.name}`, ref: `requests:${sid(space.community._id)}` },
    );
    return { status: "requested", message: "Request sent. An admin will take a look." };
  }

  // 4) Everything else is closed.
  throw forbidden("You can't join this one.");
}

/**
 * Being in a group always means being in its parent community. An invite to a group of a public
 * community therefore also seats you in the community; for a private community you must already
 * be a member (or have been approved), so a group invite can never be a back door into it.
 */
async function requireParentSeat(viewer: IUser, space: Space) {
  if (!space.sub) return;
  const parent = await Membership.findOne({ userId: viewer._id, communityId: space.community._id, subcommunityId: null }).lean<IMembership>();
  if (parent?.status === "active") return;
  if (parent?.status === "banned") throw forbidden("You can't join this one.");
  if (space.community.privacy === "private") throw forbidden(`Join ${space.community.name} first, then use this invite.`);
  await Membership.updateOne({ userId: viewer._id, communityId: space.community._id, subcommunityId: null }, { $setOnInsert: { role: "member" }, $set: { status: "active" } }, { upsert: true });
  await recountMembers(space.community._id, null);
}

export async function leaveSpace(viewer: IUser, space: Space, access: SpaceAccess): Promise<{ left: boolean; cancelledRequest: boolean }> {
  if (!access.isMember) {
    const cancelled = await MembershipRequest.deleteOne({ userId: viewer._id, ...spaceFilter(space), status: "pending" });
    if (cancelled.deletedCount) return { left: false, cancelledRequest: true };
    throw conflict("You're not a member of this one.");
  }
  if (access.role === "owner") {
    throw conflict("Owners can't leave. Delete it instead, or ask a member to take over.");
  }
  if (!space.sub && isKlique(space.community)) throw conflict("Everyone's in Klique: it's where announcements and Klique's own events are, so it can't be left.");

  await Membership.deleteOne({ userId: viewer._id, ...spaceFilter(space) });
  await ChannelMember.deleteMany({ userId: viewer._id, ...spaceFilter(space) });
  await recountMembers(space.community._id, space.sub?._id ?? null);
  if (!space.sub) await dropParentOnlyGroups(space.community._id, [viewer._id]);
  // their crews here go with it (the leave button warned them)
  await leaveSpaceCrews(viewer._id, space.community._id, space.sub?._id ?? null);
  return { left: true, cancelledRequest: false };
}

/**
 * Group members are always members of the parent, so leaving or being removed from the
 * parent takes you out of its groups (and off their private channels) too.
 */
async function dropParentOnlyGroups(communityId: Types.ObjectId, userIds: Types.ObjectId[]) {
  const subs = await Subcommunity.find({ communityId }).select("_id").lean<{ _id: Types.ObjectId }[]>();
  if (!subs.length) return;
  await Membership.deleteMany({ userId: { $in: userIds }, subcommunityId: { $in: subs.map((s) => s._id) } });
  await ChannelMember.deleteMany({ userId: { $in: userIds }, communityId });
  await Promise.all(subs.map((s) => recountMembers(communityId, s._id)));
}

/* ------------------------------------------------------------------ */
/* Members & roles                                                     */
/* ------------------------------------------------------------------ */

export async function listMembers(
  viewer: IUser,
  space: Space,
  access: SpaceAccess,
  page: number,
  q?: string,
): Promise<Paginated<MemberDTO>> {
  // Member lists are for members only (even in public communities).
  if (!access.isMember) throw forbidden("Join to see who's in here.");

  const size = 24;
  const base: Record<string, unknown> = { ...spaceFilter(space), status: "active" as const };
  // Name search: match display name or handle, then keep only those people's memberships.
  if (q) {
    const rx = new RegExp(escapeRegex(q.replace(/^@/, "")), "i");
    const ids = await User.find({ $or: [{ displayName: rx }, { handle: rx }] }).select("_id").limit(1000).lean<{ _id: Types.ObjectId }[]>();
    base.userId = { $in: ids.map((u) => u._id) };
  }
  const [managers, rows] = await Promise.all([
    page === 1
      ? Membership.find({ ...base, role: { $in: ["owner", "admin"] } })
          .sort({ role: 1, createdAt: 1 }) // "admin" < "owner" alphabetically; fixed below
          .lean<IMembership[]>()
      : [],
    Membership.find({ ...base, role: "member" })
      .sort({ createdAt: 1 })
      .skip((page - 1) * size)
      .limit(size + 1)
      .lean<IMembership[]>(),
  ]);

  const hasMore = rows.length > size;
  const ordered = [...managers.sort((a, b) => (a.role === b.role ? 0 : a.role === "owner" ? -1 : 1)), ...rows.slice(0, size)];
  const briefs = await loadBriefs(ordered.map((m) => m.userId));

  const items: MemberDTO[] = ordered.flatMap((m) => {
    const user = briefs.get(sid(m.userId));
    if (!user) return [];
    const isSelf = sid(m.userId) === sid(viewer._id);
    return [
      {
        user,
        role: m.role,
        joinedAt: m.createdAt.toISOString(),
        canChangeRole: !isSelf && canSetRole(access.role, m.role, m.role === "admin" ? "member" : "admin"),
        canRemove: !isSelf && outranks(access.role, m.role),
      },
    ];
  });
  return { items, page, hasMore };
}

async function targetMembership(space: Space, userId: string): Promise<IMembership> {
  const m = await Membership.findOne({ userId, ...spaceFilter(space), status: "active" }).lean<IMembership>();
  if (!m) throw notFound("That person isn't a member.");
  return m;
}

export async function changeRole(viewer: IUser, space: Space, access: SpaceAccess, userId: string, role: Exclude<Role, "owner">) {
  assertCanManage(access);
  const target = await targetMembership(space, userId);
  if (sid(target.userId) === sid(viewer._id)) throw forbidden("You can't change your own role.");
  if (!canSetRole(access.role, target.role, role)) throw forbidden("Only the owner can change roles.");
  await Membership.updateOne({ _id: target._id }, { role });
  if (role !== target.role) {
    const href = space.sub ? `/communities/${space.community.slug}?g=${space.sub.slug}` : `/communities/${space.community.slug}`;
    notify(
      [target.userId],
      role === "admin"
        ? { title: `You're now an admin of ${spaceLabel(space)}`, body: `${viewer.displayName} made you an admin. You can manage members, channels and events there.`, data: { href } }
        : { title: `You're no longer an admin of ${spaceLabel(space)}`, body: "You're still a member.", data: { href } },
      { category: "community", ref: `community:${sid(space.community._id)}` },
    );
  }
  return { userId, role };
}

/** The owner hands the space to another member; they stay on as an admin. */
export async function transferOwnership(viewer: IUser, space: Space, access: SpaceAccess, userId: string) {
  if (access.role !== "owner") throw forbidden("Only the owner can hand this over.");
  const target = await targetMembership(space, userId);
  if (sid(target.userId) === sid(viewer._id)) throw conflict("You already own this.");
  await Membership.updateOne({ _id: target._id }, { role: "owner" });
  await Membership.updateOne({ userId: viewer._id, ...spaceFilter(space) }, { role: "admin" });
  if (space.sub) await Subcommunity.updateOne({ _id: space.sub._id }, { ownerId: target.userId });
  else await Community.updateOne({ _id: space.community._id }, { ownerId: target.userId });
  return { ownerId: userId };
}

export async function removeMember(viewer: IUser, space: Space, access: SpaceAccess, userId: string, ban: boolean) {
  assertCanManage(access);
  const target = await targetMembership(space, userId);
  if (sid(target.userId) === sid(viewer._id)) throw forbidden("Use “Leave” to remove yourself.");
  if (!outranks(access.role, target.role)) throw forbidden("You can't remove someone at or above your own rank.");

  if (ban) await Membership.updateOne({ _id: target._id }, { status: "banned", role: "member" });
  else await Membership.deleteOne({ _id: target._id });
  await ChannelMember.deleteMany({ userId: target.userId, ...spaceFilter(space) });

  await recountMembers(space.community._id, space.sub?._id ?? null);
  if (!space.sub) await dropParentOnlyGroups(space.community._id, [target.userId]);
  await leaveSpaceCrews(target.userId, space.community._id, space.sub?._id ?? null);
  return { userId, removed: true, banned: ban };
}

/* ------------------------------------------------------------------ */
/* Join requests (private communities)                                 */
/* ------------------------------------------------------------------ */

export async function listRequests(space: Space, access: SpaceAccess): Promise<MembershipRequestDTO[]> {
  assertCanManage(access);
  if (space.sub || space.community.privacy !== "private") return [];
  const rows = await MembershipRequest.find({ ...spaceFilter(space), status: "pending" })
    .sort({ createdAt: 1 })
    .limit(100)
    .lean<IMembershipRequest[]>();
  const briefs = await loadBriefs(rows.map((r) => r.userId));
  return rows.flatMap((r) => {
    const user = briefs.get(sid(r.userId));
    return user ? [{ id: sid(r._id), user, message: r.message, status: r.status, createdAt: r.createdAt.toISOString() }] : [];
  });
}

export async function decideRequest(
  viewer: IUser,
  space: Space,
  access: SpaceAccess,
  requestId: string,
  action: "approve" | "reject",
) {
  assertCanManage(access);
  const req = await MembershipRequest.findOne({ _id: requestId, ...spaceFilter(space), status: "pending" }).lean<IMembershipRequest>();
  if (!req) throw notFound("That request was already handled.");

  if (action === "approve") {
    const existing = await Membership.findOne({ userId: req.userId, ...spaceFilter(space) }).lean<IMembership>();
    if (existing?.status === "banned") throw forbidden("That person is banned from here.");
    await addMember(space, req.userId); // also marks the request approved
    await MembershipRequest.updateOne({ _id: req._id }, { decidedBy: viewer._id });
    notify([req.userId], { title: `You're in ${spaceLabel(space)}`, body: "Your request to join was approved. Come say hi.", data: { href: `/communities/${space.community.slug}` } }, { category: "community", ref: `community:${sid(space.community._id)}` });
  } else {
    await MembershipRequest.updateOne({ _id: req._id }, { status: "rejected", decidedBy: viewer._id, decidedAt: new Date() });
  }
  return { requestId, action };
}

/* ------------------------------------------------------------------ */
/* Invite links                                                        */
/* ------------------------------------------------------------------ */

const isInviteOnly = (space: Space) => !space.sub && space.community.privacy === "private";

function inviteActive(i: IInvitation, now = new Date()): { active: boolean; reason?: "expired" | "revoked" | "used_up" } {
  if (i.revokedAt) return { active: false, reason: "revoked" };
  if (i.expiresAt && i.expiresAt <= now) return { active: false, reason: "expired" };
  if (i.maxUses !== null && i.uses >= i.maxUses) return { active: false, reason: "used_up" };
  return { active: true };
}

const toInvite = (i: IInvitation): InviteDTO => ({
  id: sid(i._id),
  code: i.code,
  createdAt: i.createdAt.toISOString(),
  expiresAt: i.expiresAt ? i.expiresAt.toISOString() : null,
  maxUses: i.maxUses,
  uses: i.uses,
  revoked: !!i.revokedAt,
  active: inviteActive(i).active,
});

export async function listInvites(space: Space, access: SpaceAccess): Promise<InviteDTO[]> {
  assertCanManage(access);
  const rows = await Invitation.find({ ...spaceFilter(space) }).sort({ createdAt: -1 }).limit(50).lean<IInvitation[]>();
  return rows.map(toInvite);
}

export async function createInvite(
  viewer: IUser,
  space: Space,
  access: SpaceAccess,
  input: { expiresInDays?: number; maxUses?: number },
): Promise<InviteDTO> {
  if (space.sub) throw badRequest("Groups don't use invite links. Add people from the group's Members page.");
  assertCanManage(access);
  if (!isInviteOnly(space)) {
    throw badRequest("Invite links are for private spaces. Open ones can just share their normal link.");
  }
  const doc = await Invitation.create({
    code: newInviteCode(),
    ...spaceFilter(space),
    createdBy: viewer._id,
    expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
    maxUses: input.maxUses ?? null,
  });
  return toInvite(doc.toObject() as IInvitation);
}

export async function revokeInvite(space: Space, access: SpaceAccess, inviteId: string) {
  assertCanManage(access);
  const res = await Invitation.updateOne({ _id: inviteId, ...spaceFilter(space), revokedAt: null }, { revokedAt: new Date() });
  if (!res.matchedCount) throw notFound("That invite link doesn't exist or was already revoked.");
  return { inviteId, revoked: true };
}

/** Atomically use up one invite slot — validates the code belongs to THIS space. */
async function consumeInvite(code: string, space: Space) {
  const now = new Date();
  const updated = await Invitation.findOneAndUpdate(
    {
      code,
      ...spaceFilter(space),
      revokedAt: null,
      $and: [
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
        { $expr: { $or: [{ $eq: ["$maxUses", null] }, { $lt: ["$uses", "$maxUses"] }] } },
      ],
    },
    { $inc: { uses: 1 } },
  ).lean<IInvitation>();
  if (!updated) throw forbidden("That invite link isn't valid any more.");
}

async function loadInvite(code: string) {
  const invite = await Invitation.findOne({ code }).lean<IInvitation>();
  if (!invite) return null;
  const community = await Community.findById(invite.communityId).lean<ICommunity>();
  if (!community) return null;
  // group invite links stopped working when groups became add-only
  if (invite.subcommunityId) return null;
  const sub: ISubcommunity | null = null;
  return { invite, space: { community, sub } as Space };
}

/** What an invite link may show BEFORE joining. Deliberately minimal — no posts, members or events. */
export async function previewInvite(code: string, viewer: IUser | null): Promise<InvitePreviewDTO> {
  const loaded = await loadInvite(code);
  if (!loaded) return { code, valid: false, reason: "not_found", target: null, alreadyMember: false };

  const { invite, space } = loaded;
  const state = inviteActive(invite);
  const alreadyMember = viewer ? (await spaceAccess(space, viewer)).isMember : false;

  return {
    code,
    valid: state.active,
    reason: state.reason,
    alreadyMember,
    target: {
      kind: space.sub ? "subcommunity" : "community",
      name: space.sub ? space.sub.name : space.community.name,
      country: space.community.country ?? "NG",
      region: space.community.region ?? "",
      city: space.community.city,
      interest: space.community.interest,
      slug: space.sub ? space.sub.slug : space.community.slug,
      ...(space.sub ? { parentName: space.community.name, parentSlug: space.community.slug } : {}),
    },
  };
}

export async function acceptInvite(code: string, viewer: IUser): Promise<JoinResult & { slug: string; parentSlug?: string }> {
  const loaded = await loadInvite(code);
  if (!loaded) throw notFound("That invite link doesn't exist.");
  const { space } = loaded;
  const access = await spaceAccess(space, viewer);
  const result = await joinSpace(viewer, space, { inviteCode: code }, access);
  return {
    ...result,
    slug: space.sub ? space.sub.slug : space.community.slug,
    ...(space.sub ? { parentSlug: space.community.slug } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Posts / updates                                                     */
/* ------------------------------------------------------------------ */

export async function listPosts(viewer: IUser | null, space: Space, access: SpaceAccess, page: number): Promise<Paginated<PostDTO>> {
  assertCanView(access, "posts");
  const size = 10;
  const rows = await Post.find({ ...spaceFilter(space) })
    .sort({ pinned: -1, createdAt: -1 })
    .skip((page - 1) * size)
    .limit(size + 1)
    .lean<IPost[]>();
  const items = await toPosts(rows.slice(0, size), { canDelete: (p) => canDeletePost(viewer, access, p, space) });
  return { items, page, hasMore: rows.length > size };
}

function canDeletePost(viewer: IUser | null, access: SpaceAccess, post: IPost, space: Space) {
  if (!viewer) return false;
  if (sid(post.authorId) === sid(viewer._id)) return true;
  if (access.canManage) return true;
  return !!space.sub && access.canModerate;
}

export async function createPost(viewer: IUser, space: Space, access: SpaceAccess, input: { body: string; imageUrl?: string | null }) {
  assertCanPost(access);
  rateLimit(`post:${sid(viewer._id)}`, 20, 10 * 60 * 1000);
  const doc = await Post.create({
    ...spaceFilter(space),
    authorId: viewer._id,
    body: input.body,
    imageUrl: input.imageUrl || null,
  });
  const [dto] = await toPosts([doc.toObject() as IPost], { canDelete: () => true });
  return dto;
}

export async function deletePost(viewer: IUser, space: Space, access: SpaceAccess, postId: string) {
  assertCanView(access, "this post");
  const post = await Post.findOne({ _id: postId, ...spaceFilter(space) }).lean<IPost>();
  if (!post) throw notFound("That post is gone.");
  if (!canDeletePost(viewer, access, post, space)) throw forbidden("You can only delete your own posts.");
  await Post.deleteOne({ _id: post._id });
  deleteUploads([post.imageUrl]);
  return { postId, deleted: true };
}
