import "server-only";
import { EVENT_FALLBACK_MS, eventEndMs, eventEnded } from "@/lib/event-time";
import { Types } from "mongoose";
import type { z } from "zod";
import { extractMentionHandles } from "@/lib/mentions";
import { GOOD_REACTIONS } from "@/lib/points";
import type { ReactionKind } from "@/lib/reactions";
import type { ChannelMessageDTO, CrewCardDTO, CrewDTO, CrewStanding, EventCrewsDTO, JoinedKliqueDTO, KliqueListDTO, KliqueStartDTO, MyCrewDTO, ReactionDTO, UserBrief } from "@/lib/types";
import { ApiError, badRequest, conflict, forbidden, notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import { mailerConfigured } from "../mailer";
import { Crew, CrewMember, CrewMessage, CrewRead, type ICrew, type ICrewMember, type ICrewMessage, type ICrewRead } from "../models/Crew";
import { Community, type ICommunity } from "../models/Community";
import { Event, type IEvent } from "../models/Event";
import { Membership } from "../models/Membership";
import { Notification } from "../models/Notification";
import { MembershipRequest } from "../models/MembershipRequest";
import { Subcommunity, type ISubcommunity } from "../models/Subcommunity";
import { User, type IUser } from "../models/User";
import { canViewEvent, spaceAccess } from "../policies/access";
import { ADULT_AGE, ageOn } from "../policies/adult";
import { isSiteAdmin } from "../policies/hosting";
import { GHOST, loadBriefs } from "../serializers";
import type { crewCreateSchema, crewUpdateSchema, kliqueCreateSchema, kliqueListQuery } from "../validators/schemas";
import { assertVerified } from "./account.service";
import { hiddenUserIds } from "./blocks";
import { escapeRegex, sid } from "./helpers";
import { isCountryCode, parseScope, scopeFilter, slugify } from "@/lib/places";
import { purgeCrewChat } from "./crew-chat-purge";
import { kliqueBoost, kliqueCreateBlock, kliqueJoinBlock } from "./klique-limits";
import { logModDelete } from "./admin-audit";
import { noteKliqueStart } from "./subscriptions.service";
import { deleteUploads } from "./media.service";
import { mentionBriefs } from "./mentions";
import { awardPointsLater } from "./points.service";
import { notify, notifyNow } from "./push.service";
import { publish, rtChannel } from "./realtime";
import { purgeReactions, summarizeReactions, toggleReaction } from "./reactions";
import { previewOf, toReplyRef } from "./replies";
import { assertStickerUrl, noteStickerUse } from "./stickers.service";
import { createPoll, deletePoll, pollPreview } from "./polls.service";
import type { pollInput } from "../validators/schemas";
import { assertNoCommunityTimeout } from "../policies/access";
import { normalizeEmoji } from "./emoji.service";

/**
 * Kliques (called crews before Nov 2026; the code and collections keep that name): a small plan to do something
 * together, written as a hook, with a cover picture and an interest. The rules, all checked here:
 *  - a klique belongs to an event (going to it together), to a community (anything its members want to do), or to
 *    all communities (no event, no community: open to anyone, in a place its host names)
 *  - you can see an event's kliques exactly when you can see the event. A community's show in the kliques list and
 *    "Kliques for you" only for its members; its own page and a direct link show them whenever you can see the
 *    community (public, or you're in it), with a way to join it. 18+ communities' kliques stay inside them
 *  - interest decides who a klique reaches first, never who may see it: "Kliques for you" only offers an
 *    all-communities klique to people with that interest
 *  - under-18s never see, start or join kliques; a verified email is needed to start or join one
 *  - to start or join one you must be a member of its community (or of its group, for a group's event);
 *    events outside any community are open to anyone signed in
 *  - one klique per account per event; how many you may start a month and be in at once is your plan's limit
 *  - a klique is 2–100 people, host included; "Ask to join" (host approves, the default) or "Open"
 *  - "Women only": only profiles set to woman can join, and only hosts set to woman can choose it
 *  - joining closes when it starts (the event, or the meetup itself); the exact meetup point is members-only
 *  - everything (klique, members, chat) deletes itself a day after it happens (TTL on `expiresAt`)
 */

/** an event with no end time counts as 3 hours long; so does a community klique */
const FALLBACK_DURATION_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** how early before the event a klique may meet up */
const MAX_LEAD_MS = 2 * DAY_MS;
/** how far ahead a community klique may be planned */
const MAX_AHEAD_MS = 60 * DAY_MS;
const FACES = 5;

const eventEnd = (e: Pick<IEvent, "startsAt" | "endsAt">) => new Date(eventEndMs(e));
/** a day after the event ends */
export const crewExpiry = (e: Pick<IEvent, "startsAt" | "endsAt">) => new Date(+eventEnd(e) + DAY_MS);
/** a community klique: a day after it's over */
const meetupExpiry = (meetupAt: Date) => new Date(+meetupAt + FALLBACK_DURATION_MS + DAY_MS);

/** "Sat 18 Oct, 4:00 PM" in Lagos time (kept here so this file doesn't depend on events.service) */
const at = (d: Date) => d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Lagos" });

const oid = (id: string, what = "klique") => {
  if (!Types.ObjectId.isValid(id)) throw notFound(`We couldn't find that ${what}.`);
  return new Types.ObjectId(id);
};

const GONE = "This klique is gone. Kliques close a day after they happen.";
const quote = (s: string, n = 60) => `“${s.length > n ? `${s.slice(0, n - 1)}…` : s}”`;

/** Under 18 (by their date of birth): kliques don't exist for them. */
const isMinor = (viewer: Pick<IUser, "dob"> | null) => {
  const age = ageOn(viewer?.dob);
  return age !== null && age < ADULT_AGE;
};
const unverified = (viewer: Pick<IUser, "emailVerifiedAt">) => mailerConfigured() && !viewer.emailVerifiedAt;

/** Why this person can't start or join any klique (age, email), in words; null when nothing's in the way. */
function personBlock(viewer: IUser, doing: "start" | "join"): string | null {
  if (isMinor(viewer)) return "Kliques are for people 18 and over.";
  if (!viewer.dob) return `Add your date of birth in Settings to ${doing} a klique (they're for 18 and over).`;
  if (unverified(viewer)) return `Verify your email to ${doing} a klique.`;
  return null;
}

/** The event, if this viewer may see it (hidden looks exactly like missing). */
async function visibleEvent(viewer: IUser | null, eventId: Types.ObjectId | string): Promise<IEvent> {
  const event = await Event.findById(eventId).lean<IEvent>();
  // no kliques for an event that isn't approved yet
  if (!event || event.review || !(await canViewEvent(event, viewer))) throw notFound("We couldn't find that event.");
  return event;
}

type CommunityBits = Pick<ICommunity, "_id" | "slug" | "name" | "privacy" | "adult" | "interest" | "country" | "city">;
const COMMUNITY_FIELDS = "slug name privacy adult interest country city";

const isMemberOf = async (viewer: IUser | null, communityId: Types.ObjectId) => !!viewer && !!(await Membership.exists({ userId: viewer._id, communityId, subcommunityId: null, status: "active" }));

/** A community's kliques: visible when it's public (and not 18+), or to its members. */
async function canSeeCommunityKliques(viewer: IUser | null, c: CommunityBits): Promise<boolean> {
  if (viewer && isSiteAdmin(viewer)) return true;
  if (c.privacy === "public" && !c.adult) return true;
  return isMemberOf(viewer, c._id);
}

/** The klique and what it belongs to, if this viewer may see them. */
/** Once a klique is over, only the people in it can still open it (until it deletes itself). */
async function assertOpenToViewer(viewer: IUser | null, crew: ICrew, event: IEvent | null) {
  if (!kliqueOver(crew, event)) return;
  if (viewer && (await CrewMember.exists({ crewId: crew._id, userId: viewer._id, status: "active" }))) return;
  throw notFound(GONE);
}

async function visibleCrew(viewer: IUser | null, crewId: string): Promise<{ crew: ICrew; event: IEvent | null; community: CommunityBits | null }> {
  const crew = await Crew.findById(oid(crewId)).lean<ICrew>();
  if (!crew || isMinor(viewer)) throw notFound(GONE);
  if (crew.eventId) {
    const event = await visibleEvent(viewer, crew.eventId).catch(() => {
      throw notFound(GONE);
    });
    await assertOpenToViewer(viewer, crew, event);
    const community = event.communityId ? await Community.findById(event.communityId).select(COMMUNITY_FIELDS).lean<CommunityBits>() : null;
    return { crew, event, community };
  }
  // all communities: no event and no community, so anyone can open it
  if (!crew.communityId) {
    await assertOpenToViewer(viewer, crew, null);
    return { crew, event: null, community: null };
  }
  const community = await Community.findById(crew.communityId).select(COMMUNITY_FIELDS).lean<CommunityBits>();
  if (!community || !(await canSeeCommunityKliques(viewer, community))) throw notFound(GONE);
  await assertOpenToViewer(viewer, crew, null);
  return { crew, event: null, community };
}

/**
 * Over: its event has ended (lib/event-time), or for a community klique, 3 hours after the meetup. From then on
 * it's out of every list and search, and only its own members can still open it (read-only for joining) until
 * it deletes itself a day later (expiresAt, a TTL index).
 */
export const kliqueOver = (crew: Pick<ICrew, "meetupAt">, event: Pick<IEvent, "startsAt" | "endsAt"> | null, now = Date.now()) =>
  event ? eventEnded(event, now) : +crew.meetupAt + EVENT_FALLBACK_MS < now;

/**
 * Closed: from the moment its event starts (a community klique: its meetup time), or the event is called off. No
 * joining, asking or letting people in from then; it leaves every list and search for people who aren't in it.
 * Its members keep it (and its chat) until it deletes itself, a day after the end (kliqueOver, expiresAt).
 */
const closesAt = (crew: Pick<ICrew, "meetupAt">, event: Pick<IEvent, "startsAt"> | null) => (event ? event.startsAt : crew.meetupAt);
export const kliqueClosed = (crew: Pick<ICrew, "meetupAt">, event: Pick<IEvent, "startsAt" | "cancelled"> | null, now = Date.now()) => +closesAt(crew, event) <= now || !!event?.cancelled;
const isClosed = kliqueClosed;
/** What people are told when it's closed. */
const closedMessage = (event: Pick<IEvent, "cancelled"> | null) => (event?.cancelled ? "This klique is closed. The event was cancelled." : event ? "This klique is closed. The event has started." : "This klique is closed. The meetup time has passed.");

function validateMeetup(meetupAt: Date, event: IEvent | null) {
  const now = Date.now();
  if (+meetupAt < now - 5 * 60_000) throw badRequest("Pick a time that hasn't passed.");
  if (event) {
    if (+meetupAt > +eventEnd(event)) throw badRequest("Meet up before the event ends.");
    if (+meetupAt < +event.startsAt - MAX_LEAD_MS) throw badRequest("Meet up at most 2 days before the event.");
  } else if (+meetupAt > now + MAX_AHEAD_MS) throw badRequest("Plan it within the next 60 days.");
}

function assertEventOpen(event: IEvent) {
  if (event.cancelled) throw badRequest("This event was cancelled.");
  if (event.online) throw badRequest("Kliques are for meeting up in person.");
  if (+event.startsAt <= Date.now()) throw badRequest("This event has started, so its kliques are closed.");
}

/**
 * Starting or joining a klique is for its own people: members of the community (or of the event's group, when
 * the event belongs to a group). Returns why not, in words, or null when they may.
 */
async function spaceBlock(viewer: IUser, where: { communityId: Types.ObjectId | null; subcommunityId?: Types.ObjectId | null }): Promise<string | null> {
  if (!where.communityId) return null;
  const m = await Membership.exists({ userId: viewer._id, communityId: where.communityId, subcommunityId: where.subcommunityId ?? null, status: "active" });
  if (m) return null;
  if (where.subcommunityId) {
    const g = await Subcommunity.findById(where.subcommunityId).select("name").lean<Pick<ISubcommunity, "name">>();
    return `Only members of ${g?.name ?? "this group"} can join its kliques.`;
  }
  const c = await Community.findById(where.communityId).select("name").lean<Pick<ICommunity, "name">>();
  return `Join ${c?.name ?? "the community"} to start or join a klique.`;
}

/**
 * The space to join first, when that's what stands between this viewer and a klique: the community (also when
 * the event is in one of its groups and they aren't in the community yet), else the group. The klique page turns
 * it into a "Join …" / "Ask to join …" button.
 */
async function spaceNeed(viewer: IUser, where: { communityId: Types.ObjectId | null; subcommunityId?: Types.ObjectId | null }): Promise<CrewDTO["viewer"]["joinSpace"]> {
  if (!where.communityId) return null;
  const [community, inCommunity] = await Promise.all([
    Community.findById(where.communityId).select("slug name privacy").lean<Pick<ICommunity, "slug" | "name" | "privacy">>(),
    Membership.exists({ userId: viewer._id, communityId: where.communityId, subcommunityId: null, status: "active" }),
  ]);
  if (!community) return null;
  const requested = async (subcommunityId: Types.ObjectId | null) => !!(await MembershipRequest.exists({ userId: viewer._id, communityId: where.communityId, subcommunityId, status: "pending" }));
  if (!inCommunity) return { slug: community.slug, sub: null, name: community.name, ask: community.privacy === "private", requested: await requested(null) };
  if (!where.subcommunityId) return null;
  if (await Membership.exists({ userId: viewer._id, communityId: where.communityId, subcommunityId: where.subcommunityId, status: "active" })) return null;
  const g = await Subcommunity.findById(where.subcommunityId).select("slug name visibility").lean<Pick<ISubcommunity, "slug" | "name" | "visibility">>();
  if (!g) return null;
  return { slug: community.slug, sub: g.slug, name: g.name, ask: g.visibility === "private", requested: await requested(where.subcommunityId) };
}

/** Tell everyone in a klique (and anyone in `also`) that it changed, so their open pages refresh by themselves. */
async function pingCrew(crewId: Types.ObjectId, opts: { chat?: boolean; also?: Types.ObjectId[] } = {}) {
  const rows = await CrewMember.find({ crewId }).select("userId").lean<{ userId: Types.ObjectId }[]>();
  const ids = [...new Set([...rows.map((r) => sid(r.userId)), ...(opts.also ?? []).map(sid)])];
  publish(ids.map((id) => rtChannel.user(id)), { type: "crew", crewId: sid(crewId), chat: !!opts.chat });
}

const isDup = (e: unknown) => (e as { code?: number })?.code === 11000;

/* ------------------------------------------------------------------ */
/* Cards & detail                                                      */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Who can join: everyone, women only, men only, or mixed spots          */
/* ------------------------------------------------------------------ */

type Audience = "everyone" | "women" | "men" | "mixed";
type Slot = "woman" | "man" | "any";
type SlotCounts = { woman: number; man: number; any: number };
export const audienceOf = (c: Pick<ICrew, "audience" | "womenOnly">): Audience => c.audience ?? (c.womenOnly ? "women" : "everyone");

/** Who holds which kind of spot in each klique (active members, the host not counted). */
async function slotCounts(crewIds: Types.ObjectId[]): Promise<Map<string, SlotCounts>> {
  const out = new Map<string, SlotCounts>();
  if (!crewIds.length) return out;
  const rows = await CrewMember.aggregate<{ _id: { crew: Types.ObjectId; slot: Slot | null }; n: number }>([
    { $match: { crewId: { $in: crewIds }, status: "active", role: "member" } },
    { $group: { _id: { crew: "$crewId", slot: "$slot" }, n: { $sum: 1 } } },
  ]);
  for (const r of rows) {
    const c = out.get(sid(r._id.crew)) ?? { woman: 0, man: 0, any: 0 };
    c[r._id.slot ?? "any"] += r.n;
    out.set(sid(r._id.crew), c);
  }
  return out;
}

/** Spots still open, by who can take them. */
function spotsLeft(c: Pick<ICrew, "audience" | "womenOnly" | "maxMembers" | "memberCount" | "womenSpots" | "menSpots">, counts: SlotCounts | undefined): { women: number; men: number; any: number } {
  const a = audienceOf(c);
  const free = Math.max(0, c.maxMembers - c.memberCount);
  if (a === "women") return { women: free, men: 0, any: 0 };
  if (a === "men") return { women: 0, men: free, any: 0 };
  if (a === "everyone") return { women: 0, men: 0, any: free };
  const k = counts ?? { woman: 0, man: 0, any: 0 };
  const ws = c.womenSpots ?? 0;
  const ms = c.menSpots ?? 0;
  const anySpots = Math.max(0, c.maxMembers - 1 - ws - ms);
  // never more than the klique has room for in total
  const women = Math.max(0, ws - k.woman);
  const men = Math.max(0, ms - k.man);
  const any = Math.max(0, anySpots - k.any);
  const scale = (n: number) => Math.min(n, free);
  return { women: scale(women), men: scale(men), any: scale(any) };
}

const GENDER_HINT = "Set your gender in Settings, Profile to join.";

/** The spot this person would take, or why there's none for them. */
function slotFor(c: Pick<ICrew, "audience" | "womenOnly" | "maxMembers" | "memberCount" | "womenSpots" | "menSpots">, gender: IUser["gender"], counts: SlotCounts | undefined): Slot | string {
  const a = audienceOf(c);
  if (a === "women") return gender === "woman" ? "any" : gender === "man" ? "This klique is for women only." : `This klique is for women only. ${GENDER_HINT}`;
  if (a === "men") return gender === "man" ? "any" : gender === "woman" ? "This klique is for men only." : `This klique is for men only. ${GENDER_HINT}`;
  if (a === "everyone") return "any";
  const left = spotsLeft(c, counts);
  if (gender === "woman" && left.women > 0) return "woman";
  if (gender === "man" && left.men > 0) return "man";
  if (left.any > 0) return "any";
  if ((left.women > 0 || left.men > 0) && (!gender || gender === "unspecified")) return `The spots left are for ${left.women > 0 && left.men > 0 ? "women and men" : left.women > 0 ? "women" : "men"}. ${GENDER_HINT}`;
  return left.women > 0 ? "The spots left are for women." : left.men > 0 ? "The spots left are for men." : "This klique is full.";
}

/** A host may only open women-only (men-only) kliques if their profile says woman (man); mixed counts are for anyone. */
function assertAudience(viewer: IUser, input: { audience?: Audience; womenSpots?: number; menSpots?: number; maxMembers?: number }, current?: Pick<ICrew, "maxMembers">) {
  const a = input.audience;
  if (a === "women" && viewer.gender !== "woman") throw forbidden("Only women can open a women-only klique. (If that's you, set it in Settings, Profile.)");
  if (a === "men" && viewer.gender !== "man") throw forbidden("Only men can open a men-only klique. (If that's you, set it in Settings, Profile.)");
  if (a === "mixed") {
    const max = input.maxMembers ?? current?.maxMembers ?? 2;
    const w = input.womenSpots ?? 0;
    const m = input.menSpots ?? 0;
    if (w + m < 1) throw badRequest("Set how many spots are for women and how many for men.");
    if (w + m > max - 1) throw badRequest(`That's ${w + m} spots for women and men, but the klique only has ${max - 1}.`);
  }
}

/** Cards for any kliques (any mix of event and community ones), with the viewer's standing in each. */
async function toCards(crews: ICrew[], viewer: IUser | null, known: { events?: IEvent[] } = {}): Promise<CrewCardDTO[]> {
  if (!crews.length) return [];
  const ids = crews.map((c) => c._id);
  const eventIds = [...new Set(crews.flatMap((c) => (c.eventId ? [sid(c.eventId)] : [])))];
  const have = new Map((known.events ?? []).map((e) => [sid(e._id), e]));
  const missing = eventIds.filter((id) => !have.has(id));
  const [members, mine, fetched] = await Promise.all([
    CrewMember.find({ crewId: { $in: ids }, status: "active" }).sort({ role: 1, createdAt: 1 }).select("crewId userId role").lean<Pick<ICrewMember, "crewId" | "userId" | "role">[]>(),
    viewer ? CrewMember.find({ crewId: { $in: ids }, userId: viewer._id }).lean<ICrewMember[]>() : Promise.resolve<ICrewMember[]>([]),
    missing.length ? Event.find({ _id: { $in: missing } }).lean<IEvent[]>() : Promise.resolve<IEvent[]>([]),
  ]);
  for (const e of fetched) have.set(sid(e._id), e);
  const communityIds = [...new Set(crews.flatMap((c) => (c.communityId ? [sid(c.communityId)] : [])))];
  const subIds = [...new Set(crews.flatMap((c) => (c.subcommunityId ? [sid(c.subcommunityId)] : [])))];
  const [communities, subs] = await Promise.all([
    communityIds.length ? Community.find({ _id: { $in: communityIds } }).select("slug name verified official").lean<Pick<ICommunity, "_id" | "slug" | "name" | "verified" | "official">[]>() : [],
    subIds.length ? Subcommunity.find({ _id: { $in: subIds } }).select("slug").lean<Pick<ISubcommunity, "_id" | "slug">[]>() : [],
  ]);
  const communityById = new Map(communities.map((c) => [sid(c._id), c]));
  const subById = new Map(subs.map((s) => [sid(s._id), s.slug]));
  const byCrew = new Map<string, Types.ObjectId[]>();
  for (const m of members) {
    const list = byCrew.get(sid(m.crewId)) ?? [];
    // host first ("host" sorts before "member")
    if (list.length < FACES) list.push(m.userId);
    byCrew.set(sid(m.crewId), list);
  }
  const mineBy = new Map(mine.map((m) => [sid(m.crewId), m]));
  const [briefs, counts] = await Promise.all([loadBriefs([...crews.map((c) => c.hostId), ...members.map((m) => m.userId)]), slotCounts(crews.filter((c) => audienceOf(c) === "mixed").map((c) => c._id))]);
  return crews.map((c) => {
    const event = c.eventId ? (have.get(sid(c.eventId)) ?? null) : null;
    const community = c.communityId ? (communityById.get(sid(c.communityId)) ?? null) : null;
    const m = mineBy.get(sid(c._id));
    return {
      id: sid(c._id),
      eventId: c.eventId ? sid(c.eventId) : null,
      title: c.title,
      interest: c.interest,
      coverImage: c.coverImage ?? null,
      womenOnly: audienceOf(c) === "women",
      audience: audienceOf(c),
      womenSpots: c.womenSpots ?? 0,
      menSpots: c.menSpots ?? 0,
      left: spotsLeft(c, counts.get(sid(c._id))),
      event: event ? { id: sid(event._id), title: event.title, startsAt: event.startsAt.toISOString() } : null,
      community: community ? { slug: community.slug, name: community.name, verified: !!community.verified || !!community.official } : null,
      city: c.city,
      area: c.area,
      note: c.note,
      meetupAt: c.meetupAt.toISOString(),
      joinMode: c.joinMode,
      maxMembers: c.maxMembers,
      memberCount: c.memberCount,
      host: briefs.get(sid(c.hostId)) ?? GHOST,
      faces: (byCrew.get(sid(c._id)) ?? []).map((u) => briefs.get(sid(u)) ?? GHOST),
      isFull: c.memberCount >= c.maxMembers,
      closed: isClosed(c, event),
      space: community ? { slug: community.slug, sub: c.subcommunityId ? (subById.get(sid(c.subcommunityId)) ?? null) : null } : null,
      viewer: { standing: m ? standingOf(m) : null },
    };
  });
}

const standingOf = (m: Pick<ICrewMember, "role" | "status">): CrewStanding => (m.status === "pending" ? "pending" : m.role === "host" ? "host" : "member");

/** the most kliques one list shows, however far "Load more" goes */
const MAX_CREW_LIST = 200;

/**
 * An event's kliques, yours first, then the fullest-looking ones (busy kliques feel safer to join). `q` finds them
 * by title, area or note, never the members-only meetup point. `limit` is how many to show (the list grows by
 * "Load more"); `total` is how many match.
 */
export async function listEventCrews(viewer: IUser | null, eventId: string, opts: { q?: string; limit?: number } = {}): Promise<EventCrewsDTO> {
  if (isMinor(viewer)) throw notFound("We couldn't find that event.");
  const event = await visibleEvent(viewer, oid(eventId, "event"));
  const hidden = await hiddenUserIds(viewer?._id ?? null);
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), MAX_CREW_LIST);
  const q = opts.q?.trim();
  const filter: Record<string, unknown> = { eventId: event._id, hostId: { $nin: hidden } };
  const mineRow = viewer ? await CrewMember.findOne({ eventId: event._id, userId: viewer._id }).select("crewId").lean<{ crewId: Types.ObjectId }>() : null;
  // the event has started (or is off): its kliques are closed and out of sight, except the one you're in
  if (+event.startsAt <= Date.now() || event.cancelled) filter._id = mineRow?.crewId ?? null;
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ title: rx }, { area: rx }, { note: rx }];
  }
  // yours goes first (when it matches), the rest page after it
  const mineCrew = mineRow ? await Crew.findOne({ ...filter, _id: mineRow.crewId }).lean<ICrew>() : null;
  const [rest, total] = await Promise.all([
    Crew.find(mineCrew ? { ...filter, _id: { $ne: mineCrew._id } } : filter)
      .sort({ memberCount: -1, createdAt: 1 })
      .limit(mineCrew ? limit - 1 : limit)
      .lean<ICrew[]>(),
    Crew.countDocuments(filter),
  ]);
  // most people first, but the full ones after those with a spot left
  rest.sort((a, b) => (a.memberCount >= a.maxMembers ? 1 : 0) - (b.memberCount >= b.maxMembers ? 1 : 0));
  const cards = await toCards(mineCrew ? [mineCrew, ...rest] : rest, viewer, { events: [event] });
  const mineCard = cards.find((c) => c.viewer.standing);

  let reason: string | null = null;
  if (!viewer) reason = "Sign in to start a klique.";
  else if ((reason = personBlock(viewer, "start"))) {
    /* age or email */
  } else if (event.cancelled) reason = "This event was cancelled.";
  else if (event.online) reason = "Kliques are for meeting up in person.";
  else if (+event.startsAt <= Date.now()) reason = "This event has started.";
  else if (mineCard || mineRow) reason = "You're already in a klique for this event. Leave it to start your own.";
  else reason = (await spaceBlock(viewer, event)) ?? (await kliqueCreateBlock(viewer));
  // could they join someone else's klique (the list shows "View" instead of "Join" when not)
  const canJoin = !!viewer && !personBlock(viewer, "join") && !event.cancelled && !event.online && +event.startsAt > Date.now() && (await spaceBlock(viewer, event)) === null;

  return {
    crews: mineCard ? [mineCard, ...cards.filter((c) => c !== mineCard)] : cards,
    total,
    hasMore: total > cards.length,
    mine: mineCard?.id ?? (mineRow ? sid(mineRow.crewId) : null),
    canStart: reason === null,
    startBlockedReason: reason,
    canJoin,
  };
}

