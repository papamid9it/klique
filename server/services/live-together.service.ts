import "server-only";
import { Types } from "mongoose";
import type { LiveDTO, UserBrief } from "@/lib/types";
import { badRequest, conflict, forbidden, notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import { LiveStream, TwitchLink, YouTubeLink, type ILiveGuest, type ILiveStream } from "../models/Live";
import { Membership } from "../models/Membership";
import { User, type IUser } from "../models/User";
import { escapeRegex, sid } from "./helpers";
import { loadBriefs } from "../serializers";
import { emitTogether, guestOn, guestsOf, INVITE_MS, liveNotice, MAX_GUESTS, mayModerate, staffOf, toLive, youtubeId } from "./live.service";
import { notify } from "./push.service";
import { hiddenUserIds } from "./blocks";
import { resolveSpaceFor } from "./spaces.service";
import { ensureLiveSubscriptions, twitchIsLive, twitchLinkOf } from "./twitch.service";
import { youtubeFinish, youtubeOwnsBroadcast } from "./youtube.service";

/**
 * Live together: the host asks up to 3 members of the community to go live with them. Each guest streams from their
 * own phone to their own Twitch or YouTube (so it still costs Klique nothing), and Klique shows the streams side by
 * side, with one chat. Gifts go to the host. The host (and the community's moderators) can take a guest off; a guest
 * can leave; when the host ends, it's over for everyone.
 */
export type TogetherInput =
  | { action: "invite" | "cancel" | "remove" | "main"; userId: string }
  | { action: "accept" | "decline" | "leave" }
  | { action: "join"; provider: "twitch" | "youtube"; broadcastId?: string; link?: string };

const ACTIVE = { $in: ["waiting", "live"] as ("waiting" | "live")[] };

export async function liveTogether(viewer: IUser, slug: string, input: TogetherInput): Promise<LiveDTO> {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  const community = space.community;
  const s = await LiveStream.findOne({ communityId: community._id, status: ACTIVE }).lean<ILiveStream>();
  if (!s) throw notFound("Nobody's live here now.");
  const me = sid(viewer._id);
  const isHost = me === sid(s.hostId);
  const guests = guestsOf(s);
  const mine = guests.find((g) => sid(g.userId) === me);
  const done = async () => {
    emitTogether(community._id);
    const now = (await LiveStream.findById(s._id).lean<ILiveStream>()) ?? s;
    return toLive(now, viewer, staffOf(access, viewer));
  };
  const nameOf = async (id: Types.ObjectId) => (await User.findById(id).select("displayName").lean<{ displayName: string }>())?.displayName ?? "Someone";
  const finish = (g: ILiveGuest) => {
    if (g.provider === "youtube" && g.ytBroadcast && g.channel) void youtubeFinish(g.userId, g.channel);
  };

  if (input.action === "invite") {
    if (!isHost) throw forbidden("Only the person streaming can ask people to join.");
    if (s.status !== "live") throw badRequest("Ask people once you're live.");
    if (!Types.ObjectId.isValid(input.userId)) throw notFound("We couldn't find them.");
    const target = new Types.ObjectId(input.userId);
    if (sid(target) === me) throw badRequest("That's you.");
    if ((s.kickedIds ?? []).some((k) => sid(k) === sid(target))) throw forbidden("They were removed from this live.");
    if (guests.some((g) => sid(g.userId) === sid(target))) throw conflict("They're in it already (or asked).");
    if (guests.length >= MAX_GUESTS) throw conflict(`Up to ${MAX_GUESTS} people can go live with you.`);
    // someone you blocked, or who blocked you: no invite (and no notification from you)
    if ((await hiddenUserIds(viewer._id)).some((h) => sid(h) === sid(target))) throw forbidden("You can't invite them.");
    const [member, tw, yt, busy] = await Promise.all([
      Membership.exists({ userId: target, communityId: community._id, subcommunityId: null, status: "active" }),
      TwitchLink.exists({ userId: target }),
      YouTubeLink.exists({ userId: target }),
      LiveStream.exists({ _id: { $ne: s._id }, status: ACTIVE, $or: [{ hostId: target }, { guests: { $elemMatch: { userId: target, status: { $in: ["waiting", "live"] } } } }] }),
    ]);
    if (!member) throw forbidden(`Only members of ${community.name} can join.`);
    if (!tw && !yt) throw badRequest("They need to connect Twitch or YouTube first.");
    if (busy) throw conflict("They're live somewhere else right now.");
    rateLimit(`live-invite:${me}`, 30, 60 * 60 * 1000);
    // asking the same person again and again (cancel, ask, cancel…) isn't a stream of notifications for them
    rateLimit(`live-invite:${me}:${sid(target)}`, 3, 60 * 60 * 1000);
    // an old invite that lapsed goes first
    await LiveStream.updateOne({ _id: s._id }, { $pull: { guests: { userId: target } } });
    await LiveStream.updateOne({ _id: s._id }, { $push: { guests: { userId: target, status: "invited", invitedAt: new Date() } } });
    // two invites at the same moment: no more than 3 all the same (the later one comes back off)
    const after = await LiveStream.findById(s._id).select("guests").lean<Pick<ILiveStream, "guests">>();
    if (guestsOf(after ?? {}).length > MAX_GUESTS) {
      await LiveStream.updateOne({ _id: s._id }, { $pull: { guests: { userId: target } } });
      throw conflict(`Up to ${MAX_GUESTS} people can go live with you.`);
    }
    notify(
      [target],
      { title: `${viewer.displayName} wants you on their live`, body: `In ${community.name}. Say yes in the next 2 minutes.`, data: { href: `/communities/${community.slug}` } },
      { actorId: viewer._id, category: "community", ref: `liveinvite:${sid(s._id)}:${sid(target)}` },
    );
    return done();
  }

  if (input.action === "cancel" || input.action === "remove") {
    if (!Types.ObjectId.isValid(input.userId)) throw notFound("We couldn't find them.");
    const g = guests.find((x) => sid(x.userId) === input.userId);
    if (!g) throw notFound("They aren't in this live.");
    if (!isHost && !mayModerate(viewer, access, s)) throw forbidden("Only the person streaming and the community's moderators can do that.");
    await LiveStream.updateOne({ _id: s._id }, { $pull: { guests: { userId: g.userId } }, ...(s.mainId && sid(s.mainId) === sid(g.userId) ? { $set: { mainId: null } } : {}) });
    finish(g);
    if (g.joinedAt) await liveNotice(s._id, viewer._id, `${await nameOf(g.userId)} was removed from the live`);
    return done();
  }

  if (input.action === "main") {
    if (!isHost) throw forbidden("Only the person streaming can choose the big box.");
    const to = input.userId === sid(s.hostId) ? null : guests.find((g) => sid(g.userId) === input.userId && g.status === "live");
    if (to === undefined) throw notFound("They aren't streaming in it.");
    await LiveStream.updateOne({ _id: s._id }, { $set: { mainId: to ? to.userId : null } });
    return done();
  }

  // the guest's own actions
  if (!mine) throw notFound(input.action === "leave" ? "You aren't in this live." : "That invite has run out.");
  // saying yes or joining: still a member (they may have left the community since)
  if ((input.action === "accept" || input.action === "join") && !(await Membership.exists({ userId: viewer._id, communityId: community._id, subcommunityId: null, status: "active" }))) {
    await LiveStream.updateOne({ _id: s._id }, { $pull: { guests: { userId: viewer._id } } });
    throw forbidden(`Only members of ${community.name} can join.`);
  }

  if (input.action === "decline") {
    await LiveStream.updateOne({ _id: s._id }, { $pull: { guests: { userId: viewer._id } } });
    return done();
  }

  if (input.action === "leave") {
    await LiveStream.updateOne({ _id: s._id }, { $pull: { guests: { userId: viewer._id } }, ...(s.mainId && sid(s.mainId) === me ? { $set: { mainId: null } } : {}) });
    finish(mine);
    if (mine.joinedAt) await liveNotice(s._id, viewer._id, `${viewer.displayName} left the live`);
    return done();
  }

  if (input.action === "accept") {
    if (mine.status !== "invited") return done();
    if (Date.now() - +mine.invitedAt >= INVITE_MS) throw badRequest("That invite has run out. Ask them to invite you again.");
    // a few minutes to get the camera going
    await LiveStream.updateOne({ _id: s._id, "guests.userId": viewer._id }, { $set: { "guests.$.status": "waiting", "guests.$.waitingSince": new Date() } });
    return done();
  }

  // join: their stream is starting (the camera on the go-live screen)
  if (input.action !== "join") throw badRequest("We didn't understand that.");
  if (mine.status === "invited") throw badRequest("Say yes to the invite first.");
  rateLimit(`live-guest:${me}`, 20, 60 * 60 * 1000);
  if (input.provider === "youtube") {
    let channel: string | null = null;
    let ytBroadcast = false;
    if (input.broadcastId) {
      if (!(await youtubeOwnsBroadcast(viewer._id, input.broadcastId))) throw badRequest("That YouTube broadcast isn't yours. Try again.");
      channel = input.broadcastId;
      ytBroadcast = true;
    } else {
      channel = youtubeId(input.link ?? "");
      if (!channel) throw badRequest("Paste the link to your YouTube live stream (youtube.com/live/… or youtu.be/…).");
    }
    await LiveStream.updateOne({ _id: s._id, "guests.userId": viewer._id }, { $set: { "guests.$.provider": "youtube", "guests.$.channel": channel, "guests.$.ytBroadcast": ytBroadcast || undefined, "guests.$.seenAt": new Date() } });
    await guestOn(s, viewer._id);
    return done();
  }
  const link = await twitchLinkOf(viewer._id);
  if (!link) throw badRequest("Connect Twitch first (Settings → Connections).");
  void ensureLiveSubscriptions(viewer._id).catch((err) => console.warn("[twitch] subscriptions:", (err as Error)?.message));
  await LiveStream.updateOne({ _id: s._id, "guests.userId": viewer._id }, { $set: { "guests.$.provider": "twitch", "guests.$.channel": link.login, "guests.$.status": "waiting", "guests.$.waitingSince": new Date() } });
  if (await twitchIsLive(link.twitchId)) await guestOn(s, viewer._id);
  return done();
}

/**
 * Who the host can ask (the invite sheet): members of the community, the most recently around first, or the ones
 * whose name or @handle matches. Each says whether they can join (they've connected Twitch or YouTube) or why not.
 */
export async function togetherCandidates(viewer: IUser, slug: string, q: string): Promise<{ user: UserBrief; can: boolean; note: string }[]> {
  const { space } = await resolveSpaceFor(viewer, slug);
  const s = await LiveStream.findOne({ communityId: space.community._id, status: ACTIVE }).lean<ILiveStream>();
  if (!s || sid(s.hostId) !== sid(viewer._id)) throw forbidden("Only the person streaming can ask people to join.");
  rateLimit(`together-search:${sid(viewer._id)}`, 120, 60_000);
  // not people you blocked or who blocked you
  const hidden = await hiddenUserIds(viewer._id);
  const skip = new Set([sid(s.hostId), ...guestsOf(s).map((g) => sid(g.userId)), ...(s.kickedIds ?? []).map(sid), ...hidden.map(sid)]);
  const text = q.trim().replace(/^@/, "").slice(0, 40);
  let ids: Types.ObjectId[];
  if (text) {
    // the start of their name or @handle, like @mentions (quick on a big Klique)
    const re = new RegExp(`^${escapeRegex(text)}`, "i");
    const users = await User.find({ $or: [{ displayName: re }, { handle: re }] }).select("_id").limit(300).lean<{ _id: Types.ObjectId }[]>();
    const ms = await Membership.find({ communityId: space.community._id, subcommunityId: null, status: "active", userId: { $in: users.map((u) => u._id) } }).select("userId").limit(60).lean<{ userId: Types.ObjectId }[]>();
    ids = ms.map((m) => m.userId);
  } else {
    const ms = await Membership.find({ communityId: space.community._id, subcommunityId: null, status: "active" }).select("userId").limit(2000).lean<{ userId: Types.ObjectId }[]>();
    const seen = await User.find({ _id: { $in: ms.map((m) => m.userId) } }).sort({ lastSeenAt: -1 }).select("_id").limit(60).lean<{ _id: Types.ObjectId }[]>();
    ids = seen.map((u) => u._id);
  }
  ids = ids.filter((id) => !skip.has(sid(id))).slice(0, 40);
  if (!ids.length) return [];
  const [briefs, tw, yt, busy] = await Promise.all([
    loadBriefs(ids),
    TwitchLink.find({ userId: { $in: ids } }).select("userId").lean<{ userId: Types.ObjectId }[]>(),
    YouTubeLink.find({ userId: { $in: ids } }).select("userId").lean<{ userId: Types.ObjectId }[]>(),
    LiveStream.find({ _id: { $ne: s._id }, status: ACTIVE, $or: [{ hostId: { $in: ids } }, { "guests.userId": { $in: ids } }] }).select("hostId guests.userId").lean<Pick<ILiveStream, "hostId" | "guests">[]>(),
  ]);
  const twitch = new Set(tw.map((x) => sid(x.userId)));
  const youtube = new Set(yt.map((x) => sid(x.userId)));
  const elsewhere = new Set(busy.flatMap((b) => [sid(b.hostId), ...(b.guests ?? []).map((g) => sid(g.userId))]));
  const rows = ids.flatMap((id) => {
    const user = briefs.get(sid(id));
    if (!user) return [];
    const k = sid(id);
    if (elsewhere.has(k)) return [{ user, can: false, note: "Live somewhere else" }];
    if (!twitch.has(k) && !youtube.has(k)) return [{ user, can: false, note: "Hasn’t connected Twitch or YouTube" }];
    return [{ user, can: true, note: twitch.has(k) && youtube.has(k) ? "Twitch · YouTube" : twitch.has(k) ? "Twitch" : "YouTube" }];
  });
  // the ones who can join first
  return rows.sort((a, b) => Number(b.can) - Number(a.can));
}
