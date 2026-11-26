import "server-only";
import { Types } from "mongoose";
import type { LiveDTO, LiveNowDTO } from "@/lib/types";
import { badRequest, conflict, forbidden, notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import type { ICommunity } from "../models/Community";
import { Event } from "../models/Event";
import { LiveStream, type ILiveStream } from "../models/Live";
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
import { twitchIsLive, twitchLinkOf, twitchSetTitle } from "./twitch.service";

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

const staffOf = (access: SpaceAccess, viewer: IUser | null) => access.canManage || (!!viewer && isSiteAdmin(viewer));

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
  const old = (s.status === "waiting" && Date.now() - +s.createdAt > WAIT_MS) || (s.provider === "youtube" && s.startedAt && Date.now() - +s.startedAt > YOUTUBE_MAX_MS);
  if (old) {
    await LiveStream.updateOne({ _id: s._id, status: s.status }, { $set: { status: "ended", endedAt: new Date() } });
    if (s.status === "live") emitLive(s.communityId, false);
  }
  return !!old;
}

async function toLive(s: ILiveStream, viewer: IUser | null, staff: boolean): Promise<LiveDTO> {
  const host = (await loadBriefs([s.hostId])).get(sid(s.hostId)) ?? GHOST;
  return { id: sid(s._id), provider: s.provider, channel: s.channel, title: s.title, status: s.status === "live" ? "live" : "waiting", host, startedAt: s.startedAt?.toISOString() ?? null, eventId: s.eventId ? sid(s.eventId) : null, canEnd: staff || (!!viewer && sid(viewer._id) === sid(s.hostId)) };
}

/** The community's stream now, for its page: live for everyone who can see it; waiting only for its host and staff. */
export async function liveOf(viewer: IUser | null, community: ICommunity, access: SpaceAccess): Promise<LiveDTO | null> {
  if (!access.canView) return null;
  const s = await LiveStream.findOne({ communityId: community._id, status: { $in: ["waiting", "live"] } }).lean<ILiveStream>();
  if (!s || (await stale(s))) return null;
  const staff = staffOf(access, viewer);
  if (s.status === "waiting" && !staff && !(viewer && sid(viewer._id) === sid(s.hostId))) return null;
  return toLive(s, viewer, staff);
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

const emitLive = (communityId: Types.ObjectId, on: boolean) => publish([rtChannel.community(communityId)], { type: "live", communityId: sid(communityId), on });

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

export async function startLive(viewer: IUser, slug: string, input: { provider: "twitch" | "youtube"; link?: string; title: string; eventId?: string | null }): Promise<LiveDTO> {
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
  if (input.provider === "youtube") {
    const id = youtubeId(input.link ?? "");
    if (!id) throw badRequest("Paste the link to your YouTube live stream (youtube.com/live/… or youtu.be/…).");
    row = (await LiveStream.create({ communityId: community._id, eventId, hostId: viewer._id, provider: "youtube", channel: id, title, status: "live", startedAt: new Date() })).toObject() as ILiveStream;
    await tellMembers(row, community, viewer);
  } else {
    const link = await twitchLinkOf(viewer._id);
    if (!link) throw badRequest("Connect Twitch first (Settings → Connected accounts).");
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
  await LiveStream.updateOne({ _id: s._id }, { $set: { status: "ended", endedAt: new Date(), endedById: viewer._id } });
  if (s.status === "live") emitLive(s.communityId, false);
  return { ended: true };
}

/** Twitch says a connected channel went live: its waiting stream in Klique goes LIVE, and its members are told. */
export async function onTwitchOnline(twitchId: string) {
  const { TwitchLink } = await import("../models/Live");
  const link = await TwitchLink.findOne({ twitchId }).select("userId").lean<{ userId: Types.ObjectId }>();
  if (!link) return;
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
  const ending = await LiveStream.find({ hostId: link.userId, provider: "twitch", status: "live" }).select("communityId").lean<{ _id: Types.ObjectId; communityId: Types.ObjectId }[]>();
  if (!ending.length) return;
  await LiveStream.updateMany({ _id: { $in: ending.map((e) => e._id) } }, { $set: { status: "ended", endedAt: new Date() } });
  for (const e of ending) emitLive(e.communityId, false);
}

/** "Live now" on Home: streams on right now in your communities (newest first). */
export async function liveNow(viewer: IUser): Promise<LiveNowDTO[]> {
  const mine = await Membership.find({ userId: viewer._id, subcommunityId: null, status: "active" }).select("communityId").lean<{ communityId: Types.ObjectId }[]>();
  if (!mine.length) return [];
  const rows = await LiveStream.find({ communityId: { $in: mine.map((m) => m.communityId) }, status: "live" }).sort({ startedAt: -1 }).limit(20).lean<ILiveStream[]>();
  const fresh: ILiveStream[] = [];
  for (const r of rows) if (!(await stale(r))) fresh.push(r);
  if (!fresh.length) return [];
  const { Community } = await import("../models/Community");
  const [communities, briefs] = await Promise.all([
    Community.find({ _id: { $in: fresh.map((r) => r.communityId) } }).select("slug name coverImage adult").lean<Pick<ICommunity, "_id" | "slug" | "name" | "coverImage" | "adult">[]>(),
    loadBriefs(fresh.map((r) => r.hostId)),
  ]);
  const byId = new Map(communities.map((c) => [sid(c._id), c]));
  return fresh.flatMap((s) => {
    const c = byId.get(sid(s.communityId));
    if (!c || c.adult) return [];
    return [{ community: { id: sid(c._id), slug: c.slug, name: c.name, coverImage: c.coverImage ?? null }, live: { id: sid(s._id), provider: s.provider, channel: s.channel, title: s.title, status: "live" as const, host: briefs.get(sid(s.hostId)) ?? GHOST, startedAt: s.startedAt?.toISOString() ?? null, eventId: s.eventId ? sid(s.eventId) : null, canEnd: sid(s.hostId) === sid(viewer._id) } }];
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
  const { ensureLiveChat } = await import("./channels.service");
  return { liveId: sid(s._id), isMember: access.isMember, channel: await ensureLiveChat(viewer, access, s) };
}