/** Why this viewer can't join (or ask to join) this klique right now, in words; null when they can. */
async function joinBlock(viewer: IUser, crew: ICrew, event: IEvent | null, card: Pick<CrewCardDTO, "closed" | "isFull">): Promise<string | null> {
  const person = personBlock(viewer, "join");
  if (person) return person;
  if (card.closed) return closedMessage(event);
  if (card.isFull) return "This klique is full.";
  const slot = slotFor(crew, viewer.gender, (await slotCounts([crew._id])).get(sid(crew._id)));
  if (slot !== "woman" && slot !== "man" && slot !== "any") return slot;
  if (event && (await CrewMember.exists({ eventId: event._id, userId: viewer._id }))) return "You're already in another klique for this event.";
  return (await spaceBlock(viewer, event ?? crew)) ?? (await kliqueJoinBlock(viewer));
}

export async function getCrew(viewer: IUser | null, crewId: string): Promise<CrewDTO> {
  const { crew, event } = await visibleCrew(viewer, crewId);
  const [card] = await toCards([crew], viewer, { events: event ? [event] : [] });
  const me = viewer ? await CrewMember.findOne({ crewId: crew._id, userId: viewer._id }).lean<ICrewMember>() : null;
  const standing = me ? standingOf(me) : null;
  const isHost = standing === "host";
  const inCrew = standing === "host" || standing === "member";

  const [members, pending] = await Promise.all([
    CrewMember.find({ crewId: crew._id, status: "active" }).sort({ role: 1, createdAt: 1 }).lean<ICrewMember[]>(),
    isHost ? CrewMember.find({ crewId: crew._id, status: "pending" }).sort({ createdAt: 1 }).lean<ICrewMember[]>() : Promise.resolve<ICrewMember[]>([]),
  ]);
  const briefs = await loadBriefs([...members, ...pending].map((m) => m.userId));
  const mod = !isHost && (await isKliqueMod(viewer, crew));

  // can this viewer join (or ask)?
  let joinBlockedReason: string | null = null;
  if (!viewer) joinBlockedReason = "Sign in to join.";
  else if (!standing) joinBlockedReason = await joinBlock(viewer, crew, event, card);
  const joinSpace = viewer && !standing && joinBlockedReason && !card.closed && !card.isFull ? await spaceNeed(viewer, event ?? crew) : null;

  return {
    ...card,
    meetupPoint: inCrew ? crew.meetupPoint : null,
    event: event ? { id: sid(event._id), title: event.title, startsAt: event.startsAt.toISOString(), endsAt: event.endsAt ? event.endsAt.toISOString() : null, venue: event.venue, online: !!event.online, coverImage: event.coverImage, city: event.city, country: event.country ?? "NG" } : null,
    members: members.map((m) => briefs.get(sid(m.userId)) ?? GHOST),
    requests: pending.map((m) => ({ user: briefs.get(sid(m.userId)) ?? GHOST, message: m.message, createdAt: m.createdAt.toISOString() })),
    expiresAt: crew.expiresAt.toISOString(),
    viewer: {
      standing,
      canEdit: isHost || mod,
      // moderators (site admins, the community's owner and admins) may read its chat (they can't post unless they're in it)
      canChat: inCrew || mod,
      canJoin: !standing && joinBlockedReason === null,
      joinBlockedReason: standing ? null : joinBlockedReason,
      joinSpace,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Kliques to join: "Kliques for you" and /kliques                     */
/* ------------------------------------------------------------------ */

/** Lagos-time day bounds for the `when` filter. */
function whenRange(when: "today" | "weekend" | "week" | undefined): { from: Date; to: Date } {
  const now = new Date();
  const lagos = new Date(+now + 3600_000); // wall clock in Lagos (UTC+1)
  const dayStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 3600_000);
  if (when === "today") return { from: now, to: new Date(+dayStart(lagos) + DAY_MS) };
  if (when === "weekend") {
    const dow = lagos.getUTCDay(); // 0 Sun … 6 Sat
    const toFri = (5 - dow + 7) % 7;
    const fri = new Date(+dayStart(lagos) + (dow === 0 || dow === 6 ? -((dow + 2) % 7) : toFri) * DAY_MS);
    const from = new Date(Math.max(+now, +fri + 17 * 3600_000)); // Friday evening on
    return { from, to: new Date(+fri + 3 * DAY_MS) };
  }
  if (when === "week") return { from: now, to: new Date(+now + 7 * DAY_MS) };
  return { from: now, to: new Date(+now + MAX_AHEAD_MS) };
}

/**
 * Kliques someone could join, best for them first: in their interests, then their city, then soonest, then the
 * busiest (Pro hosts nudged up a little). `forYou` (Home) leaves out ones they're already in, full ones and
 * women-only ones they can't join. Only kliques they may see; nothing for under-18s.
 */
export async function listKliques(viewer: IUser | null, q: z.infer<typeof kliqueListQuery>, opts: { forYou?: boolean } = {}): Promise<KliqueListDTO> {
  if (isMinor(viewer)) return { items: [], hasMore: false };
  const { from, to } = whenRange(q.when);
  const hidden = await hiddenUserIds(viewer?._id ?? null);
  const filter: Record<string, unknown> = { meetupAt: { $gt: from, $lte: to }, hostId: { $nin: hidden } };
  const scope = parseScope(q.where);
  if (q.community) {
    const c = await Community.findOne({ slug: q.community.toLowerCase() }).select("_id").lean<{ _id: Types.ObjectId }>();
    if (!c) return { items: [], hasMore: false };
    filter.communityId = c._id;
  } else if (scope) {
    // kliques keep a country and city (no state): a state counts as its country
    Object.assign(filter, scope.level === "region" ? { country: scope.country } : scopeFilter(scope));
  } else if (viewer?.country) filter.country = viewer.country;
  if (q.mine && viewer) {
    const mine = await Membership.find({ userId: viewer._id, subcommunityId: null, status: "active" }).distinct("communityId");
    filter.communityId = filter.communityId ? (mine.some((id) => sid(id) === sid(filter.communityId as Types.ObjectId)) ? filter.communityId : null) : { $in: mine };
  }
  if (q.interest) filter.interest = q.interest;
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), "i");
    filter.$or = [{ title: rx }, { area: rx }, { note: rx }];
  }
  // recommendations are for joining, and "Hide full" asks for the same: only kliques with a spot left
  if (opts.forYou || q.open) filter.$expr = { $lt: ["$memberCount", "$maxMembers"] };
  const pool = await Crew.find(filter).sort({ meetupAt: 1 }).limit(400).lean<ICrew[]>();

  // only what this viewer may see: events they can see, communities that are public or theirs
  const events = await Event.find({ _id: { $in: pool.flatMap((c) => (c.eventId ? [c.eventId] : [])) } }).lean<IEvent[]>();
  const eventOk = new Map<string, boolean>();
  await Promise.all(events.map(async (e) => eventOk.set(sid(e._id), !e.review && !e.cancelled && !e.online && +e.startsAt > Date.now() && (await canViewEvent(e, viewer)))));
  const communityIds = [...new Set(pool.flatMap((c) => (!c.eventId && c.communityId ? [sid(c.communityId)] : [])))];
  const [communities, myMemberships, mine] = await Promise.all([
    Community.find({ _id: { $in: communityIds } }).select(COMMUNITY_FIELDS).lean<CommunityBits[]>(),
    viewer ? Membership.find({ userId: viewer._id, subcommunityId: null, status: "active" }).select("communityId").lean<{ communityId: Types.ObjectId }[]>() : [],
    viewer && opts.forYou ? CrewMember.find({ userId: viewer._id }).select("crewId").lean<{ crewId: Types.ObjectId }[]>() : [],
  ]);
  const inCommunity = new Set(myMemberships.map((m) => sid(m.communityId)));
  // a community's kliques are for its members; looking at one community's own list also shows a public one's
  const communityOk = new Map(communities.map((c) => [sid(c._id), (viewer && isSiteAdmin(viewer)) || inCommunity.has(sid(c._id)) || (!!q.community && c.privacy === "public" && !c.adult)]));
  const already = new Set(mine.map((m) => sid(m.crewId)));
  const interests = new Set(viewer?.interests ?? []);
  const visible = pool.filter((c) => {
    if (c.eventId) {
      if (!eventOk.get(sid(c.eventId))) return false;
    } else if (c.communityId && !communityOk.get(sid(c.communityId))) return false;
    if (opts.forYou) {
      if (already.has(sid(c._id)) || (viewer && sid(c.hostId) === sid(viewer._id))) return false;
      // all communities: recommended only to people into it (anyone can still find it in the list)
      if (!c.eventId && !c.communityId && !interests.has(c.interest)) return false;
      const a = audienceOf(c);
      if ((a === "women" && viewer?.gender !== "woman") || (a === "men" && viewer?.gender !== "man")) return false;
    }
    return true;
  });

  const boosted = await kliqueBoost(visible.map((c) => c.hostId));
  const now = Date.now();
  const score = (c: ICrew) =>
    (interests.has(c.interest) ? 4 : 0) +
    (viewer?.city && c.city === viewer.city ? 2 : 0) +
    // sooner is better: a full point today, fading over two weeks
    Math.max(0, 1 - (+c.meetupAt - now) / (14 * DAY_MS)) +
    Math.log2(1 + c.memberCount) * 0.5 +
    (boosted.has(sid(c.hostId)) ? 0.75 : 0);
  // full ones still show, after every klique with a spot left (leaving reopens one: memberCount drops)
  const full = (c: ICrew) => (c.memberCount >= c.maxMembers ? 1 : 0);
  visible.sort((a, b) => full(a) - full(b) || score(b) - score(a) || +a.meetupAt - +b.meetupAt);

  const start = (q.page - 1) * q.limit;
  const slice = visible.slice(start, start + q.limit);
  return { items: await toCards(slice, viewer, { events }), hasMore: visible.length > start + q.limit };
}

