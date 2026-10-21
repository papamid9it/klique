import "server-only";
import { Types } from "mongoose";
import type { z } from "zod";
import type { CrewCardDTO, CrewDTO, CrewMessageDTO, CrewStanding, EventCrewsDTO, MyCrewDTO } from "@/lib/types";
import { badRequest, conflict, forbidden, notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import { Crew, CrewMember, CrewMessage, type ICrew, type ICrewMember, type ICrewMessage } from "../models/Crew";
import { Community, type ICommunity } from "../models/Community";
import { Event, type IEvent } from "../models/Event";
import { Membership } from "../models/Membership";
import { Subcommunity, type ISubcommunity } from "../models/Subcommunity";
import type { IUser } from "../models/User";
import { canViewEvent } from "../policies/access";
import { isSiteAdmin } from "../policies/hosting";
import { GHOST, loadBriefs } from "../serializers";
import type { crewCreateSchema, crewUpdateSchema } from "../validators/schemas";
import { assertVerified } from "./account.service";
import { hiddenUserIds } from "./blocks";
import { sid } from "./helpers";
import { notify, notifyNow } from "./push.service";
import { publish, rtChannel } from "./realtime";

/**
 * Crews: people going to the same event together. The rules, all checked here:
 *  - you can see an event's crews exactly when you can see the event
 *  - to start or join one you must be a member of the event's community (or of its group, for a group's event);
 *    events outside any community are open to anyone signed in
 *  - one crew per account per event: you can start one, or be in one, or have asked to join one, never two
 *  - a crew is 2–100 people, host included; "Ask to join" (host approves) or "Open"
 *  - joining closes when the event starts; the exact meetup point is shown to members only
 *  - everything (crew, members, chat) deletes itself a day after the event ends (TTL on `expiresAt`)
 */

/** an event with no end time counts as 3 hours long */
const FALLBACK_DURATION_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** how early before the event a crew may meet up */
const MAX_LEAD_MS = 2 * DAY_MS;
const FACES = 5;

const eventEnd = (e: Pick<IEvent, "startsAt" | "endsAt">) => e.endsAt ?? new Date(+e.startsAt + FALLBACK_DURATION_MS);
/** a day after the event ends */
export const crewExpiry = (e: Pick<IEvent, "startsAt" | "endsAt">) => new Date(+eventEnd(e) + DAY_MS);

/** "Sat 18 Oct, 4:00 PM" in Lagos time (kept here so this file doesn't depend on events.service) */
const at = (d: Date) => d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Lagos" });

const oid = (id: string, what = "crew") => {
  if (!Types.ObjectId.isValid(id)) throw notFound(`We couldn't find that ${what}.`);
  return new Types.ObjectId(id);
};

/** The event, if this viewer may see it (hidden looks exactly like missing). */
async function visibleEvent(viewer: IUser | null, eventId: Types.ObjectId | string): Promise<IEvent> {
  const event = await Event.findById(eventId).lean<IEvent>();
  if (!event || !(await canViewEvent(event, viewer))) throw notFound("We couldn't find that event.");
  return event;
}

/** The crew and its event, if this viewer may see them. */
async function visibleCrew(viewer: IUser | null, crewId: string): Promise<{ crew: ICrew; event: IEvent }> {
  const crew = await Crew.findById(oid(crewId)).lean<ICrew>();
  if (!crew) throw notFound("This crew is gone. Crews close a day after their event.");
  const event = await visibleEvent(viewer, crew.eventId).catch(() => {
    throw notFound("This crew is gone. Crews close a day after their event.");
  });
  return { crew, event };
}

function validateMeetup(meetupAt: Date, event: IEvent) {
  const now = Date.now();
  if (+meetupAt < now - 5 * 60_000) throw badRequest("Pick a meetup time that hasn't passed.");
  if (+meetupAt > +eventEnd(event)) throw badRequest("Meet up before the event ends.");
  if (+meetupAt < +event.startsAt - MAX_LEAD_MS) throw badRequest("Meet up at most 2 days before the event.");
}

function assertEventOpen(event: IEvent) {
  if (event.cancelled) throw badRequest("This event was cancelled.");
  if (event.online) throw badRequest("Crews are for meeting up at in-person events.");
  if (+event.startsAt <= Date.now()) throw badRequest("This event has started, so crews are closed.");
}

/**
 * Starting or joining a crew is for the event's own people: members of its community, or of its group when
 * the event belongs to a group. Returns why not, in words, or null when they may.
 */
async function spaceBlock(viewer: IUser, event: Pick<IEvent, "communityId" | "subcommunityId">): Promise<string | null> {
  if (!event.communityId) return null;
  const m = await Membership.exists({ userId: viewer._id, communityId: event.communityId, subcommunityId: event.subcommunityId ?? null, status: "active" });
  if (m) return null;
  if (event.subcommunityId) {
    const g = await Subcommunity.findById(event.subcommunityId).select("name").lean<Pick<ISubcommunity, "name">>();
    return `Only members of ${g?.name ?? "this group"} can join its crews.`;
  }
  const c = await Community.findById(event.communityId).select("name").lean<Pick<ICommunity, "name">>();
  return `Join ${c?.name ?? "the community"} to start or join a crew.`;
}

/** Tell everyone in a crew (and anyone in `also`) that it changed, so their open pages refresh by themselves. */
async function pingCrew(crewId: Types.ObjectId, opts: { chat?: boolean; also?: Types.ObjectId[] } = {}) {
  const rows = await CrewMember.find({ crewId }).select("userId").lean<{ userId: Types.ObjectId }[]>();
  const ids = [...new Set([...rows.map((r) => sid(r.userId)), ...(opts.also ?? []).map(sid)])];
  publish(ids.map((id) => rtChannel.user(id)), { type: "crew", crewId: sid(crewId), chat: !!opts.chat });
}

const isDup = (e: unknown) => (e as { code?: number })?.code === 11000;

/* ------------------------------------------------------------------ */
/* Cards & detail                                                      */
/* ------------------------------------------------------------------ */

async function toCards(crews: ICrew[], event: IEvent, viewer: IUser | null): Promise<CrewCardDTO[]> {
  if (!crews.length) return [];
  const ids = crews.map((c) => c._id);
  const [members, mine] = await Promise.all([
    CrewMember.find({ crewId: { $in: ids }, status: "active" }).sort({ role: 1, createdAt: 1 }).select("crewId userId role").lean<Pick<ICrewMember, "crewId" | "userId" | "role">[]>(),
    viewer ? CrewMember.findOne({ eventId: event._id, userId: viewer._id }).lean<ICrewMember>() : null,
  ]);
  const byCrew = new Map<string, Types.ObjectId[]>();
  for (const m of members) {
    const list = byCrew.get(sid(m.crewId)) ?? [];
    // host first ("host" sorts before "member")
    if (list.length < FACES) list.push(m.userId);
    byCrew.set(sid(m.crewId), list);
  }
  const [briefs, space] = await Promise.all([loadBriefs([...crews.map((c) => c.hostId), ...members.map((m) => m.userId)]), spaceOf(event)]);
  const closed = +event.startsAt <= Date.now() || event.cancelled;
  return crews.map((c) => ({
    id: sid(c._id),
    eventId: sid(c.eventId),
    area: c.area,
    note: c.note,
    meetupAt: c.meetupAt.toISOString(),
    joinMode: c.joinMode,
    maxMembers: c.maxMembers,
    memberCount: c.memberCount,
    host: briefs.get(sid(c.hostId)) ?? GHOST,
    faces: (byCrew.get(sid(c._id)) ?? []).map((u) => briefs.get(sid(u)) ?? GHOST),
    isFull: c.memberCount >= c.maxMembers,
    closed,
    space,
    viewer: { standing: mine && sid(mine.crewId) === sid(c._id) ? standingOf(mine) : null },
  }));
}

/** Where an event's crews are shown: its community (and group), by slug. */
async function spaceOf(event: Pick<IEvent, "communityId" | "subcommunityId">): Promise<CrewCardDTO["space"]> {
  if (!event.communityId) return null;
  const [c, s] = await Promise.all([
    Community.findById(event.communityId).select("slug").lean<Pick<ICommunity, "slug">>(),
    event.subcommunityId ? Subcommunity.findById(event.subcommunityId).select("slug").lean<Pick<ISubcommunity, "slug">>() : null,
  ]);
  return c ? { slug: c.slug, sub: s?.slug ?? null } : null;
}

const standingOf = (m: Pick<ICrewMember, "role" | "status">): CrewStanding => (m.status === "pending" ? "pending" : m.role === "host" ? "host" : "member");

/** An event's crews, yours first, then the fullest-looking ones (busy crews feel safer to join). */
export async function listEventCrews(viewer: IUser | null, eventId: string): Promise<EventCrewsDTO> {
  const event = await visibleEvent(viewer, oid(eventId, "event"));
  const hidden = await hiddenUserIds(viewer?._id ?? null);
  const crews = await Crew.find({ eventId: event._id, hostId: { $nin: hidden } }).sort({ memberCount: -1, createdAt: 1 }).limit(200).lean<ICrew[]>();
  const cards = await toCards(crews, event, viewer);
  const mineCard = cards.find((c) => c.viewer.standing);
  const mineRow = viewer && !mineCard ? await CrewMember.findOne({ eventId: event._id, userId: viewer._id }).select("crewId").lean<{ crewId: Types.ObjectId }>() : null;

  let reason: string | null = null;
  if (!viewer) reason = "Sign in to start a crew.";
  else if (!viewer.emailVerifiedAt) reason = "Verify your email to start a crew.";
  else if (event.cancelled) reason = "This event was cancelled.";
  else if (event.online) reason = "Crews are for in-person events.";
  else if (+event.startsAt <= Date.now()) reason = "This event has started.";
  else if (mineCard || mineRow) reason = "You're already in a crew for this event. Leave it to start your own.";
  else reason = await spaceBlock(viewer, event);
  // could they join someone else's crew (the list shows "View" instead of "Join" when not)
  const canJoin = !!viewer && !!viewer.emailVerifiedAt && !event.cancelled && !event.online && +event.startsAt > Date.now() && (await spaceBlock(viewer, event)) === null;

  return {
    crews: mineCard ? [mineCard, ...cards.filter((c) => c !== mineCard)] : cards,
    mine: mineCard?.id ?? (mineRow ? sid(mineRow.crewId) : null),
    canStart: reason === null,
    startBlockedReason: reason,
    canJoin,
  };
}

export async function getCrew(viewer: IUser | null, crewId: string): Promise<CrewDTO> {
  const { crew, event } = await visibleCrew(viewer, crewId);
  const [card] = await toCards([crew], event, viewer);
  const me = viewer ? await CrewMember.findOne({ crewId: crew._id, userId: viewer._id }).lean<ICrewMember>() : null;
  const standing = me ? standingOf(me) : null;
  const isHost = standing === "host";
  const inCrew = standing === "host" || standing === "member";

  const [members, pending] = await Promise.all([
    CrewMember.find({ crewId: crew._id, status: "active" }).sort({ role: 1, createdAt: 1 }).lean<ICrewMember[]>(),
    isHost ? CrewMember.find({ crewId: crew._id, status: "pending" }).sort({ createdAt: 1 }).lean<ICrewMember[]>() : Promise.resolve<ICrewMember[]>([]),
  ]);
  const briefs = await loadBriefs([...members, ...pending].map((m) => m.userId));

  // can this viewer join (or ask)?
  let joinBlockedReason: string | null = null;
  if (!viewer) joinBlockedReason = "Sign in to join.";
  else if (standing) joinBlockedReason = null;
  else if (!viewer.emailVerifiedAt) joinBlockedReason = "Verify your email to join a crew.";
  else if (card.closed) joinBlockedReason = "The event has started, so this crew is closed.";
  else if (card.isFull) joinBlockedReason = "This crew is full.";
  else if (await CrewMember.exists({ eventId: event._id, userId: viewer._id })) joinBlockedReason = "You're already in another crew for this event.";
  else joinBlockedReason = await spaceBlock(viewer, event);

  return {
    ...card,
    meetupPoint: inCrew ? crew.meetupPoint : null,
    event: { id: sid(event._id), title: event.title, startsAt: event.startsAt.toISOString(), endsAt: event.endsAt ? event.endsAt.toISOString() : null, venue: event.venue, online: !!event.online, coverImage: event.coverImage, city: event.city, country: event.country ?? "NG" },
    members: members.map((m) => briefs.get(sid(m.userId)) ?? GHOST),
    requests: pending.map((m) => ({ user: briefs.get(sid(m.userId)) ?? GHOST, message: m.message, createdAt: m.createdAt.toISOString() })),
    expiresAt: crew.expiresAt.toISOString(),
    viewer: {
      standing,
      canEdit: isHost || (!!viewer && isSiteAdmin(viewer)),
      canChat: inCrew,
      canJoin: !standing && joinBlockedReason === null,
      joinBlockedReason: standing ? null : joinBlockedReason,
    },
  };
}

/**
 * The crews you're in (or asked to join) for events in this community and its groups, soonest first,
 * for the "Your crews" list on the community's left. Only crews whose event you can still see.
 */
export async function myCommunityCrews(viewer: IUser, slug: string): Promise<MyCrewDTO[]> {
  const community = await Community.findOne({ slug: slug.toLowerCase() }).select("_id").lean<Pick<ICommunity, "_id">>();
  if (!community) throw notFound("We couldn't find that community.");
  const rows = await CrewMember.find({ userId: viewer._id }).select("crewId role status").lean<Pick<ICrewMember, "crewId" | "role" | "status">[]>();
  if (!rows.length) return [];
  const crews = await Crew.find({ _id: { $in: rows.map((r) => r.crewId) }, communityId: community._id }).sort({ meetupAt: 1 }).lean<ICrew[]>();
  if (!crews.length) return [];
  const [events, subs] = await Promise.all([
    Event.find({ _id: { $in: crews.map((c) => c.eventId) } }).lean<IEvent[]>(),
    Subcommunity.find({ _id: { $in: crews.map((c) => c.subcommunityId).filter(Boolean) } }).select("slug").lean<Pick<ISubcommunity, "_id" | "slug">[]>(),
  ]);
  const eventById = new Map(events.map((e) => [sid(e._id), e]));
  const subById = new Map(subs.map((s) => [sid(s._id), s.slug]));
  const out: MyCrewDTO[] = [];
  for (const c of crews) {
    const e = eventById.get(sid(c.eventId));
    if (!e || !(await canViewEvent(e, viewer))) continue;
    const r = rows.find((x) => sid(x.crewId) === sid(c._id))!;
    out.push({ id: sid(c._id), area: c.area, eventId: sid(e._id), eventTitle: e.title, meetupAt: c.meetupAt.toISOString(), memberCount: c.memberCount, standing: standingOf(r)!, sub: c.subcommunityId ? (subById.get(sid(c.subcommunityId)) ?? null) : null });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Start, edit, delete                                                 */
/* ------------------------------------------------------------------ */

export async function createCrew(viewer: IUser, eventId: string, input: z.infer<typeof crewCreateSchema>): Promise<CrewDTO> {
  assertVerified(viewer);
  const event = await visibleEvent(viewer, oid(eventId, "event"));
  assertEventOpen(event);
  const blocked = await spaceBlock(viewer, event);
  if (blocked) throw forbidden(blocked);
  validateMeetup(input.meetupAt, event);
  rateLimit(`crew-create:${sid(viewer._id)}`, 10, DAY_MS);

  if (await CrewMember.exists({ eventId: event._id, userId: viewer._id })) throw conflict("You're already in a crew for this event. Leave it to start your own.");

  const expiresAt = crewExpiry(event);
  let crew: ICrew;
  try {
    crew = (
      await Crew.create({
        eventId: event._id,
        hostId: viewer._id,
        area: input.area,
        meetupPoint: input.meetupPoint,
        meetupAt: input.meetupAt,
        note: input.note,
        joinMode: input.joinMode,
        maxMembers: input.maxMembers,
        memberCount: 1,
        communityId: event.communityId ?? null,
        subcommunityId: event.subcommunityId ?? null,
        expiresAt,
      })
    ).toObject();
  } catch (e) {
    if (isDup(e)) throw conflict("You've already started a crew for this event.");
    throw e;
  }
  try {
    await CrewMember.create({ crewId: crew._id, eventId: event._id, userId: viewer._id, role: "host", status: "active", expiresAt });
  } catch (e) {
    await Crew.deleteOne({ _id: crew._id }); // lost a race with joining another crew
    if (isDup(e)) throw conflict("You're already in a crew for this event. Leave it to start your own.");
    throw e;
  }
  return getCrew(viewer, sid(crew._id));
}

async function hostCrew(viewer: IUser, crewId: string) {
  const { crew, event } = await visibleCrew(viewer, crewId);
  if (sid(crew.hostId) !== sid(viewer._id) && !isSiteAdmin(viewer)) throw forbidden("Only the crew's host can do that.");
  return { crew, event };
}

export async function updateCrew(viewer: IUser, crewId: string, patch: z.infer<typeof crewUpdateSchema>): Promise<CrewDTO> {
  const { crew, event } = await hostCrew(viewer, crewId);
  if (patch.meetupAt) validateMeetup(patch.meetupAt, event);
  if (patch.maxMembers !== undefined && patch.maxMembers < crew.memberCount) throw badRequest(`${crew.memberCount} people are already in. Remove some first, or keep the limit at ${crew.memberCount} or more.`);
  await Crew.updateOne({ _id: crew._id }, { $set: patch });
  void pingCrew(crew._id);

  // a new place or time is worth a ping to everyone in
  const moved = (patch.meetupPoint && patch.meetupPoint !== crew.meetupPoint) || (patch.meetupAt && +patch.meetupAt !== +crew.meetupAt);
  if (moved) {
    const members = await CrewMember.find({ crewId: crew._id, status: "active", userId: { $ne: viewer._id } }).select("userId").lean<{ userId: Types.ObjectId }[]>();
    const point = patch.meetupPoint ?? crew.meetupPoint;
    const time = patch.meetupAt ?? crew.meetupAt;
    notify(members.map((m) => m.userId), { title: `Crew update · ${event.title}`, body: `Now meeting at ${point}, ${at(time)}.`, data: { type: "crew", id: sid(crew._id) } }, { category: "crews", ref: `crew:${sid(crew._id)}` });
    if (patch.meetupAt) await Crew.updateOne({ _id: crew._id }, { $set: { reminderSentAt: null } });
  }
  return getCrew(viewer, crewId);
}

export async function deleteCrew(viewer: IUser, crewId: string) {
  const { crew, event } = await hostCrew(viewer, crewId);
  const members = await CrewMember.find({ crewId: crew._id, userId: { $ne: viewer._id } }).select("userId").lean<{ userId: Types.ObjectId }[]>();
  await pingCrew(crew._id);
  await purgeCrews({ _id: crew._id });
  notify(members.map((m) => m.userId), { title: "Crew called off", body: `The crew from ${crew.area} to ${event.title} was called off. You can join or start another one.`, data: { type: "event", id: sid(event._id) } }, { category: "crews", ref: `crew:${sid(crew._id)}` });
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
  assertEventOpen(event);
  const blocked = await spaceBlock(viewer, event);
  if (blocked) throw forbidden(blocked);
  if (crew.memberCount >= crew.maxMembers) throw conflict("This crew is full.");
  rateLimit(`crew-join:${sid(viewer._id)}`, 30, 60 * 60_000);

  const status = crew.joinMode === "open" ? "active" : "pending";
  let row: ICrewMember;
  try {
    row = (await CrewMember.create({ crewId: crew._id, eventId: event._id, userId: viewer._id, role: "member", status, message, expiresAt: crew.expiresAt })).toObject();
  } catch (e) {
    if (isDup(e)) throw conflict("You're already in a crew for this event. Leave it first to join this one.");
    throw e;
  }

  if (status === "active") {
    if (!(await takeSpot(crew._id))) {
      await CrewMember.deleteOne({ _id: row._id });
      throw conflict("This crew just filled up.");
    }
    void pingCrew(crew._id);
    notify([crew.hostId], { title: `${viewer.displayName} joined your crew`, body: `Going to ${event.title} from ${crew.area}.`, data: { type: "crew", id: sid(crew._id) } }, { category: "crews", groupKey: `crew-join:${sid(crew._id)}`, many: (n) => `${n} people joined your crew from ${crew.area}`, ref: `crew:${sid(crew._id)}` });
  } else {
    void pingCrew(crew._id);
    notify([crew.hostId], { title: `${viewer.displayName} wants to join your crew`, body: message ? `"${message}"` : `For ${event.title}. Tap to accept or decline.`, data: { type: "crew", id: sid(crew._id) } }, { category: "crews", groupKey: `crew-req:${sid(crew._id)}`, many: (n) => `${n} people want to join your crew from ${crew.area}`, ref: `crew:${sid(crew._id)}` });
  }
  return getCrew(viewer, crewId);
}

/** Leave a crew, or take back a request. The host can't leave: they call the crew off instead. */
export async function leaveCrew(viewer: IUser, crewId: string): Promise<CrewDTO> {
  const { crew } = await visibleCrew(viewer, crewId);
  const me = await CrewMember.findOne({ crewId: crew._id, userId: viewer._id }).lean<ICrewMember>();
  if (!me) return getCrew(viewer, crewId);
  if (me.role === "host") throw badRequest("You're the host. Call the crew off instead, or hand it over by asking someone else to start one.");
  await CrewMember.deleteOne({ _id: me._id });
  if (me.status === "active") await Crew.updateOne({ _id: crew._id, memberCount: { $gt: 1 } }, { $inc: { memberCount: -1 } });
  void pingCrew(crew._id);
  return getCrew(viewer, crewId);
}

export async function decideRequest(viewer: IUser, crewId: string, userId: string, accept: boolean): Promise<CrewDTO> {
  const { crew, event } = await hostCrew(viewer, crewId);
  const row = await CrewMember.findOne({ crewId: crew._id, userId: oid(userId, "person"), status: "pending" }).lean<ICrewMember>();
  if (!row) throw notFound("That request is gone.");
  if (!accept) {
    await CrewMember.deleteOne({ _id: row._id });
    void pingCrew(crew._id, { also: [row.userId] });
    return getCrew(viewer, crewId);
  }
  if (+event.startsAt <= Date.now()) throw badRequest("The event has started, so the crew is closed.");
  if (!(await takeSpot(crew._id))) throw conflict("Your crew is full. Raise the limit or remove someone first.");
  await CrewMember.updateOne({ _id: row._id }, { $set: { status: "active" } });
  void pingCrew(crew._id);
  notify([row.userId], { title: "You're in the crew", body: `${event.title} · meeting ${at(crew.meetupAt)}. Tap for the meetup point.`, data: { type: "crew", id: sid(crew._id) } }, { category: "crews", ref: `crew:${sid(crew._id)}` });
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
    return getCrew(viewer, crewId);
  }
  if (+event.startsAt <= Date.now()) throw badRequest("The event has started, so the crew is closed.");
  const room = Math.max(0, crew.maxMembers - crew.memberCount);
  if (!room) throw conflict("Your crew is full. Raise the limit or remove someone first.");
  const take = pending.slice(0, room);
  // claim the spots first, so two clicks can't overfill the crew
  const claimed = await Crew.updateOne({ _id: crew._id, memberCount: crew.memberCount }, { $inc: { memberCount: take.length } });
  if (!claimed.modifiedCount) throw conflict("The crew just changed. Try again.");
  await CrewMember.updateMany({ _id: { $in: take.map((p) => p._id) } }, { $set: { status: "active" } });
  void pingCrew(crew._id);
  notify(take.map((p) => p.userId), { title: "You're in the crew", body: `${event.title} · meeting ${at(crew.meetupAt)}. Tap for the meetup point.`, data: { type: "crew", id: sid(crew._id) } }, { category: "crews", ref: `crew:${sid(crew._id)}` });
  return getCrew(viewer, crewId);
}

export async function removeMember(viewer: IUser, crewId: string, userId: string): Promise<CrewDTO> {
  const { crew } = await hostCrew(viewer, crewId);
  const row = await CrewMember.findOne({ crewId: crew._id, userId: oid(userId, "person") }).lean<ICrewMember>();
  if (!row) return getCrew(viewer, crewId);
  if (row.role === "host") throw badRequest("The host can't be removed. Call the crew off instead.");
  await CrewMember.deleteOne({ _id: row._id });
  if (row.status === "active") await Crew.updateOne({ _id: crew._id, memberCount: { $gt: 1 } }, { $inc: { memberCount: -1 } });
  void pingCrew(crew._id, { also: [row.userId] });
  return getCrew(viewer, crewId);
}

/* ------------------------------------------------------------------ */
/* Chat                                                                */
/* ------------------------------------------------------------------ */

async function assertInCrew(viewer: IUser, crewId: string) {
  const { crew, event } = await visibleCrew(viewer, crewId);
  const me = await CrewMember.findOne({ crewId: crew._id, userId: viewer._id, status: "active" }).select("_id").lean();
  if (!me) throw forbidden("Only the crew can see its chat.");
  return { crew, event };
}

async function toMessages(rows: ICrewMessage[], viewer: IUser): Promise<CrewMessageDTO[]> {
  const briefs = await loadBriefs(rows.map((r) => r.userId));
  return rows.map((r) => ({ id: sid(r._id), body: r.body, createdAt: r.createdAt.toISOString(), author: briefs.get(sid(r.userId)) ?? GHOST, mine: sid(r.userId) === sid(viewer._id) }));
}

/** The latest 100 messages, oldest first; with `after`, only newer ones (for polling). */
export async function listCrewMessages(viewer: IUser, crewId: string, after?: string): Promise<CrewMessageDTO[]> {
  const { crew } = await assertInCrew(viewer, crewId);
  const rows = await CrewMessage.find({ crewId: crew._id, ...(after ? { _id: { $gt: new Types.ObjectId(after) } } : {}) })
    .sort({ _id: -1 })
    .limit(100)
    .lean<ICrewMessage[]>();
  return toMessages(rows.reverse(), viewer);
}

export async function postCrewMessage(viewer: IUser, crewId: string, body: string): Promise<CrewMessageDTO> {
  const { crew } = await assertInCrew(viewer, crewId);
  rateLimit(`crew-msg:${sid(viewer._id)}`, 30, 60_000);
  const row = (await CrewMessage.create({ crewId: crew._id, userId: viewer._id, body, expiresAt: crew.expiresAt })).toObject();
  void pingCrew(crew._id, { chat: true });
  return (await toMessages([row], viewer))[0];
}

/* ------------------------------------------------------------------ */
/* Housekeeping (called from events, spaces, accounts, reminders)      */
/* ------------------------------------------------------------------ */

/** Delete crews (and their members and chat) matching a filter, e.g. { eventId } or { communityId }. */
export async function purgeCrews(where: Record<string, unknown>) {
  const ids = await Crew.find(where).distinct("_id");
  if (!ids.length) return;
  await Promise.all([Crew.deleteMany({ _id: { $in: ids } }), CrewMember.deleteMany({ crewId: { $in: ids } }), CrewMessage.deleteMany({ crewId: { $in: ids } })]);
}

/** An event's times changed: its crews now disappear a day after the new end. */
export async function syncCrewExpiry(event: Pick<IEvent, "_id" | "startsAt" | "endsAt">) {
  const ids = await Crew.find({ eventId: event._id }).distinct("_id");
  if (!ids.length) return;
  const expiresAt = crewExpiry(event);
  await Promise.all([
    Crew.updateMany({ _id: { $in: ids } }, { $set: { expiresAt } }),
    CrewMember.updateMany({ crewId: { $in: ids } }, { $set: { expiresAt } }),
    CrewMessage.updateMany({ crewId: { $in: ids } }, { $set: { expiresAt } }),
  ]);
}

/** Someone deleted their account: their crews are called off, and they leave the others. */
export async function removeUserFromCrews(userId: Types.ObjectId) {
  await purgeCrews({ hostId: userId });
  const rows = await CrewMember.find({ userId }).lean<ICrewMember[]>();
  for (const r of rows) {
    await CrewMember.deleteOne({ _id: r._id });
    if (r.status === "active") await Crew.updateOne({ _id: r.crewId, memberCount: { $gt: 1 } }, { $inc: { memberCount: -1 } });
  }
  await CrewMessage.deleteMany({ userId });
}

/** "Crew meets soon" to everyone in a crew, about an hour before its meetup. Each crew once. */
export async function runCrewReminders(now = new Date()): Promise<number> {
  const due = await Crew.find({ reminderSentAt: null, meetupAt: { $gt: now, $lte: new Date(+now + 75 * 60_000) } }).limit(200).lean<ICrew[]>();
  let notified = 0;
  for (const c of due) {
    const claimed = await Crew.updateOne({ _id: c._id, reminderSentAt: null }, { $set: { reminderSentAt: now } });
    if (!claimed.modifiedCount) continue;
    const members = await CrewMember.find({ crewId: c._id, status: "active" }).select("userId").lean<{ userId: Types.ObjectId }[]>();
    await notifyNow(members.map((m) => m.userId), { title: "Your crew meets soon", body: `${c.meetupPoint} · ${at(c.meetupAt)}`, data: { type: "crew", id: sid(c._id) } }, { category: "crews", ref: `crew:${sid(c._id)}` });
    notified += members.length;
  }
  return notified;
}

