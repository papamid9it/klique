import "server-only";
import { nairaPerUsd } from "@/lib/gifts";
import { youtubeFinish, youtubeOwnsBroadcast } from "./youtube.service";
import { Types } from "mongoose";
import type { LiveDTO, LiveGuestDTO, LiveNowDTO, LiveSummaryDTO, UserBrief } from "@/lib/types";
import { badRequest, conflict, forbidden, notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import type { ICommunity } from "../models/Community";
import { Event } from "../models/Event";
import { LiveStream, type ILiveGuest, type ILiveStream } from "../models/Live";
import { Membership, type IMembership } from "../models/Membership";
import { Rsvp } from "../models/Rsvp";
import { User, type IUser } from "../models/User";
import { can, type SpaceAccess } from "../policies/access";
import { isSiteAdmin } from "../policies/hosting";
import { standingOf } from "../policies/standing";
import { GHOST, loadBriefs } from "../serializers";
import { sid } from "./helpers";
import { notify } from "./push.service";
import { publish, rtChannel } from "./realtime";
import { resolveSpaceFor } from "./spaces.service";
import { ensureLiveSubscriptions, twitchIsLive, twitchLinkOf, twitchLiveState, twitchSetTitle } from "./twitch.service";

/**
 * Live streams in communities: one at a time per community (or from one of its events), streamed on Twitch or
 * YouTube and watched inside Klique (their player, Klique's page around it), so the video costs Klique nothing.
 * Who may go live: the owner and admins, roles with "Go live", and members the owner gave a pass to for a while.
 * Twitch: Klique waits for Twitch to say the stream started (EventSub), then shows LIVE and tells the members; it ends
 * when Twitch says it's off. YouTube (a link, until Google approves connecting): live when posted, until its host
 * ends it. Not in 18+ communities, nor ones Klique restricted or suspended.
 */

/** a Twitch stream that never started stops waiting after this; a YouTube one is over after a day */
const WAIT_MS = 2 * 60 * 60 * 1000;
const YOUTUBE_MAX_MS = 24 * 60 * 60 * 1000;

export const staffOf = (access: SpaceAccess, viewer: IUser | null) => access.canManage || (!!viewer && isSiteAdmin(viewer));

/** May go live here: staff, a role with "Go live", or a pass still running (and the community allows it). */
export async function canGoLive(viewer: IUser | null, community: ICommunity, access: SpaceAccess): Promise<boolean> {
  if (!viewer || community.adult || standingOf(community)) return false;
  if (staffOf(access, viewer) || can(access, "goLive")) return true;
  if (!access.isMember) return false;
  const m = await Membership.findOne({ userId: viewer._id, communityId: community._id, subcommunityId: null, status: "active" }).select("livePassUntil").lean<Pick<IMembership, "livePassUntil">>();
  return !!m?.livePassUntil && +new Date(m.livePassUntil) > Date.now();
}

/** Over by now: a Twitch stream that never started, or a YouTube one a day old. Ended on the spot. */
async function stale(s: ILiveStream): Promise<boolean> {
  // a camera stream on YouTube whose phone stopped checking in (the app closed or crashed): over, not live for a day
  // (only streams that keep that time: ones started before it was kept fall back to the day)
  const gone = s.status === "live" && !!s.ytBroadcast && !!s.hostSeenAt && Date.now() - +s.hostSeenAt > PHONE_GONE_MS;
  const old = gone || (s.status === "waiting" && Date.now() - +s.createdAt > WAIT_MS) || (s.provider === "youtube" && s.startedAt && Date.now() - +s.startedAt > YOUTUBE_MAX_MS);
  if (old) {
    const r = await LiveStream.updateOne({ _id: s._id, status: s.status }, { $set: { status: "ended", endedAt: new Date() } });
    if (r.modifiedCount) ended(s);
  }
  return !!old;
}

/** a phone that hasn't checked in for this long has stopped streaming */
const PHONE_GONE_MS = 5 * 60 * 1000;

/**
 * Over: everyone's page hears it, and the YouTube broadcasts Klique made for it (the host's, the guests') are finished
 * on YouTube too. However it ended (End, Twitch going off, the phone gone, a day passing).
 */
function ended(s: Pick<ILiveStream, "communityId" | "status" | "provider" | "ytBroadcast" | "hostId" | "channel" | "guests">) {
  if (s.status === "live") emitLive(s.communityId, false);
  if (s.provider === "youtube" && s.ytBroadcast) void youtubeFinish(s.hostId, s.channel);
  for (const g of s.guests ?? []) if (g.provider === "youtube" && g.ytBroadcast && g.channel) void youtubeFinish(g.userId, g.channel);
}

/** when each phone last checked in, per server (written at most every 20 seconds) */
const seenWrite = new Map<string, number>();
/** The host's or a guest's go-live screen asked for the stream: their phone is still there (see PHONE_GONE_MS). */
async function phoneSeen(s: ILiveStream, viewer: IUser | null) {
  if (!viewer) return;
  const me = sid(viewer._id);
  const host = me === sid(s.hostId) && !!s.ytBroadcast;
  const guest = (s.guests ?? []).find((g) => sid(g.userId) === me && g.ytBroadcast && g.status === "live");
  if (!host && !guest) return;
  const key = `${sid(s._id)}:${me}`;
  if (Date.now() - (seenWrite.get(key) ?? 0) < 20_000) return;
  seenWrite.set(key, Date.now());
  if (seenWrite.size > 2000) seenWrite.clear();
  if (host) await LiveStream.updateOne({ _id: s._id }, { $set: { hostSeenAt: new Date() } });
  else await LiveStream.updateOne({ _id: s._id, "guests.userId": viewer._id }, { $set: { "guests.$.seenAt": new Date() } });
}

/** Live together: an invite is good for this long */
export const INVITE_MS = 2 * 60 * 1000;
/** a guest who said yes but isn't streaming yet (or whose stream dropped) is taken off after this */
export const GUEST_WAIT_MS = 5 * 60 * 1000;
/** at most this many people with the host */
export const MAX_GUESTS = 3;
/** the guests still in it (an invite nobody answered in time has lapsed) */
export const guestsOf = (s: Pick<ILiveStream, "guests">): ILiveGuest[] => (s.guests ?? []).filter((g) => g.status !== "invited" || Date.now() - +g.invitedAt < INVITE_MS);

/** The guests as a viewer sees them: everyone sees the ones streaming (and ones coming back); the host and staff see all. */
function guestsFor(s: ILiveStream, viewer: IUser | null, staff: boolean, briefs: Map<string, UserBrief>): Pick<LiveDTO, "guests" | "mainId" | "invitedMe" | "guestMe"> {
  const all = guestsOf(s);
  const me = viewer ? sid(viewer._id) : "";
  const runs = staff || me === sid(s.hostId);
  const shown = all.filter((g) => runs || sid(g.userId) === me || g.status === "live" || (g.status === "waiting" && !!g.joinedAt));
  const mine = all.find((g) => sid(g.userId) === me);
  const mainId = s.mainId;
  const main = mainId && all.some((g) => sid(g.userId) === sid(mainId) && g.status === "live") ? sid(mainId) : null;
  const guests: LiveGuestDTO[] = shown.map((g) => ({
    user: briefs.get(sid(g.userId)) ?? GHOST,
    status: g.status,
    provider: g.provider ?? null,
    channel: g.channel ?? null,
    ...(g.status === "invited" ? { until: new Date(+g.invitedAt + INVITE_MS).toISOString() } : {}),
    ...(g.provider === "twitch" || g.ytBroadcast ? { phone: true } : {}),
  }));
  return {
    ...(guests.length ? { guests } : {}),
    ...(main ? { mainId: main } : {}),
    ...(mine?.status === "invited" ? { invitedMe: new Date(+mine.invitedAt + INVITE_MS).toISOString() } : {}),
    ...(mine && mine.status !== "invited" ? { guestMe: true } : {}),
  };
}

export async function toLive(s: ILiveStream, viewer: IUser | null, staff: boolean): Promise<LiveDTO> {
  const [briefs, viewers] = await Promise.all([loadBriefs([s.hostId, ...guestsOf(s).map((g) => g.userId)]), viewersOf(s._id)]);
  const host = briefs.get(sid(s.hostId)) ?? GHOST;
  return { id: sid(s._id), provider: s.provider, channel: s.channel, title: s.title, status: s.status === "live" ? "live" : "waiting", host, startedAt: s.startedAt?.toISOString() ?? null, eventId: s.eventId ? sid(s.eventId) : null, canEnd: staff || (!!viewer && sid(viewer._id) === sid(s.hostId)), viewers, ...(fromPhone(s) ? { phone: true } : {}), ...guestsFor(s, viewer, staff, briefs) };
}

/**
 * Streamed upright from the Klique app's camera: a YouTube broadcast Klique made, or any Twitch stream (Twitch is only
 * started from the app's camera now). Full screen fills the card with it, with no black strips above and below.
 */
const fromPhone = (s: Pick<ILiveStream, "provider" | "ytBroadcast">) => !!s.ytBroadcast || s.provider === "twitch";

/** a player that hasn't said "still watching" for this long no longer counts */
const WATCHING_MS = 45_000;
/** viewer counts, kept 10 seconds (every player asks every 30 seconds: one count serves them all) */
const viewerCounts = new Map<string, { n: number; at: number }>();
/** People watching a stream right now. */
export async function viewersOf(liveId: Types.ObjectId): Promise<number> {
  const key = sid(liveId);
  const hit = viewerCounts.get(key);
  if (hit && Date.now() - hit.at < 4_000) return hit.n;
  const { LiveViewer } = await import("../models/Live");
  const n = await LiveViewer.countDocuments({ liveId, seenAt: { $gte: new Date(Date.now() - WATCHING_MS) } });
  if (viewerCounts.size > 500) viewerCounts.clear();
  viewerCounts.set(key, { n, at: Date.now() });
  return n;
}

/** the "watching counts as coming after" minutes (Admin → Points), read at most once a minute */
let attendMinutes: { n: number; at: number } | null = null;
async function streamAttendMinutes(): Promise<number> {
  if (attendMinutes && Date.now() - attendMinutes.at < 60_000) return attendMinutes.n;
  const { getPointsConfig } = await import("./points.service");
  attendMinutes = { n: (await getPointsConfig()).streamAttendMinutes, at: Date.now() };
  return attendMinutes.n;
}

/**
 * The player says "still watching" every 30 seconds (signed in: by person; otherwise a random key of the browser's).
 * Counts them, keeps the stream's peak and how many different people watched, and answers how many are on now.
 */
export async function watching(viewer: IUser | null, slug: string, input: { liveId: string; key?: string; first?: boolean }) {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (!access.canView || !Types.ObjectId.isValid(input.liveId)) throw notFound("We couldn't find that stream.");
  const key = viewer ? sid(viewer._id) : input.key && /^[A-Za-z0-9_-]{8,64}$/.test(input.key) ? `anon:${input.key}` : null;
  const liveId = new Types.ObjectId(input.liveId);
  const s = await LiveStream.findOne({ _id: liveId, communityId: space.community._id, status: "live" }).select("_id hostId eventId kickedIds").lean<{ _id: Types.ObjectId; hostId: Types.ObjectId; eventId: Types.ObjectId | null; kickedIds?: Types.ObjectId[] }>();
  if (!s) return { viewers: 0, live: false };
  // removed from it: not counted, and no "joined"
  if (viewer && (s.kickedIds ?? []).some((k) => sid(k) === sid(viewer._id))) return { viewers: 0, live: false };
  // the person streaming isn't one of their own viewers
  if (key && key !== sid(s.hostId)) {
    rateLimit(`watching:${key}`, 20, 60_000);
    const { LiveViewer } = await import("../models/Live");
    const before = await LiveViewer.findOneAndUpdate({ liveId, key }, { $set: { seenAt: new Date() }, $setOnInsert: { firstSeenAt: new Date() } }, { upsert: true, returnDocument: "before" }).select("seenAt").lean<{ seenAt: Date }>();
    if (!before) await LiveStream.updateOne({ _id: liveId }, { $inc: { watched: 1 } });
    // they've just come in (the player's first check-in, the first time, or back after a minute away): "Amara joined"
    // over the video for everyone watching (never stored in the chat), and kept on their row for screens that poll
    if (viewer && (input.first || !before || Date.now() - +before.seenAt > 60_000)) {
      await LiveViewer.updateOne({ liveId, key }, { $set: { joinedAt: new Date() } });
      // the count kept for a few seconds is out of date now: the streamer's eye number goes up at once
      viewerCounts.delete(sid(liveId));
      publish([rtChannel.community(space.community._id)], { type: "liveJoin", liveId: sid(liveId), name: viewer.displayName, avatarUrl: viewer.avatarUrl ?? null });
    }
    // a streamed event: watching long enough (Admin → Points) counts as coming (marked there, points for them and the host)
    if (viewer && s.eventId) {
      const minutes = await streamAttendMinutes();
      const counted = await LiveViewer.findOneAndUpdate({ liveId, key, counted: { $ne: true }, firstSeenAt: { $lte: new Date(Date.now() - minutes * 60_000) } }, { $set: { counted: true } }).lean();
      if (counted) {
        const { attendedStream } = await import("./attendance.service");
        await attendedStream(s.eventId, viewer._id).catch((err) => console.warn("[live] attendance:", (err as Error)?.message));
      }
    }
  }
  const viewers = await viewersOf(liveId);
  await LiveStream.updateOne({ _id: liveId, peakViewers: { $lt: viewers } }, { $set: { peakViewers: viewers } });
  return { viewers, live: true };
}

/**
 * Who came in since `after` (newest last, up to 10): for a stream screen without the live connection, which asks every
 * few seconds instead (the person streaming sees who joined either way).
 */
export async function recentJoins(viewer: IUser | null, slug: string, liveId: string, after: string | null) {
  const { access } = await resolveSpaceFor(viewer, slug);
  if (!access.canView || !Types.ObjectId.isValid(liveId)) throw notFound("We couldn't find that stream.");
  const since = after && !Number.isNaN(Date.parse(after)) ? new Date(Math.max(Date.parse(after), Date.now() - 5 * 60_000)) : new Date(Date.now() - 15_000);
  const { LiveViewer } = await import("../models/Live");
  const rows = await LiveViewer.find({ liveId: new Types.ObjectId(liveId), joinedAt: { $gt: since } }).sort({ joinedAt: 1 }).limit(10).select("key joinedAt").lean<{ key: string; joinedAt: Date }[]>();
  const people = rows.filter((r) => Types.ObjectId.isValid(r.key));
  const briefs = await loadBriefs(people.map((r) => new Types.ObjectId(r.key)));
  return people.flatMap((r) => {
    const b = briefs.get(r.key);
    return b ? [{ name: b.displayName, avatarUrl: b.avatarUrl ?? null, at: r.joinedAt.toISOString() }] : [];
  });
}

/** They closed the player (or left the app): off the count at once, not when their check-ins stop. */
export async function leftStream(viewer: IUser | null, input: { liveId: string; key?: string }) {
  const key = viewer ? sid(viewer._id) : input.key && /^[A-Za-z0-9_-]{8,64}$/.test(input.key) ? `anon:${input.key}` : null;
  if (!key || !Types.ObjectId.isValid(input.liveId)) return { left: true };
  const { LiveViewer } = await import("../models/Live");
  // the row stays (it remembers when they started, for counting as coming); it just stops counting as watching
  await LiveViewer.updateOne({ liveId: new Types.ObjectId(input.liveId), key }, { $set: { seenAt: new Date(0) } });
  viewerCounts.delete(input.liveId);
  return { left: true };
}

/** "How it went": for its host (and the people who run the community), once it's over or any time during it. */
export async function liveSummary(viewer: IUser, slug: string, liveId: string): Promise<LiveSummaryDTO> {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (!Types.ObjectId.isValid(liveId)) throw notFound("We couldn't find that stream.");
  const s = await LiveStream.findOne({ _id: liveId, communityId: space.community._id }).lean<ILiveStream>();
  if (!s) throw notFound("We couldn't find that stream.");
  if (sid(s.hostId) !== sid(viewer._id) && !staffOf(access, viewer)) throw forbidden("Only its host sees this.");
  const [{ Channel, ChannelMessage }, { GiftSend }] = await Promise.all([import("../models/Channel"), import("../models/Gift")]);
  const chat = await Channel.findOne({ topicId: s._id }).select("_id").lean<{ _id: Types.ObjectId }>();
  const [messages, gifts] = await Promise.all([
    // what people wrote: not the gift lines or Klique's own ("… joined the live")
    chat ? ChannelMessage.countDocuments({ channelId: chat._id, deletedAt: null, webhook: null, notice: { $ne: true }, "cards.0": { $exists: false } }) : 0,
    GiftSend.aggregate<{ hype: number; earned: number; givers: Types.ObjectId[] }>([{ $match: { "target.type": "live", "target.id": s._id, status: "sent" } }, { $group: { _id: null, hype: { $sum: "$hype" }, earned: { $sum: "$receiverAmount" }, givers: { $addToSet: "$fromId" } } }]),
  ]);
  const from = s.startedAt ?? s.createdAt;
  const to = s.endedAt ?? new Date();
  const g = gifts[0];
  // outside Nigeria, what they earned shows in dollars (Google Play's rate), as on their Earnings page
  const abroad = !!viewer.country && viewer.country.toUpperCase() !== "NG";
  const usdRate = abroad ? nairaPerUsd(await (await import("./gifts.service")).getGiftConfig()) : null;
  return { title: s.title, communityName: space.community.name, duration: Math.max(0, Math.round((+to - +from) / 1000)), peakViewers: s.peakViewers ?? 0, watched: s.watched ?? 0, messages, hype: g?.hype ?? 0, givers: g?.givers.length ?? 0, earned: g?.earned ?? 0, ...(usdRate ? { usdRate } : {}) };
}

/** The community's stream now, for its page: live for everyone who can see it; waiting only for its host and staff. */
export async function liveOf(viewer: IUser | null, community: ICommunity, access: SpaceAccess): Promise<LiveDTO | null> {
  if (!access.canView) return null;
  let s = await LiveStream.findOne({ communityId: community._id, status: { $in: ["waiting", "live"] } }).lean<ILiveStream>();
  if (!s || (await stale(s))) return null;
  // in case Twitch's own message doesn't reach us: ask Twitch now and then (the waiting screens check every few seconds)
  if (s.provider === "twitch") {
    s = await checkTwitch(s);
    if (!s) return null;
  }
  if (s.guests?.length) s = await checkGuests(s);
  await phoneSeen(s, viewer);
  const staff = staffOf(access, viewer);
  // removed from this stream: it doesn't show for them
  if (viewer && (s.kickedIds ?? []).some((k) => sid(k) === sid(viewer._id))) return null;
  if (s.status === "waiting" && !staff && !(viewer && sid(viewer._id) === sid(s.hostId))) return null;
  return toLive(s, viewer, staff);
}

/** when each Twitch stream was last checked with Twitch (per server; enough to keep it to a few calls a minute) */
const lastCheck = new Map<string, number>();
/** a stream that went quiet on Twitch: ended after this long off (a short drop while live isn't the end) */
const OFF_GRACE_MS = 3 * 60 * 1000;
const offSince = new Map<string, number>();

/**
 * Asks Twitch whether a stream is on (every 8 seconds while it's starting, every minute while it's live): a waiting
 * stream that's on goes LIVE and members are told; a live one that's been off for a few minutes ends. Twitch's own
 * messages (EventSub) normally do this first; this is the backup. Returns the stream as it is now (null: ended).
 */
async function checkTwitch(s: ILiveStream): Promise<ILiveStream | null> {
  const key = sid(s._id);
  // just pressed Go live: ask Twitch every 3 seconds, so LIVE shows as soon as it's on (one small request each)
  const every = s.status === "waiting" ? 3_000 : 60_000;
  if (Date.now() - (lastCheck.get(key) ?? 0) < every) return s;
  lastCheck.set(key, Date.now());
  if (lastCheck.size > 500) lastCheck.clear();
  const link = await (await import("../models/Live")).TwitchLink.findOne({ userId: s.hostId }).select("twitchId").lean<{ twitchId: string }>();
  if (!link) return s;
  const on = await twitchLiveState(link.twitchId);
  // Twitch didn't answer: nothing changes (never ended for that)
  if (on === null) return s;
  if (s.status === "waiting" && on) {
    const now = await LiveStream.findOneAndUpdate({ _id: s._id, status: "waiting" }, { $set: { status: "live", startedAt: new Date() } }, { returnDocument: "after" }).lean<ILiveStream>();
    if (now) {
      const [{ Community }, host] = await Promise.all([import("../models/Community"), User.findById(s.hostId).select("displayName").lean<Pick<IUser, "_id" | "displayName">>()]);
      const community = await Community.findById(s.communityId).lean<ICommunity>();
      if (community && host) await tellMembers(now, community, host);
      return now;
    }
    return (await LiveStream.findById(s._id).lean<ILiveStream>()) ?? s;
  }
  if (s.status === "live") {
    if (on) offSince.delete(key);
    else {
      const since = offSince.get(key) ?? Date.now();
      offSince.set(key, since);
      if (Date.now() - since > OFF_GRACE_MS) {
        offSince.delete(key);
        const r = await LiveStream.updateOne({ _id: s._id, status: "live" }, { $set: { status: "ended", endedAt: new Date() } });
        if (r.modifiedCount) ended(s);
        return null;
      }
    }
  }
  return s;
}

/** when each guest's Twitch was last checked */
const guestCheck = new Map<string, number>();

/**
 * Live together, on reading the stream: lapsed invites and guests who never started (or dropped and didn't come back)
 * are taken off; a guest on Twitch goes live once Twitch says they're on (every 3 seconds while starting, every minute
 * while live: off means "coming back", for a few minutes).
 */
async function checkGuests(s: ILiveStream): Promise<ILiveStream> {
  const now = Date.now();
  const gone = (s.guests ?? []).filter((g) => (g.status === "invited" && now - +g.invitedAt >= INVITE_MS) || (g.status === "waiting" && g.waitingSince && now - +g.waitingSince > GUEST_WAIT_MS));
  if (gone.length) {
    await LiveStream.updateOne({ _id: s._id }, { $pull: { guests: { userId: { $in: gone.map((g) => g.userId) } } } });
    for (const g of gone) if (g.provider === "youtube" && g.ytBroadcast && g.channel) void youtubeFinish(g.userId, g.channel);
    s = { ...s, guests: (s.guests ?? []).filter((g) => !gone.includes(g)) };
  }
  const quiet = (s.guests ?? []).filter((g) => g.status === "live" && g.ytBroadcast && now - +(g.seenAt ?? g.joinedAt ?? g.invitedAt) > 2 * 60_000);
  for (const g of quiet) await LiveStream.updateOne({ _id: s._id, "guests.userId": g.userId }, { $set: { "guests.$.status": "waiting", "guests.$.waitingSince": new Date() } });
  if (quiet.length) {
    s = (await LiveStream.findById(s._id).lean<ILiveStream>()) ?? s;
    emitLive(s.communityId, true);
  }
  const { TwitchLink } = await import("../models/Live");
  for (const g of s.guests ?? []) {
    if (g.provider !== "twitch" || g.status === "invited") continue;
    const key = `${sid(s._id)}:${sid(g.userId)}`;
    if (now - (guestCheck.get(key) ?? 0) < (g.status === "waiting" ? 3_000 : 60_000)) continue;
    guestCheck.set(key, now);
    if (guestCheck.size > 2000) guestCheck.clear();
    const link = await TwitchLink.findOne({ userId: g.userId }).select("twitchId").lean<{ twitchId: string }>();
    if (!link) continue;
    const on = await twitchLiveState(link.twitchId);
    if (on === null) continue;
    if (on && g.status === "waiting") await guestOn(s, g.userId);
    else if (!on && g.status === "live") await LiveStream.updateOne({ _id: s._id, "guests.userId": g.userId }, { $set: { "guests.$.status": "waiting", "guests.$.waitingSince": new Date() } });
    else continue;
    s = (await LiveStream.findById(s._id).lean<ILiveStream>()) ?? s;
    emitLive(s.communityId, true);
  }
  return s;
}

/** A guest's stream is on: in the boxes for everyone, and (the first time) "Amara joined the live with Tobi" in the chat. */
export async function guestOn(s: Pick<ILiveStream, "_id" | "hostId" | "guests">, userId: Types.ObjectId) {
  const g = (s.guests ?? []).find((x) => sid(x.userId) === sid(userId));
  const first = !g?.joinedAt;
  await LiveStream.updateOne({ _id: s._id, "guests.userId": userId }, { $set: { "guests.$.status": "live", "guests.$.waitingSince": null, ...(first ? { "guests.$.joinedAt": new Date() } : {}) } });
  if (first) {
    const [who, host] = await Promise.all([User.findById(userId).select("displayName").lean<{ displayName: string }>(), User.findById(s.hostId).select("displayName").lean<{ displayName: string }>()]);
    await liveNotice(s._id, s.hostId, `${who?.displayName ?? "Someone"} joined the live with ${host?.displayName ?? "the host"}`);
  }
}

/** A grey line from Klique in the stream's chat ("Amara joined the live with Tobi", "… was removed from the live"). */
export async function liveNotice(liveId: Types.ObjectId, authorId: Types.ObjectId, body: string) {
  const { Channel, ChannelMessage } = await import("../models/Channel");
  const chat = await Channel.findOne({ topicId: liveId }).select("_id communityId").lean<{ _id: Types.ObjectId; communityId: Types.ObjectId }>();
  if (!chat) return;
  const line = await ChannelMessage.create({ channelId: chat._id, communityId: chat.communityId, authorId, body: body.slice(0, 300), images: [], mentions: [], notice: true });
  await Channel.updateOne({ _id: chat._id }, { lastMessageId: line._id, lastMessageAt: line.createdAt });
  const { emitChannel } = await import("./realtime");
  emitChannel(chat.communityId, chat._id);
}

/** The id of a YouTube video from any link to it (watch, youtu.be, /live/, /shorts/, an embed), or null. */
export function youtubeId(link: string): string | null {
  try {
    const u = new URL(link.trim());
    if (!/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i.test(u.hostname)) return null;
    const id = u.hostname.endsWith("youtu.be") ? u.pathname.slice(1) : (u.searchParams.get("v") ?? /\/(?:live|shorts|embed)\/([^/?#]+)/.exec(u.pathname)?.[1] ?? "");
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export const emitLive = (communityId: Types.ObjectId, on: boolean) => publish([rtChannel.community(communityId)], { type: "live", communityId: sid(communityId), on });

/** Tells the community's members someone went live (bundled, so a busy community isn't a stream of buzzes). */
async function tellMembers(s: ILiveStream, community: ICommunity, host: Pick<IUser, "_id" | "displayName">) {
  // open pages show LIVE at once; members who muted the community, or turned live off there, aren't buzzed
  emitLive(community._id, true);
  // a streamed event: the people going are told first, and always (they said they'd come), with a link to the event
  const event = s.eventId ? await Event.findById(s.eventId).select("title").lean<{ _id: Types.ObjectId; title: string }>() : null;
  const going = event ? (await Rsvp.find({ eventId: event._id, status: "going", userId: { $ne: host._id } }).select("userId").limit(20_000).lean<{ userId: Types.ObjectId }[]>()).map((r) => r.userId) : [];
  if (event && going.length) {
    notify(going, { title: `${host.displayName} is live: ${event.title}`, body: `In ${community.name}. Come and watch.`, data: { href: `/events/${sid(event._id)}?live=1` } }, { actorId: host._id, category: "events", groupKey: `live:${sid(community._id)}`, ref: `live:${sid(s._id)}` });
  }
  const told = new Set(going.map(sid));
  const members = (await Membership.find({ communityId: community._id, subcommunityId: null, status: "active", userId: { $ne: host._id }, muted: { $ne: true }, liveMuted: { $ne: true } }).select("userId").lean<{ userId: Types.ObjectId }[]>()).filter((m) => !told.has(sid(m.userId)));
  notify(
    members.map((m) => m.userId),
    { title: `${host.displayName} is live in ${community.name}`, body: s.title || "Come and watch.", data: { href: `/communities/${community.slug}?live=1` } },
    { actorId: host._id, category: "community", groupKey: `live:${sid(community._id)}`, ref: `live:${sid(s._id)}` },
  );
}

export async function startLive(viewer: IUser, slug: string, input: { provider: "twitch" | "youtube"; link?: string; broadcastId?: string; title: string; eventId?: string | null }): Promise<LiveDTO> {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (space.sub) throw badRequest("Go live in the community, not a group.");
  const community = space.community;
  if (community.adult) throw forbidden("18+ communities can't go live on Klique.");
  const eventId = input.eventId && Types.ObjectId.isValid(input.eventId) ? new Types.ObjectId(input.eventId) : null;
  const event = eventId ? await Event.findOne({ _id: eventId, communityId: community._id }).select("hostId streamed title cancelled review").lean<{ hostId: Types.ObjectId; streamed?: boolean; title: string; cancelled: boolean; review?: string | null }>() : null;
  if (eventId && !event) throw notFound("That event isn't in this community.");
  if (event && (event.cancelled || event.review)) throw badRequest("That event isn't on.");
  // a streamed event's own host may always stream it; anyone else needs to be allowed to go live here
  const ownEvent = !!event?.streamed && sid(event.hostId) === sid(viewer._id);
  if (!ownEvent && !(await canGoLive(viewer, community, access))) throw forbidden("Only the owner, admins and people they let can go live here.");
  if (standingOf(community)) throw forbidden("This community can't go live right now.");
  rateLimit(`go-live:${sid(viewer._id)}`, 10, 60 * 60 * 1000);
  if (event && !input.title.trim()) input = { ...input, title: event.title };

  // one at a time: someone else's stream stays; your own waiting one is replaced
  const now = await LiveStream.findOne({ communityId: community._id, status: { $in: ["waiting", "live"] } }).lean<ILiveStream>();
  if (now && !(await stale(now))) {
    if (sid(now.hostId) !== sid(viewer._id) || now.status === "live") throw conflict(sid(now.hostId) === sid(viewer._id) ? "You're live already. End it first." : "Someone is live here already. One stream at a time.");
    await LiveStream.updateOne({ _id: now._id }, { $set: { status: "ended", endedAt: new Date() } });
  }

  const title = input.title.trim().slice(0, 120);
  let row: ILiveStream;
  if (input.provider === "youtube" && input.broadcastId) {
    // the phone's camera, to a broadcast Klique just made on their own channel: live as soon as it's posted
    if (!(await youtubeOwnsBroadcast(viewer._id, input.broadcastId))) throw badRequest("That YouTube broadcast isn't yours. Try going live again.");
    row = (await LiveStream.create({ communityId: community._id, eventId, hostId: viewer._id, provider: "youtube", channel: input.broadcastId, title, status: "live", startedAt: new Date(), ytBroadcast: true, hostSeenAt: new Date() })).toObject() as ILiveStream;
    await tellMembers(row, community, viewer);
  } else if (input.provider === "youtube") {
    const id = youtubeId(input.link ?? "");
    if (!id) throw badRequest("Paste the link to your YouTube live stream (youtube.com/live/… or youtu.be/…).");
    row = (await LiveStream.create({ communityId: community._id, eventId, hostId: viewer._id, provider: "youtube", channel: id, title, status: "live", startedAt: new Date() })).toObject() as ILiveStream;
    await tellMembers(row, community, viewer);
  } else {
    const link = await twitchLinkOf(viewer._id);
    if (!link) throw badRequest("Connect Twitch first (Settings → Connected accounts).");
    // Twitch's "went live" message must be able to reach us: mend it now if it can't (in the background)
    void ensureLiveSubscriptions(viewer._id).catch((err) => console.warn("[twitch] subscriptions:", (err as Error)?.message));
    void twitchSetTitle(viewer._id, title);
    const already = await twitchIsLive(link.twitchId);
    row = (await LiveStream.create({ communityId: community._id, eventId, hostId: viewer._id, provider: "twitch", channel: link.login, title, status: already ? "live" : "waiting", startedAt: already ? new Date() : null })).toObject() as ILiveStream;
    if (already) await tellMembers(row, community, viewer);
  }
  return toLive(row, viewer, staffOf(access, viewer));
}

/** Ends the community's stream: its host, or the people who run the community (and Klique's admins). */
export async function endLive(viewer: IUser, slug: string) {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  const s = await LiveStream.findOne({ communityId: space.community._id, status: { $in: ["waiting", "live"] } }).lean<ILiveStream>();
  if (!s) return { ended: true };
  if (sid(s.hostId) !== sid(viewer._id) && !staffOf(access, viewer)) throw forbidden("Only its host and the community's admins can end it.");
  const r = await LiveStream.updateOne({ _id: s._id, status: { $in: ["waiting", "live"] } }, { $set: { status: "ended", endedAt: new Date(), endedById: viewer._id } });
  // broadcasts Klique made on their channels: finished on YouTube too
  if (r.modifiedCount) ended(s);
  return { ended: true };
}

/** Twitch says a connected channel went live: its waiting stream in Klique goes LIVE, and its members are told. */
export async function onTwitchOnline(twitchId: string) {
  const { TwitchLink } = await import("../models/Live");
  const link = await TwitchLink.findOne({ twitchId }).select("userId").lean<{ userId: Types.ObjectId }>();
  if (!link) return;
  // a guest on Twitch: their box goes live
  const asGuest = await LiveStream.findOne({ status: { $in: ["waiting", "live"] }, guests: { $elemMatch: { userId: link.userId, provider: "twitch", status: "waiting" } } }).lean<ILiveStream>();
  if (asGuest) {
    await guestOn(asGuest, link.userId);
    emitLive(asGuest.communityId, true);
  }
  const s = await LiveStream.findOneAndUpdate({ hostId: link.userId, provider: "twitch", status: "waiting" }, { $set: { status: "live", startedAt: new Date() } }, { returnDocument: "after" }).lean<ILiveStream>();
  if (!s) return;
  const [{ Community }, host] = await Promise.all([import("../models/Community"), User.findById(link.userId).select("displayName").lean<Pick<IUser, "_id" | "displayName">>()]);
  const community = await Community.findById(s.communityId).lean<ICommunity>();
  if (community && host) await tellMembers(s, community, host);
}

/** Twitch says it went off: the stream ends in Klique too. */
export async function onTwitchOffline(twitchId: string) {
  const { TwitchLink } = await import("../models/Live");
  const link = await TwitchLink.findOne({ twitchId }).select("userId").lean<{ userId: Types.ObjectId }>();
  if (!link) return;
  // a guest on Twitch went off: "coming back" for a few minutes
  const asGuest = await LiveStream.find({ status: { $in: ["waiting", "live"] }, guests: { $elemMatch: { userId: link.userId, provider: "twitch", status: "live" } } }).select("_id communityId").lean<{ _id: Types.ObjectId; communityId: Types.ObjectId }[]>();
  for (const g of asGuest) {
    await LiveStream.updateOne({ _id: g._id, "guests.userId": link.userId }, { $set: { "guests.$.status": "waiting", "guests.$.waitingSince": new Date() } });
    emitLive(g.communityId, true);
  }
  const ending = await LiveStream.find({ hostId: link.userId, provider: "twitch", status: "live" }).lean<ILiveStream[]>();
  if (!ending.length) return;
  await LiveStream.updateMany({ _id: { $in: ending.map((e) => e._id) } }, { $set: { status: "ended", endedAt: new Date() } });
  for (const e of ending) ended(e);
}

/** Live rings on Home: streams on right now in your communities, the busiest first (then the newest). */
export async function liveNow(viewer: IUser): Promise<LiveNowDTO[]> {
  const mine = await Membership.find({ userId: viewer._id, subcommunityId: null, status: "active" }).select("communityId").lean<{ communityId: Types.ObjectId }[]>();
  if (!mine.length) return [];
  // not your own stream (you're the one streaming it)
  const rows = await LiveStream.find({ communityId: { $in: mine.map((m) => m.communityId) }, status: "live", hostId: { $ne: viewer._id } }).sort({ startedAt: -1 }).limit(20).lean<ILiveStream[]>();
  const fresh: ILiveStream[] = [];
  for (const r of rows) if (!(await stale(r))) fresh.push(r);
  if (!fresh.length) return [];
  const { Community } = await import("../models/Community");
  const [communities, briefs] = await Promise.all([
    Community.find({ _id: { $in: fresh.map((r) => r.communityId) } }).select("slug name coverImage adult").lean<Pick<ICommunity, "_id" | "slug" | "name" | "coverImage" | "adult">[]>(),
    loadBriefs(fresh.flatMap((r) => [r.hostId, ...guestsOf(r).filter((g) => g.status === "live").map((g) => g.userId)])),
  ]);
  const byId = new Map(communities.map((c) => [sid(c._id), c]));
  const counts = new Map(await Promise.all(fresh.map(async (s) => [sid(s._id), await viewersOf(s._id)] as const)));
  // busiest first; the sort is stable, so equal ones stay newest first
  fresh.sort((a, b) => (counts.get(sid(b._id)) ?? 0) - (counts.get(sid(a._id)) ?? 0));
  return fresh.flatMap((s) => {
    const c = byId.get(sid(s.communityId));
    if (!c || c.adult) return [];
    return [{ community: { id: sid(c._id), slug: c.slug, name: c.name, coverImage: c.coverImage ?? null }, live: { id: sid(s._id), provider: s.provider, channel: s.channel, title: s.title, status: "live" as const, host: briefs.get(sid(s.hostId)) ?? GHOST, startedAt: s.startedAt?.toISOString() ?? null, eventId: s.eventId ? sid(s.eventId) : null, canEnd: sid(s.hostId) === sid(viewer._id), viewers: counts.get(sid(s._id)) ?? 0, ...(fromPhone(s) ? { phone: true } : {}), ...guestsFor(s, viewer, false, briefs) } }];
  });
}

/**
 * The owner (or anyone who manages roles) lets a member go live for so many hours (0 takes it back). They're told.
 */
export async function setLivePass(viewer: IUser, slug: string, userId: string, hours: number) {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (!staffOf(access, viewer) && !can(access, "manageRoles")) throw forbidden("Only the owner and admins can let people go live.");
  if (!Types.ObjectId.isValid(userId)) throw notFound("That person isn't a member.");
  const until = hours > 0 ? new Date(Date.now() + Math.min(hours, 24 * 30) * 60 * 60 * 1000) : null;
  const r = await Membership.updateOne({ userId, communityId: space.community._id, subcommunityId: null, status: "active" }, { $set: { livePassUntil: until } });
  if (!r.matchedCount) throw notFound("That person isn't a member.");
  if (until) {
    const when = until.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });
    notify([new Types.ObjectId(userId)], { title: `You can go live in ${space.community.name}`, body: `Until ${when}. Press Live at the top of the community.`, data: { href: `/communities/${space.community.slug}?live=1` } }, { actorId: viewer._id, category: "community", ref: `livepass:${sid(space.community._id)}` });
  }
  return { userId, until: until?.toISOString() ?? null };
}

/** The chat beside the community's stream (made the first time someone opens it). Null: nobody's live. */
export async function liveChat(viewer: IUser | null, slug: string) {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (!access.canView) throw notFound("We couldn't find that stream.");
  const s = await LiveStream.findOne({ communityId: space.community._id, status: { $in: ["waiting", "live"] } }).lean<ILiveStream>();
  if (!s || (await stale(s))) throw notFound("Nobody's live here now.");
  if (viewer && (s.kickedIds ?? []).some((k) => sid(k) === sid(viewer._id))) throw forbidden("You were removed from this stream.");
  const { ensureLiveChat } = await import("./channels.service");
  return { liveId: sid(s._id), isMember: access.isMember, canModerate: mayModerate(viewer, access, s), channel: await ensureLiveChat(viewer, access, s) };
}

/** Who moderates a stream: its host, the people who run the community, and roles that delete messages, time out or remove members. */
export function mayModerate(viewer: IUser | null, access: SpaceAccess, s: Pick<ILiveStream, "hostId">): boolean {
  if (!viewer) return false;
  return sid(viewer._id) === sid(s.hostId) || staffOf(access, viewer) || can(access, "kick") || can(access, "timeout") || can(access, "deleteMessages");
}

/**
 * Moderating a stream from its live chat. "remove": they lose the player and the chat in Klique (they can still find
 * it on Twitch or YouTube, which Klique doesn't run), and their messages in this chat go. "allow": back in.
 * "timeout": the community's own 10-minute timeout (no writing anywhere in it), for people allowed to time out.
 */
export async function moderateLive(viewer: IUser, slug: string, input: { userId: string; action: "remove" | "allow" | "timeout" }) {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  const s = await LiveStream.findOne({ communityId: space.community._id, status: { $in: ["waiting", "live"] } }).lean<ILiveStream>();
  if (!s) throw notFound("Nobody's live here now.");
  if (!mayModerate(viewer, access, s)) throw forbidden("Only the person streaming and the community's moderators can do that.");
  if (!Types.ObjectId.isValid(input.userId)) throw notFound("We couldn't find them.");
  const target = new Types.ObjectId(input.userId);
  if (sid(target) === sid(viewer._id)) throw badRequest("You can't do that to yourself.");
  if (sid(target) === sid(s.hostId)) throw forbidden("That's the person streaming.");

  if (input.action === "timeout") {
    const { setTimeout_ } = await import("./spaces.service");
    return setTimeout_(viewer, space, access, input.userId, 600, "In the live chat");
  }

  // the people who run the community can't be removed from it (except by Klique's admins)
  const m = await Membership.findOne({ userId: target, communityId: space.community._id, subcommunityId: null }).select("role").lean<{ role: string }>();
  if ((m?.role === "owner" || m?.role === "admin") && !isSiteAdmin(viewer)) throw forbidden("You can't remove the community's owner or admins.");
  if (input.action === "allow") {
    await LiveStream.updateOne({ _id: s._id }, { $pull: { kickedIds: target } });
    return { userId: input.userId, removed: false };
  }
  // a guest streaming in it comes off too
  await LiveStream.updateOne({ _id: s._id }, { $addToSet: { kickedIds: target }, $pull: { guests: { userId: target } } });
  // their messages in this chat go too (like a ban in Twitch's chat)
  const { Channel, ChannelMessage } = await import("../models/Channel");
  const chat = await Channel.findOne({ topicId: s._id }).select("_id communityId").lean<{ _id: Types.ObjectId; communityId: Types.ObjectId }>();
  const who = await User.findById(target).select("displayName").lean<{ displayName: string }>();
  if (chat) {
    await ChannelMessage.updateMany({ channelId: chat._id, authorId: target, deletedAt: null }, { $set: { deletedAt: new Date(), deletedById: viewer._id, body: "", gone: true } });
    // everyone watching sees it happen, like Twitch's "has been banned" line
    const line = await ChannelMessage.create({ channelId: chat._id, communityId: chat.communityId, authorId: viewer._id, body: `${who?.displayName ?? "Someone"} was removed from the live`, images: [], mentions: [], notice: true });
    await Channel.updateOne({ _id: chat._id }, { lastMessageId: line._id, lastMessageAt: line.createdAt });
    const { emitChannel } = await import("./realtime");
    emitChannel(chat.communityId, chat._id);
  }
  const { ModAction } = await import("../models/ModAction");
  await ModAction.create({ communityId: space.community._id, actorId: viewer._id, action: "live.remove", targetType: "member", targetId: target, label: `${who?.displayName ?? "Someone"} from the live stream`, authorId: target }).catch(() => {});
  return { userId: input.userId, removed: true };
}