/** Before the "Start a klique" form: can they, may they offer Women only, and which communities can they use. */
export async function kliqueStartInfo(viewer: IUser): Promise<KliqueStartDTO> {
  const rows = await Membership.find({ userId: viewer._id, subcommunityId: null, status: "active" }).select("communityId").lean<{ communityId: Types.ObjectId }[]>();
  const communities = await Community.find({ _id: { $in: rows.map((r) => r.communityId) } }).select("slug name interest").sort({ name: 1 }).lean<Pick<ICommunity, "slug" | "name" | "interest">[]>();
  return {
    canWomenOnly: viewer.gender === "woman",
    canMenOnly: viewer.gender === "man",
    blockedReason: personBlock(viewer, "start") ?? (await kliqueCreateBlock(viewer)),
    communities: communities.map((c) => ({ slug: c.slug, name: c.name, interest: c.interest })),
  };
}

/** Unread messages (other people's, capped at 99) in each of these kliques' chats, for this person. */
export async function crewUnreadCounts(userId: Types.ObjectId, crewIds: Types.ObjectId[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!crewIds.length) return out;
  const reads = await CrewRead.find({ userId, crewId: { $in: crewIds } }).lean<ICrewRead[]>();
  const readBy = new Map(reads.map((r) => [sid(r.crewId), r.lastReadMessageId]));
  await Promise.all(
    crewIds.slice(0, 50).map(async (id) => {
      const after = readBy.get(sid(id));
      const n = await CrewMessage.countDocuments({ crewId: id, userId: { $ne: userId }, ...(after ? { _id: { $gt: after } } : {}) }, { limit: 99 });
      if (n) out.set(sid(id), n);
    }),
  );
  return out;
}

/**
 * Every klique you're in or asked to join, for the Joined list: ones still to come first, soonest first, with the
 * chat's unread count and last message (only for ones you're in). A request for a klique that has closed is dropped.
 */
export async function joinedKliques(viewer: IUser): Promise<JoinedKliqueDTO[]> {
  if (isMinor(viewer)) return [];
  const rows = await CrewMember.find({ userId: viewer._id }).select("crewId status").lean<Pick<ICrewMember, "crewId" | "status">[]>();
  if (!rows.length) return [];
  const crews = await Crew.find({ _id: { $in: rows.map((r) => r.crewId) } }).sort({ meetupAt: 1 }).limit(MAX_CREW_LIST).lean<ICrew[]>();
  const events = await Event.find({ _id: { $in: crews.flatMap((c) => (c.eventId ? [c.eventId] : [])) } }).lean<IEvent[]>();
  const eventById = new Map(events.map((e) => [sid(e._id), e]));
  const statusOf = new Map(rows.map((r) => [sid(r.crewId), r.status]));
  const kept: ICrew[] = [];
  for (const c of crews) {
    const e = c.eventId ? (eventById.get(sid(c.eventId)) ?? null) : null;
    if (c.eventId && (!e || !(await canViewEvent(e, viewer)))) continue;
    if (statusOf.get(sid(c._id)) === "pending" && kliqueClosed(c, e)) continue;
    kept.push(c);
  }
  // what's still to come goes first; a finished one stays at the end until it deletes itself
  const over = (c: ICrew) => (kliqueOver(c, c.eventId ? (eventById.get(sid(c.eventId)) ?? null) : null) ? 1 : 0);
  kept.sort((a, b) => over(a) - over(b) || +a.meetupAt - +b.meetupAt);

  const inIds = kept.filter((c) => statusOf.get(sid(c._id)) === "active").map((c) => c._id);
  const hidden = await hiddenUserIds(viewer._id);
  const [cards, unread, latest] = await Promise.all([
    toCards(kept, viewer, { events }),
    crewUnreadCounts(viewer._id, inIds),
    inIds.length
      ? CrewMessage.aggregate<{ _id: Types.ObjectId; msg: ICrewMessage }>([
          { $match: { crewId: { $in: inIds }, deletedAt: null, userId: { $nin: hidden } } },
          { $sort: { _id: -1 } },
          { $group: { _id: "$crewId", msg: { $first: "$$ROOT" } } },
        ])
      : Promise.resolve([]),
  ]);
  const authors = await loadBriefs(latest.map((l) => l.msg.userId));
  const lastBy = new Map(latest.map((l) => [sid(l._id), l.msg]));
  return cards.map((card) => {
    const m = lastBy.get(card.id);
    return {
      ...card,
      unreadCount: unread.get(card.id) ?? 0,
      lastMessage: m ? { author: (authors.get(sid(m.userId)) ?? GHOST).displayName, mine: sid(m.userId) === sid(viewer._id), text: m.pollId ? "📊 Poll" : previewOf({ body: m.body, sticker: m.sticker, stickerUrl: m.stickerUrl, images: m.images }), at: m.createdAt.toISOString() } : null,
    };
  });
}

/**
 * You've seen the chat up to `messageId` (never moves backwards). `looking`: they have it open right now
 * (fetching it), as opposed to having just posted.
 */
async function markCrewRead(userId: Types.ObjectId, crew: Pick<ICrew, "_id" | "expiresAt">, messageId: Types.ObjectId, looking = true) {
  await CrewRead.updateOne(
    { userId, crewId: crew._id, $or: [{ lastReadMessageId: null }, { lastReadMessageId: { $lt: messageId } }] },
    { $set: { lastReadMessageId: messageId, ...(looking ? { readAt: new Date() } : {}), expiresAt: crew.expiresAt } },
    { upsert: true },
  ).catch(async (e) => {
    if (!isDup(e)) throw e;
    // already further along: still note that they're looking
    if (looking) await CrewRead.updateOne({ userId, crewId: crew._id }, { $set: { readAt: new Date() } });
  });
  // the chat's bundled notifications are read now too
  const cleared = await Notification.updateMany({ userId, groupKey: { $in: [`crew-chat:${sid(crew._id)}`, `crew-reply:${sid(crew._id)}`] }, read: false }, { $set: { read: true } });
  // the bell (and the notifications page) catch up in every open tab
  if (cleared.modifiedCount) publish([rtChannel.user(sid(userId))], { type: "notify", category: "crews", ref: `crew:${sid(crew._id)}`, inbox: true });
}

/**
 * The kliques you're in (or asked to join) in this community and its groups (its events' and its own), soonest
 * first, for the "Your kliques" list on the community's left. Only ones you can still see.
 */
export async function myCommunityCrews(viewer: IUser, slug: string): Promise<MyCrewDTO[]> {
  const community = await Community.findOne({ slug: slug.toLowerCase() }).select("_id").lean<Pick<ICommunity, "_id">>();
  if (!community) throw notFound("We couldn't find that community.");
  if (isMinor(viewer)) return [];
  const rows = await CrewMember.find({ userId: viewer._id }).select("crewId role status").lean<Pick<ICrewMember, "crewId" | "role" | "status">[]>();
  if (!rows.length) return [];
  const crews = await Crew.find({ _id: { $in: rows.map((r) => r.crewId) }, communityId: community._id }).sort({ meetupAt: 1 }).lean<ICrew[]>();
  if (!crews.length) return [];
  const [events, subs] = await Promise.all([
    Event.find({ _id: { $in: crews.flatMap((c) => (c.eventId ? [c.eventId] : [])) } }).lean<IEvent[]>(),
    Subcommunity.find({ _id: { $in: crews.map((c) => c.subcommunityId).filter(Boolean) } }).select("slug").lean<Pick<ISubcommunity, "_id" | "slug">[]>(),
  ]);
  const eventById = new Map(events.map((e) => [sid(e._id), e]));
  const subById = new Map(subs.map((s) => [sid(s._id), s.slug]));
  const activeIn = crews.filter((c) => rows.some((r) => sid(r.crewId) === sid(c._id) && r.status === "active")).map((c) => c._id);
  const unread = await crewUnreadCounts(viewer._id, activeIn);
  const out: MyCrewDTO[] = [];
  for (const c of crews) {
    const e = c.eventId ? eventById.get(sid(c.eventId)) : null;
    if (c.eventId && (!e || !(await canViewEvent(e, viewer)))) continue;
    const r = rows.find((x) => sid(x.crewId) === sid(c._id))!;
    out.push({ id: sid(c._id), title: c.title, area: c.area, eventId: e ? sid(e._id) : null, eventTitle: e?.title ?? null, meetupAt: c.meetupAt.toISOString(), memberCount: c.memberCount, standing: standingOf(r)!, sub: c.subcommunityId ? (subById.get(sid(c.subcommunityId)) ?? null) : null, unreadCount: unread.get(sid(c._id)) ?? 0 });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Start, edit, delete                                                 */
/* ------------------------------------------------------------------ */

type KliqueInput = z.infer<typeof crewCreateSchema>;

async function startKlique(viewer: IUser, input: KliqueInput, where: { event: IEvent | null; community: Pick<ICommunity, "_id" | "country" | "city"> | null; place?: { country: string; city: string } }): Promise<CrewDTO> {
  const person = personBlock(viewer, "start");
  if (person) throw forbidden(person);
  assertVerified(viewer);
  // older apps send womenOnly; the form now sends who can join
  const audience: Audience = input.audience !== "everyone" ? input.audience : input.womenOnly ? "women" : "everyone";
  assertAudience(viewer, { audience, womenSpots: input.womenSpots, menSpots: input.menSpots, maxMembers: input.maxMembers });
  const limit = await kliqueCreateBlock(viewer);
  if (limit) throw new ApiError(403, limit, { code: "plan_limit" });
  validateMeetup(input.meetupAt, where.event);
  rateLimit(`crew-create:${sid(viewer._id)}`, 10, DAY_MS);

  const { event, community, place } = where;
  if (event && (await CrewMember.exists({ eventId: event._id, userId: viewer._id }))) throw conflict("You're already in a klique for this event. Leave it to start your own.");

  const expiresAt = event ? crewExpiry(event) : meetupExpiry(input.meetupAt);
  let crew: ICrew;
  try {
    crew = (
      await Crew.create({
        eventId: event?._id ?? null,
        hostId: viewer._id,
        title: input.title,
        interest: input.interest,
        coverImage: input.coverImage,
        womenOnly: audience === "women",
        audience,
        womenSpots: audience === "mixed" ? input.womenSpots : 0,
        menSpots: audience === "mixed" ? input.menSpots : 0,
        country: event?.country ?? community?.country ?? place?.country ?? viewer.country ?? "NG",
        city: event?.city ?? community?.city ?? place?.city ?? viewer.city ?? "",
        area: input.area,
        meetupPoint: input.meetupPoint,
        meetupAt: input.meetupAt,
        note: input.note,
        joinMode: input.joinMode,
        maxMembers: input.maxMembers,
        memberCount: 1,
        communityId: event ? (event.communityId ?? null) : (community?._id ?? null),
        subcommunityId: event?.subcommunityId ?? null,
        expiresAt,
      })
    ).toObject();
  } catch (e) {
    if (isDup(e)) throw conflict("You've already started a klique for this event.");
    throw e;
  }
  try {
    await CrewMember.create({ crewId: crew._id, eventId: event?._id ?? null, userId: viewer._id, role: "host", status: "active", expiresAt });
  } catch (e) {
    await Crew.deleteOne({ _id: crew._id }); // lost a race with joining another klique
    if (isDup(e)) throw conflict("You're already in a klique for this event. Leave it to start your own.");
    throw e;
  }
  await noteKliqueStart(viewer._id);
  return getCrew(viewer, sid(crew._id));
}

/** A klique for going to an event together. */
export async function createCrew(viewer: IUser, eventId: string, input: KliqueInput): Promise<CrewDTO> {
  if (isMinor(viewer)) throw notFound("We couldn't find that event.");
  const event = await visibleEvent(viewer, oid(eventId, "event"));
  assertEventOpen(event);
  const blocked = await spaceBlock(viewer, event);
  if (blocked) throw forbidden(blocked);
  return startKlique(viewer, input, { event, community: null });
}

/** A community's klique: anything its members want to do together. `community: null` is all communities, in a place. */
export async function createCommunityKlique(viewer: IUser, input: z.infer<typeof kliqueCreateSchema>): Promise<CrewDTO> {
  if (input.community === null) {
    if (isMinor(viewer)) throw forbidden("Kliques are for people 18 and over.");
    const city = slugify(input.city ?? "");
    if (!isCountryCode(input.country)) throw new ApiError(400, "Pick a country.", { errors: { country: "Pick a country." } });
    if (!city) throw new ApiError(400, "Which city is it in?", { errors: { city: "Which city is it in?" } });
    return startKlique(viewer, input, { event: null, community: null, place: { country: input.country, city } });
  }
  const community = await Community.findOne({ slug: input.community.toLowerCase() }).select(COMMUNITY_FIELDS).lean<CommunityBits>();
  if (!community || isMinor(viewer)) throw notFound("We couldn't find that community.");
  if (!(await isMemberOf(viewer, community._id))) throw forbidden(`Join ${community.name} to start a klique there.`);
  await assertNoCommunityTimeout(viewer._id, community._id);
  const { community: _slug, ...rest } = input;
  void _slug;
  const made = await startKlique(viewer, rest, { event: null, community });
  void import("./bots.service").then((b) => b.emitBotEvent(community._id, "klique.create", { klique: { id: made.id, title: made.title, meetupAt: made.meetupAt, area: made.area }, host: { id: sid(viewer._id), handle: viewer.handle } }));
  return made;
}

/**
 * Moderates this klique: a site admin, or an owner or admin of the community (or group) it belongs to. They can
 * read its chat, remove messages and members, edit it and call it off, like its host.
 */
async function isKliqueMod(viewer: IUser | null, crew: Pick<ICrew, "communityId" | "subcommunityId">): Promise<boolean> {
  if (!viewer) return false;
  if (isSiteAdmin(viewer)) return true;
  if (!crew.communityId) return false;
  const [community, sub] = await Promise.all([Community.findById(crew.communityId).lean<ICommunity>(), crew.subcommunityId ? Subcommunity.findById(crew.subcommunityId).lean<ISubcommunity>() : null]);
  if (!community) return false;
  return (await spaceAccess({ community, sub }, viewer)).canManage;
}

async function hostCrew(viewer: IUser, crewId: string) {
  const found = await visibleCrew(viewer, crewId);
  if (sid(found.crew.hostId) !== sid(viewer._id) && !(await isKliqueMod(viewer, found.crew))) throw forbidden("Only the klique's host can do that.");
  return found;
}

export async function updateCrew(viewer: IUser, crewId: string, patch: z.infer<typeof crewUpdateSchema>): Promise<CrewDTO> {
  const { crew, event } = await hostCrew(viewer, crewId);
  if (patch.meetupAt) validateMeetup(patch.meetupAt, event);
  if (patch.maxMembers !== undefined && patch.maxMembers < crew.memberCount) throw badRequest(`${crew.memberCount - 1} ${crew.memberCount - 1 === 1 ? "person is" : "people are"} already in. Remove someone first, or keep at least ${crew.memberCount - 1} ${crew.memberCount - 1 === 1 ? "spot" : "spots"}.`);
  const set: Record<string, unknown> = { ...patch };
  // who can join: a women-only (men-only) klique needs a host whose profile says so, and can't leave out anyone already in
  const nextAudience: Audience = patch.audience ?? (patch.womenOnly === true ? "women" : patch.womenOnly === false && audienceOf(crew) === "women" ? "everyone" : audienceOf(crew));
  const rulesChanged = nextAudience !== audienceOf(crew) || patch.womenSpots !== undefined || patch.menSpots !== undefined || (nextAudience === "mixed" && patch.maxMembers !== undefined);
  if (rulesChanged) {
    const host = (await User.findById(crew.hostId).select("gender").lean<Pick<IUser, "gender">>()) ?? { gender: "unspecified" as const };
    const next = { audience: nextAudience, womenSpots: nextAudience === "mixed" ? (patch.womenSpots ?? crew.womenSpots ?? 0) : 0, menSpots: nextAudience === "mixed" ? (patch.menSpots ?? crew.menSpots ?? 0) : 0, maxMembers: patch.maxMembers ?? crew.maxMembers };
    if (nextAudience !== audienceOf(crew)) assertAudience({ ...viewer, gender: host.gender } as IUser, next);
    else if (nextAudience === "mixed") assertAudience(viewer, next);
    // everyone already in (or asking) has to fit the new rules
    const inside = await CrewMember.find({ crewId: crew._id, role: "member" }).select("_id userId status").lean<{ _id: Types.ObjectId; userId: Types.ObjectId; status: string }[]>();
    const genders = new Map((await User.find({ _id: { $in: inside.map((m) => m.userId) } }).select("gender").lean<{ _id: Types.ObjectId; gender?: IUser["gender"] }[]>()).map((u) => [sid(u._id), u.gender ?? "unspecified"]));
    const active = inside.filter((m) => m.status === "active");
    const g = (m: { userId: Types.ObjectId }) => genders.get(sid(m.userId)) ?? "unspecified";
    if (nextAudience === "women" && active.some((m) => g(m) !== "woman")) throw badRequest("Someone already in isn't a woman, so this can't be women only. Remove them first.");
    if (nextAudience === "men" && active.some((m) => g(m) !== "man")) throw badRequest("Someone already in isn't a man, so this can't be men only. Remove them first.");
    if (nextAudience === "mixed") {
      // hand out the spots again: women and men first to their own spots, everyone else to "anyone" spots
      let w = next.womenSpots;
      let m = next.menSpots;
      let any = next.maxMembers - 1 - w - m;
      const slots: { id: Types.ObjectId; slot: Slot }[] = [];
      for (const x of active) {
        const gender = g(x);
        let slot: Slot;
        if (gender === "woman" && w > 0) {
          w--;
          slot = "woman";
        } else if (gender === "man" && m > 0) {
          m--;
          slot = "man";
        } else if (any > 0) {
          any--;
          slot = "any";
        } else throw badRequest("The people already in don't fit those numbers. Give them more spots, or remove someone first.");
        slots.push({ id: x._id, slot });
      }
      for (const x of slots) await CrewMember.updateOne({ _id: x.id }, { $set: { slot: x.slot } });
    }
    set.audience = nextAudience;
    set.womenOnly = nextAudience === "women";
    set.womenSpots = next.womenSpots;
    set.menSpots = next.menSpots;
  }
  // a community klique lasts until a day after it happens: moving it moves that too
  if (!event && patch.meetupAt) set.expiresAt = meetupExpiry(patch.meetupAt);
  await Crew.updateOne({ _id: crew._id }, { $set: set });
  if (set.expiresAt) await syncKliqueExpiry(crew._id, set.expiresAt as Date);
  if (patch.coverImage && crew.coverImage && patch.coverImage !== crew.coverImage && !(await Event.exists({ coverImage: crew.coverImage }))) deleteUploads([crew.coverImage]);
  void pingCrew(crew._id);

  // anything people in the klique would want to know about gets a ping: place, time, where from, the note
  const moved = (patch.meetupPoint && patch.meetupPoint !== crew.meetupPoint) || (patch.meetupAt && +patch.meetupAt !== +crew.meetupAt);
  const changes: string[] = [];
  if (moved) changes.push(`now meeting at ${patch.meetupPoint ?? crew.meetupPoint}, ${at(patch.meetupAt ?? crew.meetupAt)}`);
  if (patch.area && patch.area !== crew.area) changes.push(`coming from ${patch.area}`);
  if (patch.note !== undefined && patch.note.trim() !== crew.note.trim()) changes.push(patch.note.trim() ? `new note: "${snippet(patch.note.trim(), 80)}"` : "the note was removed");
  if (changes.length) {
    const members = await CrewMember.find({ crewId: crew._id, status: "active", userId: { $ne: viewer._id } }).select("userId").lean<{ userId: Types.ObjectId }[]>();
    const body = changes.join("; ");
    const title = patch.title ?? crew.title;
    notify(members.map((m) => m.userId), { title: `Klique update · ${quote(title, 50)}`, body: body[0].toUpperCase() + body.slice(1) + ".", data: { type: "crew", id: sid(crew._id) } }, { category: "crews", groupKey: `crew-update:${sid(crew._id)}`, many: (n) => `Your klique changed ${n} times · ${quote(title, 50)}`, ref: `crew:${sid(crew._id)}` });
  }
  if (patch.meetupAt && +patch.meetupAt !== +crew.meetupAt) await Crew.updateOne({ _id: crew._id }, { $set: { reminderSentAt: null } });
  return getCrew(viewer, crewId);
}

/** Where to send people when a klique is off: its event, its community, or the kliques page. */
const offData = (crew: Pick<ICrew, "eventId">): Record<string, string> => (crew.eventId ? { type: "event", id: sid(crew.eventId) } : { href: "/kliques" });

export async function deleteCrew(viewer: IUser, crewId: string) {
  const { crew } = await hostCrew(viewer, crewId);
  if (sid(crew.hostId) !== sid(viewer._id)) await logModDelete(viewer, { communityId: crew.communityId, authorId: crew.hostId }, "klique", crew._id, `Klique: ${crew.title}`);
  const members = await CrewMember.find({ crewId: crew._id, userId: { $ne: viewer._id } }).select("userId").lean<{ userId: Types.ObjectId }[]>();
  await pingCrew(crew._id);
  await purgeCrews({ _id: crew._id });
  notify(members.map((m) => m.userId), { title: "Klique called off", body: `${quote(crew.title)} was called off. You can join or start another one.`, data: offData(crew) }, { category: "crews", ref: `crew:${sid(crew._id)}` });
  return { deleted: true };
}

/* ------------------------------------------------------------------ */
/* Joining                                                             */
/* ------------------------------------------------------------------ */

/** Add one to the head count, but only while there's room. */
async function takeSpot(crewId: Types.ObjectId): Promise<boolean> {
  const r = await Crew.updateOne({ _id: crewId, $expr: { $lt: ["$memberCount", "$maxMembers"] } }, { $inc: { memberCount: 1 } });
  return r.modifiedCount === 1;
}

export async function joinCrew(viewer: IUser, crewId: string, message: string): Promise<CrewDTO> {
  assertVerified(viewer);
  const { crew, event } = await visibleCrew(viewer, crewId);
  if (isClosed(crew, event)) throw conflict(closedMessage(event));
  if (event) assertEventOpen(event);
  if (await CrewMember.exists({ crewId: crew._id, userId: viewer._id })) return getCrew(viewer, crewId);
  const blocked = await joinBlock(viewer, crew, event, { closed: isClosed(crew, event), isFull: crew.memberCount >= crew.maxMembers });
  if (blocked) throw new ApiError(403, blocked, (await kliqueJoinBlock(viewer)) === blocked ? { code: "plan_limit" } : {});
  rateLimit(`crew-join:${sid(viewer._id)}`, 30, 60 * 60_000);

  const status = crew.joinMode === "open" ? "active" : "pending";
  // the spot they take (mixed kliques); asking to join gets one when they're let in
  const slot = status === "active" ? slotFor(crew, viewer.gender, (await slotCounts([crew._id])).get(sid(crew._id))) : null;
  if (slot && slot !== "woman" && slot !== "man" && slot !== "any") throw conflict(slot);
  let row: ICrewMember;
  try {
    row = (await CrewMember.create({ crewId: crew._id, eventId: crew.eventId ?? null, userId: viewer._id, role: "member", status, message, slot: slot as Slot | null, expiresAt: crew.expiresAt })).toObject();
  } catch (e) {
    if (isDup(e)) throw conflict("You're already in a klique for this event. Leave it first to join this one.");
    throw e;
  }

  const name = quote(crew.title, 50);
  if (status === "active") {
    if (!(await takeSpot(crew._id))) {
      await CrewMember.deleteOne({ _id: row._id });
      throw conflict("This klique just filled up.");
    }
    void pingCrew(crew._id);
    notify([crew.hostId], { title: `${viewer.displayName} joined your klique`, body: `${name} · ${crew.memberCount + 1} in now.`, data: { type: "crew", id: sid(crew._id) } }, { actorId: viewer._id, category: "crews", groupKey: `crew-join:${sid(crew._id)}`, many: (n) => `${n} people joined your klique ${name}`, ref: `crew:${sid(crew._id)}` });
  } else {
    void pingCrew(crew._id);
    notify([crew.hostId], { title: `${viewer.displayName} wants to join your klique`, body: message ? `"${message}"` : `${name}. Tap to accept or decline.`, data: { href: `/kliques/${sid(crew._id)}?tab=requests` } }, { actorId: viewer._id, action: { kind: "crewRequest", crewId: sid(crew._id), userId: sid(viewer._id) }, image: crew.coverImage ?? event?.coverImage ?? null, category: "crews", groupKey: `crew-req:${sid(crew._id)}`, many: (n) => `${n} people want to join your klique ${name}`, ref: `crew:${sid(crew._id)}` });
  }
  return getCrew(viewer, crewId);
}

/** Leave a klique, or take back a request. The host can't leave: they call it off instead. */
export async function leaveCrew(viewer: IUser, crewId: string): Promise<CrewDTO> {
  const { crew } = await visibleCrew(viewer, crewId);
  const me = await CrewMember.findOne({ crewId: crew._id, userId: viewer._id }).lean<ICrewMember>();
  if (!me) return getCrew(viewer, crewId);
  if (me.role === "host") throw badRequest("You're the host. Call the klique off instead.");
  await CrewMember.deleteOne({ _id: me._id });
  if (me.status === "active") {
    await Crew.updateOne({ _id: crew._id, memberCount: { $gt: 1 } }, { $inc: { memberCount: -1 } });
    notify([crew.hostId], { title: `${viewer.displayName} left your klique`, body: `${quote(crew.title, 50)}. A spot is open again.`, data: { type: "crew", id: sid(crew._id) } }, { actorId: viewer._id, category: "crews", groupKey: `crew-left:${sid(crew._id)}`, many: (n) => `${n} people left your klique ${quote(crew.title, 50)}`, ref: `crew:${sid(crew._id)}` });
  }
  void pingCrew(crew._id);
  return getCrew(viewer, crewId);
}

const welcome = (crew: Pick<ICrew, "_id" | "title" | "meetupAt">) => ({ title: "You're in the klique", body: `${quote(crew.title, 50)} · meeting ${at(crew.meetupAt)}. Tap for the meetup point.`, data: { type: "crew", id: sid(crew._id) } });

export async function decideRequest(viewer: IUser, crewId: string, userId: string, accept: boolean): Promise<CrewDTO> {
  const { crew, event } = await hostCrew(viewer, crewId);
  const row = await CrewMember.findOne({ crewId: crew._id, userId: oid(userId, "person"), status: "pending" }).lean<ICrewMember>();
  if (!row) throw notFound("That request is gone.");
  if (!accept) {
    await CrewMember.deleteOne({ _id: row._id });
    void pingCrew(crew._id, { also: [row.userId] });
    notify([row.userId], declined(crew), { category: "crews", ref: `crew:${sid(crew._id)}` });
    return getCrew(viewer, crewId);
  }
  if (isClosed(crew, event)) throw conflict(closedMessage(event));
  // there has to be a spot for them under the klique's rules
  const gender = (await User.findById(row.userId).select("gender").lean<Pick<IUser, "gender">>())?.gender;
  const slot = slotFor(crew, gender, (await slotCounts([crew._id])).get(sid(crew._id)));
  if (slot !== "woman" && slot !== "man" && slot !== "any") throw conflict(`No spot for them: ${slot.replace(GENDER_HINT, "Their profile doesn't say a gender.")}`);
  if (!(await takeSpot(crew._id))) throw conflict("Your klique is full. Raise the limit or remove someone first.");
  await CrewMember.updateOne({ _id: row._id }, { $set: { status: "active", slot } });
  void pingCrew(crew._id);
  notify([row.userId], welcome(crew), { category: "crews", ref: `crew:${sid(crew._id)}` });
  return getCrew(viewer, crewId);
}

/**
 * Host: answer every waiting request at once. "Accept all" lets people in oldest first while there's room
 * (anyone left over keeps waiting); "Decline all" clears the queue.
 */
export async function decideAll(viewer: IUser, crewId: string, accept: boolean): Promise<CrewDTO> {
  const { crew, event } = await hostCrew(viewer, crewId);
  const pending = await CrewMember.find({ crewId: crew._id, status: "pending" }).sort({ createdAt: 1 }).lean<ICrewMember[]>();
  if (!pending.length) return getCrew(viewer, crewId);
  if (!accept) {
    await CrewMember.deleteMany({ _id: { $in: pending.map((p) => p._id) } });
    void pingCrew(crew._id, { also: pending.map((p) => p.userId) });
    notify(pending.map((p) => p.userId), declined(crew), { category: "crews", ref: `crew:${sid(crew._id)}` });
    return getCrew(viewer, crewId);
  }
  if (isClosed(crew, event)) throw conflict(closedMessage(event));
  const room = Math.max(0, crew.maxMembers - crew.memberCount);
  if (!room) throw conflict("Your klique is full. Raise the limit or remove someone first.");
  // oldest first, each only if there's a spot for them under the klique's rules
  const counts = (await slotCounts([crew._id])).get(sid(crew._id)) ?? { woman: 0, man: 0, any: 0 };
  const genders = new Map((await User.find({ _id: { $in: pending.map((p) => p.userId) } }).select("gender").lean<{ _id: Types.ObjectId; gender?: IUser["gender"] }[]>()).map((u) => [sid(u._id), u.gender]));
  const take: (ICrewMember & { slot: Slot })[] = [];
  let used = 0;
  for (const p of pending) {
    if (take.length >= room) break;
    const s = slotFor({ ...crew, memberCount: crew.memberCount + used }, genders.get(sid(p.userId)), counts);
    if (s !== "woman" && s !== "man" && s !== "any") continue;
    counts[s]++;
    used++;
    take.push({ ...p, slot: s });
  }
  if (!take.length) throw conflict("None of the people asking fit the spots left.");
  // claim the spots first, so two clicks can't overfill the klique
  const claimed = await Crew.updateOne({ _id: crew._id, memberCount: crew.memberCount }, { $inc: { memberCount: take.length } });
  if (!claimed.modifiedCount) throw conflict("The klique just changed. Try again.");
  for (const p of take) await CrewMember.updateOne({ _id: p._id }, { $set: { status: "active", slot: p.slot } });
  void pingCrew(crew._id);
  notify(take.map((p) => p.userId), welcome(crew), { category: "crews", ref: `crew:${sid(crew._id)}` });
  return getCrew(viewer, crewId);
}

export async function removeMember(viewer: IUser, crewId: string, userId: string): Promise<CrewDTO> {
  const { crew } = await hostCrew(viewer, crewId);
  const row = await CrewMember.findOne({ crewId: crew._id, userId: oid(userId, "person") }).lean<ICrewMember>();
  if (!row) return getCrew(viewer, crewId);
  if (row.role === "host") throw badRequest("The host can't be removed. Call the klique off instead.");
  await CrewMember.deleteOne({ _id: row._id });
  if (row.status === "active") await Crew.updateOne({ _id: crew._id, memberCount: { $gt: 1 } }, { $inc: { memberCount: -1 } });
  void pingCrew(crew._id, { also: [row.userId] });
  notify([row.userId], row.status === "active" ? { title: "You were removed from a klique", body: `The host took you off ${quote(crew.title, 50)}. You can join another one.`, data: offData(crew) } : declined(crew), { category: "crews", ref: `crew:${sid(crew._id)}` });
  return getCrew(viewer, crewId);
}

/** "Not this time": a request that wasn't accepted, kindly, with a way to find another klique. */
const declined = (crew: Pick<ICrew, "title" | "eventId">) => ({
  title: "Your klique request wasn't accepted",
  body: `${quote(crew.title, 50)} couldn't take you this time. There are other kliques to join.`,
  data: offData(crew),
});

/* ------------------------------------------------------------------ */
/* Chat                                                                */
/* ------------------------------------------------------------------ */

/** The people in a klique someone is in (for the "is typing…" line); refuses anyone outside it. */
export async function typingCrew(viewer: IUser, crewId: string): Promise<{ id: Types.ObjectId; members: Types.ObjectId[] }> {
  const { crew } = await assertInCrew(viewer, crewId);
  const rows = await CrewMember.find({ crewId: crew._id, status: "active" }).select("userId").lean<{ userId: Types.ObjectId }[]>();
  return { id: crew._id, members: rows.map((r) => r.userId) };
}

async function assertInCrew(viewer: IUser, crewId: string, opts: { admin?: boolean } = {}) {
  const { crew, event } = await visibleCrew(viewer, crewId);
  // moderators (site admins, the community's owner and admins) may open its chat (reading and deleting, not posting)
  if (opts.admin && (await isKliqueMod(viewer, crew))) return { crew, event };
  const me = await CrewMember.findOne({ crewId: crew._id, userId: viewer._id, status: "active" }).select("_id").lean();
  if (!me) throw forbidden("Only the klique can see its chat.");
  return { crew, event };
}

const snippet = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const PAGE = 50;

/**
 * Crew chat speaks the same message shape as community channels, so the same chat screen shows both: pictures and
 * GIFs, stickers, replies, reactions, @mentions, editing and deleting. `channelId` is the crew's id.
 */
async function toMessages(rows: ICrewMessage[], viewer: IUser, crew: Pick<ICrew, "_id" | "hostId" | "communityId" | "subcommunityId">): Promise<ChannelMessageDTO[]> {
  if (!rows.length) return [];
  const mod = sid(crew.hostId) !== sid(viewer._id) && (await isKliqueMod(viewer, crew));
  const me = sid(viewer._id);
  const parentIds = rows.map((r) => r.replyToId).filter((x): x is Types.ObjectId => !!x);
  const parents = parentIds.length ? await CrewMessage.find({ _id: { $in: parentIds }, crewId: crew._id }).lean<ICrewMessage[]>() : [];
  const [briefs, reactions, mentionMap] = await Promise.all([
    loadBriefs([...rows.map((r) => r.userId), ...parents.map((p) => p.userId)]),
    summarizeReactions("crew", rows.map((r) => r._id), viewer._id),
    mentionBriefs(rows.flatMap((r) => (r.deletedAt ? [] : (r.mentions ?? [])))),
  ]);
  const replyMap = new Map(parents.map((p) => [sid(p._id), toReplyRef({ ...p, images: p.images ?? [] }, (briefs.get(sid(p.userId)) ?? GHOST).displayName)]));
  const isHost = sid(crew.hostId) === me;
  return rows.map((r) => {
    const gone = !!r.deletedAt;
    const mine = sid(r.userId) === me;
    const mentions = gone ? [] : (r.mentions ?? []).flatMap((id) => mentionMap.get(sid(id)) ?? []);
    return {
      id: sid(r._id),
      channelId: sid(crew._id),
      body: gone ? "" : r.body,
      sticker: gone ? null : (r.sticker ?? null),
      stickerUrl: gone ? null : (r.stickerUrl ?? null),
      images: gone ? [] : (r.images ?? []),
      replyTo: gone || !r.replyToId ? null : (replyMap.get(sid(r.replyToId)) ?? null),
      pinned: false,
      canPin: false,
      reactions: gone ? [] : (reactions.get(sid(r._id)) ?? []),
      deleted: gone,
      createdAt: r.createdAt.toISOString(),
      author: briefs.get(sid(r.userId)) ?? GHOST,
      canDelete: !gone && (mine || isHost || mod),
      canEdit: !gone && mine && !r.sticker && !r.stickerUrl && !r.pollId,
      pollId: gone || !r.pollId ? null : sid(r.pollId),
      editedAt: gone || !r.editedAt ? null : r.editedAt.toISOString(),
      mentions,
      mentionsMe: mentions.some((m) => m.id === me),
    };
  });
}

/** Handles in `body` that belong to people in this crew (and that the author can see). */
async function crewMentions(viewer: IUser, crewId: Types.ObjectId, body: string): Promise<Types.ObjectId[]> {
  const handles = extractMentionHandles(body);
  if (!handles.length) return [];
  const [users, hidden] = await Promise.all([User.find({ handle: { $in: handles } }).select("_id").lean<{ _id: Types.ObjectId }[]>(), hiddenUserIds(viewer._id)]);
  const hide = new Set(hidden.map(sid));
  const ids = users.map((u) => u._id).filter((id) => !hide.has(sid(id)) && sid(id) !== sid(viewer._id));
  if (!ids.length) return [];
  const inCrew = await CrewMember.find({ crewId, userId: { $in: ids }, status: "active" }).select("userId").lean<{ userId: Types.ObjectId }[]>();
  return inCrew.map((m) => m.userId);
}

/**
 * A page of the chat, oldest first: the newest page, the page `before` a message (scrolling up), or only the ones
 * `after` a message (polling). Looking at the newest messages marks the chat read.
 */
export async function listCrewMessages(viewer: IUser, crewId: string, q: { before?: string; after?: string } = {}): Promise<{ items: ChannelMessageDTO[]; hasMore: boolean }> {
  const { crew } = await assertInCrew(viewer, crewId, { admin: true });
  const member = !!(await CrewMember.exists({ crewId: crew._id, userId: viewer._id, status: "active" }));
  const filter: Record<string, unknown> = { crewId: crew._id };
  if (q.after) filter._id = { $gt: new Types.ObjectId(q.after) };
  else if (q.before) filter._id = { $lt: new Types.ObjectId(q.before) };
  const rows = await CrewMessage.find(filter).sort({ _id: q.after ? 1 : -1 }).limit(PAGE + 1).lean<ICrewMessage[]>();
  const hasMore = rows.length > PAGE;
  const page = rows.slice(0, PAGE);
  const ordered = q.after ? page : page.reverse();
  if (!q.before && member) {
    // looking at the chat reads it (an empty poll still says you're looking)
    const newest = ordered[ordered.length - 1];
    if (newest) await markCrewRead(viewer._id, crew, newest._id);
    else await CrewRead.updateOne({ userId: viewer._id, crewId: crew._id }, { $set: { readAt: new Date() }, $setOnInsert: { lastReadMessageId: null, expiresAt: crew.expiresAt } }, { upsert: true }).catch(() => {});
  }
  return { items: await toMessages(ordered, viewer, crew), hasMore: q.after ? false : hasMore };
}

/** Mark everything up to the newest message read (the chat is on screen). */
export async function markCrewChatRead(viewer: IUser, crewId: string) {
  const { crew } = await assertInCrew(viewer, crewId);
  const newest = await CrewMessage.findOne({ crewId: crew._id }).sort({ _id: -1 }).select("_id").lean<{ _id: Types.ObjectId }>();
  if (newest) await markCrewRead(viewer._id, crew, newest._id);
  return { read: true };
}

/** People in the crew you can tag, matching what you've typed after "@". */
export async function crewMentionable(viewer: IUser, crewId: string, q?: string): Promise<UserBrief[]> {
  const { crew } = await assertInCrew(viewer, crewId);
  const rows = await CrewMember.find({ crewId: crew._id, status: "active", userId: { $ne: viewer._id } }).select("userId").lean<{ userId: Types.ObjectId }[]>();
  const briefs = await loadBriefs(rows.map((r) => r.userId));
  const needle = (q ?? "").toLowerCase();
  return [...briefs.values()].filter((b) => !needle || b.handle.toLowerCase().includes(needle) || b.displayName.toLowerCase().includes(needle)).slice(0, 8);
}

/** People whose open chat checked in within the last 3 minutes are reading along: no notification for them. */
const READING_MS = 3 * 60_000;

export async function postCrewMessage(viewer: IUser, crewId: string, input: { body: string; sticker?: string; stickerUrl?: string; images?: string[]; poll?: z.infer<typeof pollInput> }, replyToId: string | null = null): Promise<ChannelMessageDTO> {
  const { crew } = await assertInCrew(viewer, crewId);
  // a community's klique: a timeout there holds in its kliques' chats too
  await assertNoCommunityTimeout(viewer._id, crew.communityId);
  const sticker = input.sticker ?? null;
  const stickerUrl = input.stickerUrl && !sticker ? assertStickerUrl(input.stickerUrl) : null;
  const body = await normalizeEmoji(viewer, crew.communityId ?? null, input.body);
  const images = input.images ?? [];
  rateLimit(`crew-msg:${sid(viewer._id)}`, 30, 60_000);
  // a poll rides on its own message (anything else sent with it is dropped)
  const poll = input.poll ? await createPoll(viewer, { scope: "crew", targetId: crew._id }, input.poll) : null;
  const said = poll ? pollPreview(poll.question) : previewOf({ body, sticker, stickerUrl, images });
  const parent = replyToId ? await CrewMessage.findOne({ _id: oid(replyToId, "message"), crewId: crew._id }).select("userId").lean<Pick<ICrewMessage, "_id" | "userId">>() : null;
  if (replyToId && !parent) throw notFound("That message is gone.");
  const mentions = await crewMentions(viewer, crew._id, body);
  const row = (await CrewMessage.create(poll ? { crewId: crew._id, userId: viewer._id, body: "", pollId: poll._id, mentions: [], replyToId: parent?._id ?? null, expiresAt: crew.expiresAt } : { crewId: crew._id, userId: viewer._id, body, sticker, stickerUrl, images, mentions, replyToId: parent?._id ?? null, expiresAt: crew.expiresAt })).toObject() as ICrewMessage;
  noteStickerUse(viewer._id, stickerUrl);
  await markCrewRead(viewer._id, crew, row._id, false);
  void pingCrew(crew._id, { chat: true });

  // tell the rest of the crew, except anyone reading along right now; tags and replies reach you either way
  const [members, reading] = await Promise.all([
    CrewMember.find({ crewId: crew._id, status: "active", userId: { $ne: viewer._id } }).select("userId").lean<{ userId: Types.ObjectId }[]>(),
    CrewRead.find({ crewId: crew._id, readAt: { $gte: new Date(Date.now() - READING_MS) } }).select("userId").lean<{ userId: Types.ObjectId }[]>(),
  ]);
  const busy = new Set(reading.map((r) => sid(r.userId)));
  const away = members.map((m) => m.userId).filter((u) => !busy.has(sid(u)));
  const where = `klique ${quote(crew.title, 40)}`;
  const data = { type: "crew", id: sid(crew._id) };
  const forYou = new Map<string, Types.ObjectId>();
  if (parent && sid(parent.userId) !== sid(viewer._id) && away.some((u) => sid(u) === sid(parent.userId))) forYou.set(sid(parent.userId), parent.userId);
  for (const m of mentions) if (away.some((u) => sid(u) === sid(m))) forYou.set(sid(m), m);
  if (forYou.size) {
    notify([...forYou.values()], { title: `${viewer.displayName} ${parent && forYou.has(sid(parent.userId)) ? "replied to you" : "tagged you"}`, body: `${snippet(said, 100)} · ${where}`, data }, { actorId: viewer._id, category: "mentions", groupKey: `crew-reply:${sid(crew._id)}`, many: (n) => `${n} replies and tags for you in your ${where}`, ref: `crew:${sid(crew._id)}`, pushOnce: true });
  }
  const rest = away.filter((u) => !forYou.has(sid(u)));
  if (rest.length) {
    notify(rest, { title: `${viewer.displayName} in your ${where}`, body: snippet(said, 140), data }, { actorId: viewer._id, category: "crews", groupKey: `crew-chat:${sid(crew._id)}`, many: (n) => `${n} new messages in your ${where}`, ref: `crew:${sid(crew._id)}`, pushOnce: true });
  }
  return (await toMessages([row], viewer, crew))[0];
}

async function loadCrewMessage(crewId: Types.ObjectId, messageId: string): Promise<ICrewMessage> {
  const msg = await CrewMessage.findOne({ _id: oid(messageId, "message"), crewId }).lean<ICrewMessage>();
  if (!msg || msg.deletedAt) throw notFound("That message is gone.");
  return msg;
}

/** Change the text of your own message. */
export async function editCrewMessage(viewer: IUser, crewId: string, messageId: string, body: string): Promise<ChannelMessageDTO> {
  const { crew } = await assertInCrew(viewer, crewId);
  rateLimit(`crew-edit:${sid(viewer._id)}`, 30, 60_000);
  const msg = await loadCrewMessage(crew._id, messageId);
  if (sid(msg.userId) !== sid(viewer._id)) throw forbidden("You can only edit your own messages.");
  if (msg.sticker || msg.stickerUrl) throw forbidden("Stickers can't be edited. Delete it and send another.");
  if (msg.pollId) throw forbidden("Polls can't be edited. Delete it and start another.");
  const next = (await normalizeEmoji(viewer, crew.communityId ?? null, body)).trim();
  const mentions = await crewMentions(viewer, crew._id, next);
  const editedAt = next === msg.body ? (msg.editedAt ?? null) : new Date();
  await CrewMessage.updateOne({ _id: msg._id }, { $set: { body: next, mentions, editedAt } });
  void pingCrew(crew._id, { chat: true });
  return (await toMessages([{ ...msg, body: next, mentions, editedAt }], viewer, crew))[0];
}

/** Delete your own message; the host can remove anyone's. Its pictures go with it. */
export async function deleteCrewMessage(viewer: IUser, crewId: string, messageId: string) {
  const { crew } = await assertInCrew(viewer, crewId, { admin: true });
  const msg = await loadCrewMessage(crew._id, messageId);
  const asMod = sid(msg.userId) !== sid(viewer._id) && sid(crew.hostId) !== sid(viewer._id) && (await isKliqueMod(viewer, crew));
  if (sid(msg.userId) !== sid(viewer._id) && sid(crew.hostId) !== sid(viewer._id) && !asMod) throw forbidden("Only the host can remove other people's messages.");
  if (asMod) await logModDelete(viewer, { communityId: crew.communityId, authorId: msg.userId }, "kliqueMessage", msg._id, `Message in klique "${crew.title.slice(0, 60)}": ${msg.body.slice(0, 80)}`, `/kliques/${sid(crew._id)}`);
  await CrewMessage.updateOne({ _id: msg._id }, { $set: { body: "", sticker: null, stickerUrl: null, images: [], mentions: [], deletedAt: new Date() } });
  await deletePoll(msg.pollId);
  await purgeReactions("crew", [msg._id]);
  deleteUploads(msg.images ?? []);
  void pingCrew(crew._id, { chat: true });
  return { deleted: true };
}

export async function reactToCrewMessage(viewer: IUser, crewId: string, messageId: string, kind: ReactionKind): Promise<ReactionDTO[]> {
  const { crew } = await assertInCrew(viewer, crewId);
  rateLimit(`react:${sid(viewer._id)}`, 60, 30_000);
  const msg = await loadCrewMessage(crew._id, messageId);
  const out = await toggleReaction("crew", msg._id, viewer._id, kind);
  // a good reaction earns the author points (once per person per message)
  if (GOOD_REACTIONS.has(kind) && out.some((r) => r.mine && r.kind === kind)) awardPointsLater(msg.userId, "reaction", `crew:${sid(msg._id)}:${sid(viewer._id)}`, viewer._id);
  void pingCrew(crew._id, { chat: true });
  return out;
}

export async function crewReactions(viewer: IUser, crewId: string, ids: string[]): Promise<Record<string, ReactionDTO[]>> {
  const { crew } = await assertInCrew(viewer, crewId, { admin: true });
  const valid = await CrewMessage.find({ _id: { $in: ids }, crewId: crew._id }).select("_id").lean<{ _id: Types.ObjectId }[]>();
  const map = await summarizeReactions("crew", valid.map((v) => v._id), viewer._id);
  return Object.fromEntries(valid.map((v) => [sid(v._id), map.get(sid(v._id)) ?? []]));
}

/* ------------------------------------------------------------------ */
/* Housekeeping (called from events, spaces, accounts, reminders)      */
/* ------------------------------------------------------------------ */

/** Delete crews (and their members and chat) matching a filter, e.g. { eventId } or { communityId }. */
export async function purgeCrews(where: Record<string, unknown>) {
  const rows = await Crew.find(where).select("_id coverImage").lean<Pick<ICrew, "_id" | "coverImage">[]>();
  const ids = rows.map((r) => r._id);
  if (!ids.length) return;
  // cover pictures go with them (an event's own picture, copied onto old crews, is still the event's)
  const eventCovers = new Set(await Event.find({ coverImage: { $in: rows.map((r) => r.coverImage).filter(Boolean) } }).distinct("coverImage"));
  deleteUploads(rows.map((r) => r.coverImage).filter((c): c is string => !!c && !eventCovers.has(c)));
  await Promise.all([Crew.deleteMany({ _id: { $in: ids } }), CrewMember.deleteMany({ crewId: { $in: ids } }), purgeCrewChat({ crewId: { $in: ids } }), CrewRead.deleteMany({ crewId: { $in: ids } })]);
}

/** A community klique moved: it now disappears a day after its new time. */
async function syncKliqueExpiry(crewId: Types.ObjectId, expiresAt: Date) {
  await Promise.all([
    CrewMember.updateMany({ crewId }, { $set: { expiresAt } }),
    CrewMessage.updateMany({ crewId }, { $set: { expiresAt } }),
    CrewRead.updateMany({ crewId }, { $set: { expiresAt } }),
  ]);
}

/** An event's times changed: its kliques now disappear a day after the new end. */
export async function syncCrewExpiry(event: Pick<IEvent, "_id" | "startsAt" | "endsAt">) {
  const ids = await Crew.find({ eventId: event._id }).distinct("_id");
  if (!ids.length) return;
  const expiresAt = crewExpiry(event);
  await Promise.all([
    Crew.updateMany({ _id: { $in: ids } }, { $set: { expiresAt } }),
    CrewMember.updateMany({ crewId: { $in: ids } }, { $set: { expiresAt } }),
    CrewMessage.updateMany({ crewId: { $in: ids } }, { $set: { expiresAt } }),
    CrewRead.updateMany({ crewId: { $in: ids } }, { $set: { expiresAt } }),
  ]);
}

/**
 * Someone left (or was removed from) a community or one of its groups: they can't be in its crews any more.
 * Leaving a community covers its groups' crews too. Crews they host are called off (everyone in them is told);
 * in the rest they leave, and requests they sent are dropped. Returns how many crews they were taken out of.
 */
export async function leaveSpaceCrews(userId: Types.ObjectId, communityId: Types.ObjectId, subcommunityId: Types.ObjectId | null): Promise<number> {
  const where = subcommunityId ? { subcommunityId } : { communityId };
  const crews = await Crew.find(where).select("_id hostId title area eventId coverImage").lean<Pick<ICrew, "_id" | "hostId" | "title" | "area" | "eventId" | "coverImage">[]>();
  if (!crews.length) return 0;
  const rows = await CrewMember.find({ userId, crewId: { $in: crews.map((c) => c._id) } }).lean<ICrewMember[]>();
  for (const r of rows) {
    const crew = crews.find((c) => sid(c._id) === sid(r.crewId))!;
    if (r.role === "host") {
      const others = await CrewMember.find({ crewId: crew._id, userId: { $ne: userId } }).select("userId").lean<{ userId: Types.ObjectId }[]>();
      await pingCrew(crew._id);
      await purgeCrews({ _id: crew._id });
      notify(others.map((m) => m.userId), { title: "Klique called off", body: `The host left, so ${quote(crew.title, 50)} is off. You can join or start another one.`, data: offData(crew) }, { category: "crews", ref: `crew:${sid(crew._id)}` });
    } else {
      await CrewMember.deleteOne({ _id: r._id });
      if (r.status === "active") await Crew.updateOne({ _id: crew._id, memberCount: { $gt: 1 } }, { $inc: { memberCount: -1 } });
      void pingCrew(crew._id, { also: [userId] });
    }
  }
  return rows.length;
}

/** Someone deleted their account: their kliques are called off, and they leave the others. */
export async function removeUserFromCrews(userId: Types.ObjectId) {
  await purgeCrews({ hostId: userId });
  const rows = await CrewMember.find({ userId }).lean<ICrewMember[]>();
  for (const r of rows) {
    await CrewMember.deleteOne({ _id: r._id });
    if (r.status === "active") await Crew.updateOne({ _id: r.crewId, memberCount: { $gt: 1 } }, { $inc: { memberCount: -1 } });
  }
  await purgeCrewChat({ userId });
  await CrewRead.deleteMany({ userId });
}

/** "Crew meets soon" to everyone in a crew, about an hour before its meetup. Each crew once. */
export async function runCrewReminders(now = new Date()): Promise<number> {
  const due = await Crew.find({ reminderSentAt: null, meetupAt: { $gt: now, $lte: new Date(+now + 75 * 60_000) } }).limit(200).lean<ICrew[]>();
  let notified = 0;
  for (const c of due) {
    const claimed = await Crew.updateOne({ _id: c._id, reminderSentAt: null }, { $set: { reminderSentAt: now } });
    if (!claimed.modifiedCount) continue;
    const members = await CrewMember.find({ crewId: c._id, status: "active" }).select("userId").lean<{ userId: Types.ObjectId }[]>();
    await notifyNow(members.map((m) => m.userId), { title: `${quote(c.title, 50)} meets soon`, body: `${c.meetupPoint} · ${at(c.meetupAt)}`, data: { type: "crew", id: sid(c._id) } }, { category: "crews", ref: `crew:${sid(c._id)}` });
    notified += members.length;
  }
  return notified;
}

