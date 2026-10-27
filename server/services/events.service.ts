import type { QueryFilter, Types } from "mongoose";
import { assertCanHostInSpace, assertCanHostPublic, canHostInSpace, isSiteAdmin } from "../policies/hosting";
import { deleteUploads } from "./media.service";
import { sameFile } from "@/lib/focal";
import { assertVerified } from "./account.service";
import type { z } from "zod";
import { dateRangeFor, startOfLagosDay, type DateFilter } from "@/lib/dates";
import { currencyOf, getCountry, getRegion, parseScope, regionsOf, scopeFilter, scopeToString, type Scope } from "@/lib/places";
import type { AttendeesDTO, EventDTO, Paginated, UserBrief } from "@/lib/types";
import { ApiError, badRequest, conflict, forbidden, notFound, unauthorized } from "../http/errors";
import { kliqueId } from "./klique-id";
import { rateLimit } from "../http/rate-limit";
import { Community, type ICommunity } from "../models/Community";
import { Event, type IEvent } from "../models/Event";
import { Rsvp, SavedEvent } from "../models/Rsvp";
import { Subcommunity, type ISubcommunity } from "../models/Subcommunity";
import { User, type IUser } from "../models/User";
import {
  audienceFor,
  canSeeEventInFeeds,
  canViewEvent,
  eventVisibilityFilter,
  publishedEvents,
  canReviewEvent,
  assertCanPost,
  spaceAccess,
  type Space,
} from "../policies/access";
import { toEvents } from "../serializers";
import type { eventCreateSchema, eventListQuery, eventOverviewQuery, eventUpdateSchema } from "../validators/schemas";
import { hiddenUserIds } from "./blocks";
import { assertPlace, escapeRegex, PAGE_SIZE, recountRsvps, sid } from "./helpers";
import { notify } from "./push.service";
import { resolveSpaceFor } from "./spaces.service";
import { purgeCrews, syncCrewExpiry } from "./crews.service";
import { ensureKlique, isKlique } from "./klique.service";
import { Membership } from "../models/Membership";

/** Events stay "upcoming" until 3 hours after they start (when no end time is set). */
const LINGER_MS = 3 * 60 * 60 * 1000;

type ListQuery = z.infer<typeof eventListQuery>;

/* ------------------------------------------------------------------ */
/* Listing & search                                                    */
/* ------------------------------------------------------------------ */

export async function listEvents(viewer: IUser | null, q: ListQuery): Promise<Paginated<EventDTO>> {
  const now = new Date();
  const and: QueryFilter<IEvent>[] = [{ cancelled: false }];

  // time window
  const recent = new Date(now.getTime() - LINGER_MS);
  if (q.past) {
    and.push({ startsAt: { $lt: recent } });
  } else if (q.day) {
    // One calendar day (Lagos time), still hiding what has already finished.
    const start = startOfLagosDay(new Date(`${q.day}T12:00:00+01:00`));
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    and.push({ startsAt: { $gte: start > recent ? start : recent, $lt: end } });
  } else if (q.date !== "any") {
    const { from, to } = dateRangeFor(q.date as DateFilter, now);
    and.push({ startsAt: to ? { $gte: from, $lt: to } : { $gte: from } });
  } else {
    and.push({ startsAt: { $gte: recent } });
  }

  const where = parseScope(q.where);
  if (where) and.push(scopeFilter(where) as QueryFilter<IEvent>);
  if (q.format === "online") and.push({ online: true });
  if (q.format === "in-person") and.push({ online: { $ne: true } });
  if (q.interest) and.push({ interest: q.interest });
  if (q.price === "free") and.push({ priceNaira: 0 });
  if (q.price === "paid") and.push({ priceNaira: { $gt: 0 } });
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), "i");
    and.push({ $or: [{ title: rx }, { venue: rx }, { neighborhood: rx }, { description: rx }] });
  }

  // Events inside one community / group: whoever may see that space sees its events. That's how a public
  // community shows visitors what's on before they join; everywhere else, events are for members only.
  if (q.community) {
    const { space, access } = await resolveSpaceFor(viewer, q.community, q.sub);
    if (!access.canView) throw forbidden("Join to see events here.");
    and.push({ communityId: space.community._id, subcommunityId: space.sub?._id ?? null }, publishedEvents(viewer));
  } else {
    and.push(await eventVisibilityFilter(viewer));
  }

  if (q.scope !== "all") {
    if (!viewer) throw unauthorized();
    if (q.scope === "hosted") {
      and.push({ hostId: viewer._id });
    } else if (q.scope === "going") {
      const rows = await Rsvp.find({ userId: viewer._id, status: "going" }).select("eventId").lean<{ eventId: Types.ObjectId }[]>();
      and.push({ _id: { $in: rows.map((r) => r.eventId) } });
    } else {
      const rows = await SavedEvent.find({ userId: viewer._id }).select("eventId").lean<{ eventId: Types.ObjectId }[]>();
      and.push({ _id: { $in: rows.map((r) => r.eventId) } });
    }
  }

  const rows = await Event.find({ $and: and })
    .sort({ startsAt: q.past ? -1 : 1 })
    .skip((q.page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE + 1)
    .lean<IEvent[]>();

  return {
    items: await toEvents(rows.slice(0, PAGE_SIZE), viewer),
    page: q.page,
    hasMore: rows.length > PAGE_SIZE,
  };
}

/* ------------------------------------------------------------------ */
/* Overview: the numbers behind the events page's side panel           */
/* ------------------------------------------------------------------ */

export interface PlaceCount {
  /** the scope string that drills into this place, e.g. "country:GH" */
  scope: string;
  count: number;
}
export interface EventsOverview {
  where: string;
  total: number;
  online: number;
  /** busiest places one level below the current scope */
  places: PlaceCount[];
  /** upcoming events per Lagos calendar day (YYYY-MM-DD), next 60 days */
  days: Record<string, number>;
}

/** The child of `scope` that a stored place falls under (null when the scope can't be split further). */
function childScopeOf(scope: Scope, p: { country: string; region: string; city: string }): Scope | null {
  switch (scope.level) {
    case "world": {
      const continent = getCountry(p.country)?.continent;
      return continent ? { level: "continent", continent } : null;
    }
    case "continent": return { level: "country", country: p.country };
    case "country":
      if (regionsOf(scope.country).length && getRegion(scope.country, p.region)) return { level: "region", country: scope.country, region: p.region };
      return p.city ? { level: "city", country: scope.country, city: p.city } : null;
    case "region": return p.city ? { level: "city", country: scope.country, city: p.city } : null;
    case "city": return null;
  }
}

export async function eventsOverview(viewer: IUser | null, q: z.infer<typeof eventOverviewQuery>): Promise<EventsOverview> {
  const scope = parseScope(q.where) ?? { level: "world" as const };
  const now = new Date();
  const base: QueryFilter<IEvent>[] = [
    await eventVisibilityFilter(viewer),
    { cancelled: false },
    { startsAt: { $gte: new Date(now.getTime() - LINGER_MS) } },
    scopeFilter(scope) as QueryFilter<IEvent>,
  ];
  if (q.interest) base.push({ interest: q.interest });

  const [groups, dayRows, online] = await Promise.all([
    Event.aggregate<{ _id: { country: string; region: string; city: string }; n: number }>([
      { $match: { $and: base } },
      { $group: { _id: { country: "$country", region: "$region", city: "$city" }, n: { $sum: 1 } } },
    ]),
    Event.aggregate<{ _id: string; n: number }>([
      { $match: { $and: [...base, { startsAt: { $lt: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000) } }] } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$startsAt", timezone: "Africa/Lagos" } }, n: { $sum: 1 } } },
    ]),
    Event.countDocuments({ $and: [...base, { online: true }] }),
  ]);

  const byChild = new Map<string, number>();
  let total = 0;
  for (const g of groups) {
    total += g.n;
    const child = childScopeOf(scope, { country: g._id.country ?? "NG", region: g._id.region ?? "", city: g._id.city });
    if (!child) continue;
    const key = scopeToString(child);
    byChild.set(key, (byChild.get(key) ?? 0) + g.n);
  }
  const places = [...byChild.entries()].map(([scope, count]) => ({ scope, count })).sort((a, b) => b.count - a.count).slice(0, 12);
  return { where: scopeToString(scope), total, online, places, days: Object.fromEntries(dayRows.map((d) => [d._id, d.n])) };
}

async function loadVisibleEvent(viewer: IUser | null, id: string): Promise<IEvent> {
  const event = await Event.findById(id).lean<IEvent>();
  // Hidden events look exactly like missing ones.
  if (!event || !(await canViewEvent(event, viewer))) throw notFound("We couldn't find that event.");
  return event;
}

export async function getEvent(viewer: IUser | null, id: string): Promise<EventDTO> {
  const event = await loadVisibleEvent(viewer, id);
  const dto = (await toEvents([event], viewer))[0];
  // waiting for approval: may this viewer decide?
  if (event.review === "pending" && (await canReviewEvent(event, viewer))) dto.viewer.canReview = true;
  // who chipped in, and refunds: the host and the community's owners and admins
  if (event.contribution && (dto.viewer.isHost || (await canReviewEvent(event, viewer)))) dto.viewer.canManageMoney = true;
  return dto;
}

/* ------------------------------------------------------------------ */
/* Create / update / delete                                            */
/* ------------------------------------------------------------------ */

function validateTimes(startsAt: Date, endsAt: Date | null | undefined, mustBeFuture: boolean) {
  const errors: Record<string, string> = {};
  if (mustBeFuture && startsAt.getTime() < Date.now() - 60 * 60 * 1000) {
    errors.startsAt = "Pick a start time in the future.";
  }
  if (endsAt && endsAt <= startsAt) errors.endsAt = "The end has to be after the start.";
  if (Object.keys(errors).length) throw new ApiError(422, Object.values(errors)[0], { errors });
}

/** `reviewedImport`: a site admin posting events the finder found, after review (many at once is expected). */
export async function createEvent(viewer: IUser, input: z.infer<typeof eventCreateSchema>, opts: { reviewedImport?: boolean } = {}): Promise<EventDTO> {
  assertVerified(viewer);
  if (!(opts.reviewedImport && isSiteAdmin(viewer))) rateLimit(`event-create:${sid(viewer._id)}`, 20, 24 * 60 * 60 * 1000);
  assertPlace(input, true);
  validateTimes(input.startsAt, input.endsAt, true);

  let space: Space | null = null;
  // a member's event: it waits for the space's owner or an admin to approve it
  let submitted = false;
  if (input.communitySlug) {
    const resolved = await resolveSpaceFor(viewer, input.communitySlug, input.subSlug);
    // Klique's events go to everyone, so only site admins post there; elsewhere the space's owner and admins
    // post straight away, and members (when the community allows it) send theirs in for approval
    if (isKlique(resolved.space.community)) {
      if (!isSiteAdmin(viewer)) throw forbidden("Only the Klique team posts events in Klique. Post it in your own community.");
      if (!input.interest) throw new ApiError(422, "Pick an interest for this event.", { errors: { interest: "Pick an interest" } });
    } else if (!isSiteAdmin(viewer) && !canHostInSpace(resolved.access)) {
      if (!resolved.access.isMember || resolved.space.community.memberEvents === false) assertCanHostInSpace(viewer, resolved.access);
      assertCanPost(resolved.access);
      rateLimit(`event-submit:${sid(viewer._id)}:${sid(resolved.space.community._id)}`, 5, 24 * 60 * 60 * 1000);
      submitted = true;
    }
    space = resolved.space;
  } else if (input.subSlug) {
    throw new ApiError(422, "Choose the community this group belongs to.", { errors: { communitySlug: "Required with a group" } });
  } else {
    assertCanHostPublic(viewer); // site admins only
    // every event lives in a community: Klique's own (for everyone) go into the default Klique community
    if (!input.interest) throw new ApiError(422, "Pick an interest for this event.", { errors: { interest: "Pick an interest" } });
    const klique = await ensureKlique(viewer._id);
    if (!klique) throw new ApiError(500, "Klique's community isn't set up yet.");
    space = { community: klique, sub: null };
  }

  // chipping in goes to a community: never to Klique itself
  if (input.contribution && space && isKlique(space.community)) throw badRequest("Klique's own events don't take contributions.");
  const interest = input.interest ?? space?.community.interest;
  if (!interest) throw new ApiError(422, "Pick an interest for this event.", { errors: { interest: "Pick an interest" } });

  const doc = await Event.create({
    hostId: viewer._id,
    communityId: space?.community._id ?? null,
    subcommunityId: space?.sub?._id ?? null,
    audience: audienceFor(space),
    title: input.title,
    description: input.description,
    interest,
    country: input.country,
    region: input.region,
    city: input.city,
    online: input.online,
    ticketUrl: input.ticketUrl || null,
    onlineUrl: input.online ? input.onlineUrl || null : null,
    currency: input.currency ?? currencyOf(input.country),
    neighborhood: input.neighborhood,
    venue: input.venue,
    startsAt: input.startsAt,
    endsAt: input.endsAt ?? null,
    priceNaira: input.priceNaira,
    capacity: input.capacity ?? null,
    coverImage: input.coverImage || null,
    review: submitted ? "pending" : null,
    contribution: input.contribution ?? null,
  });

  // Hosts are automatically going.
  await Rsvp.create({ eventId: doc._id, userId: viewer._id, status: "going" });
  await recountRsvps(doc._id);

  if (submitted && space) await askReviewers(doc, space, viewer);
  else if (space) await announceEvent(doc, space, viewer._id);
  return getEvent(viewer, sid(doc._id));
}

/**
 * Tell the people in the community (or group) about a new event. Not for Klique: that's everyone, and its events
 * are on everyone's homepage already.
 */
async function announceEvent(doc: IEvent, space: Space, hostId: Types.ObjectId) {
  if (isKlique(space.community)) return;
  const members = await Membership.find({ communityId: space.community._id, subcommunityId: space.sub?._id ?? null, status: "active", userId: { $ne: hostId } })
    .select("userId")
    .limit(1000)
    .lean<{ userId: Types.ObjectId }[]>();
  notify(
    members.map((m) => m.userId),
    { title: `New event in ${space.sub?.name ?? space.community.name}`, body: `${doc.title} · ${when(doc.startsAt)}`, data: { type: "event", id: sid(doc._id) } },
    // several new events from one place bundle into one line
    { image: doc.coverImage ?? null, action: { kind: "event", eventId: sid(doc._id) }, category: "events", groupKey: `new-events:${sid(space.sub?._id ?? space.community._id)}`, many: (n) => `${n} new events in ${space.sub?.name ?? space.community.name}`, ref: `event:${sid(doc._id)}` },
  );
}

/** The people who can approve a member's event: the space's owners and admins (and a group's community owner). */
async function reviewersOf(space: Space): Promise<Types.ObjectId[]> {
  const rows = await Membership.find({
    communityId: space.community._id,
    status: "active",
    $or: [{ subcommunityId: space.sub?._id ?? null, role: { $in: ["owner", "admin"] } }, ...(space.sub ? [{ subcommunityId: null, role: "owner" as const }] : [])],
  })
    .select("userId")
    .lean<{ userId: Types.ObjectId }[]>();
  return [...new Map(rows.map((r) => [sid(r.userId), r.userId])).values()];
}

async function askReviewers(doc: IEvent, space: Space, host: IUser) {
  const place = space.sub?.name ?? space.community.name;
  notify(
    (await reviewersOf(space)).filter((id) => sid(id) !== sid(host._id)),
    { title: `${host.displayName} sent an event for ${place}`, body: `${doc.title} · ${when(doc.startsAt)}. Approve it to post it.`, data: { type: "event", id: sid(doc._id) } },
    { actorId: host._id, image: doc.coverImage ?? null, action: { kind: "eventReview", eventId: sid(doc._id) }, category: "admin", groupKey: `event-review:${sid(space.sub?._id ?? space.community._id)}`, many: (n) => `${n} events waiting for approval in ${place}`, ref: `event-review:${sid(doc._id)}` },
  );
}

/**
 * The space's owner or an admin approves a member's event (it's posted, and the community hears about it) or turns
 * it down with a reason the host sees. Deciding twice, or on an event that isn't waiting, is refused.
 */
export async function reviewEvent(viewer: IUser, id: string, decision: "approve" | "reject", reason = ""): Promise<EventDTO> {
  const event = await Event.findById(id).lean<IEvent>();
  if (!event || !(await canReviewEvent(event, viewer))) throw notFound("We couldn't find that event.");
  if (event.review !== "pending") throw conflict(event.review === "rejected" ? "This event was already turned down." : "This event is already posted.");
  const why = reason.trim();
  if (decision === "reject" && !why) throw new ApiError(422, "Say why, so the host can fix it.", { errors: { reason: "Required" } });
  const claimed = await Event.updateOne({ _id: event._id, review: "pending" }, { $set: { review: decision === "approve" ? null : "rejected", reviewReason: decision === "approve" ? "" : why, reviewedById: viewer._id, reviewedAt: new Date() } });
  if (!claimed.modifiedCount) throw conflict("Someone else just decided on this event.");

  const community = await Community.findById(event.communityId).lean<ICommunity>();
  const sub = event.subcommunityId ? await Subcommunity.findById(event.subcommunityId).lean<ISubcommunity>() : null;
  const place = sub?.name ?? community?.name ?? "the community";
  if (decision === "approve") {
    notify([event.hostId], { title: `Your event is up in ${place}`, body: `${event.title} was approved.`, data: { type: "event", id: sid(event._id) } }, { actorId: viewer._id, image: event.coverImage ?? null, category: "events", ref: `event-review:${sid(event._id)}` });
    if (community) await announceEvent(event, { community, sub }, event.hostId);
  } else {
    notify([event.hostId], { title: `Your event wasn't approved in ${place}`, body: `${event.title}: ${why}`, data: { type: "event", id: sid(event._id) } }, { actorId: viewer._id, image: event.coverImage ?? null, category: "events", ref: `event-review:${sid(event._id)}` });
  }
  return getEvent(viewer, id);
}

/** Members' events waiting in a community (and its groups) for this owner or admin, oldest first. */
export async function pendingEvents(viewer: IUser, communityId: Types.ObjectId): Promise<EventDTO[]> {
  const rows = await Event.find({ communityId, review: "pending", cancelled: false }).sort({ createdAt: 1 }).limit(100).lean<IEvent[]>();
  const mine: IEvent[] = [];
  for (const e of rows) if (await canReviewEvent(e, viewer)) mine.push(e);
  return toEvents(mine, viewer);
}

/** "Sat 18 Oct, 4:00 PM" in Lagos time. */
export const when = (d: Date) => d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Lagos" });

export async function updateEvent(viewer: IUser, id: string, patch: z.infer<typeof eventUpdateSchema>): Promise<EventDTO> {
  const event = await loadVisibleEvent(viewer, id);
  if (sid(event.hostId) !== sid(viewer._id)) throw forbidden("Only the host can edit this event.");

  const startsAt = patch.startsAt ?? event.startsAt;
  const endsAt = patch.endsAt === undefined ? event.endsAt : patch.endsAt;
  validateTimes(startsAt, endsAt, patch.startsAt !== undefined);

  if (patch.capacity !== undefined && patch.capacity !== null && patch.capacity < event.goingCount) {
    throw new ApiError(422, `${event.goingCount} people are already going — capacity can't go below that.`, {
      errors: { capacity: "Below current attendance" },
    });
  }

  const set: Partial<IEvent> = {};
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.interest !== undefined) set.interest = patch.interest as IEvent["interest"];
  assertPlace(patch, false);
  if (patch.country !== undefined) set.country = patch.country;
  if (patch.region !== undefined) set.region = patch.region;
  if (patch.city !== undefined) set.city = patch.city;
  if (patch.online !== undefined) set.online = patch.online;
  if (patch.ticketUrl !== undefined) set.ticketUrl = patch.ticketUrl || null;
  if (patch.onlineUrl !== undefined) set.onlineUrl = patch.onlineUrl || null;
  if (patch.online === false) set.onlineUrl = null;
  if (patch.currency !== undefined) set.currency = patch.currency;
  if (patch.neighborhood !== undefined) set.neighborhood = patch.neighborhood;
  if (patch.venue !== undefined) set.venue = patch.venue;
  if (patch.startsAt !== undefined) set.startsAt = patch.startsAt;
  if (patch.endsAt !== undefined) set.endsAt = patch.endsAt;
  if (patch.priceNaira !== undefined) set.priceNaira = patch.priceNaira;
  if (patch.capacity !== undefined) set.capacity = patch.capacity;
  if (patch.coverImage !== undefined) set.coverImage = patch.coverImage || null;
  if (patch.cancelled !== undefined) set.cancelled = patch.cancelled;
  if (patch.contribution !== undefined) {
    if (patch.contribution && (!event.communityId || String(event.communityId) === String(await kliqueId()))) throw badRequest("Klique's own events don't take contributions.");
    set.contribution = patch.contribution;
  }

  // a turned-down event the host has fixed goes back to the owners and admins
  const resubmit = event.review === "rejected" && patch.cancelled !== true;
  if (resubmit) Object.assign(set, { review: "pending", reviewReason: "" });
  await Event.updateOne({ _id: event._id }, set);
  if (resubmit && event.communityId) {
    const community = await Community.findById(event.communityId).lean<ICommunity>();
    const sub = event.subcommunityId ? await Subcommunity.findById(event.subcommunityId).lean<ISubcommunity>() : null;
    if (community) await askReviewers({ ...event, ...set } as IEvent, { community, sub }, viewer);
  }
  // crews disappear a day after the event: follow a new time
  if (set.startsAt !== undefined || set.endsAt !== undefined) await syncCrewExpiry({ _id: event._id, startsAt: (set.startsAt as Date | undefined) ?? event.startsAt, endsAt: set.endsAt !== undefined ? (set.endsAt as Date | null) : event.endsAt });
  if (set.coverImage !== undefined && event.coverImage && !sameFile(event.coverImage, set.coverImage)) deleteUploads([event.coverImage]);

  // People who said they're going hear about a cancellation or a new time.
  const cancelledNow = patch.cancelled === true && !event.cancelled;
  const movedNow = !cancelledNow && patch.startsAt !== undefined && +patch.startsAt !== +event.startsAt;
  const placeNow = !cancelledNow && !movedNow && patch.venue !== undefined && patch.venue.trim() !== (event.venue ?? "").trim() && !!patch.venue.trim();
  if (placeNow) {
    const going = await Rsvp.find({ eventId: event._id, status: "going", userId: { $ne: viewer._id } }).select("userId").lean<{ userId: Types.ObjectId }[]>();
    notify(going.map((g) => g.userId), { title: "New place", body: `${set.title ?? event.title} is now at ${patch.venue}.`, data: { type: "event", id } }, { category: "events", ref: `event:${id}` });
  }
  if (cancelledNow || movedNow) {
    const going = await Rsvp.find({ eventId: event._id, status: "going", userId: { $ne: viewer._id } }).select("userId").lean<{ userId: Types.ObjectId }[]>();
    notify(
      going.map((g) => g.userId),
      cancelledNow
        ? { title: "Event cancelled", body: `${set.title ?? event.title} has been cancelled.`, data: { type: "event", id } }
        : { title: "New time", body: `${set.title ?? event.title} is now ${when(patch.startsAt as Date)}.`, data: { type: "event", id } },
      { category: "events", ref: `event:${id}` },
    );
  }
  return getEvent(viewer, id);
}

export async function deleteEvent(viewer: IUser, id: string) {
  const event = await loadVisibleEvent(viewer, id);
  let allowed = sid(event.hostId) === sid(viewer._id);

  // Admins of the space the event lives in may remove it too (moderation).
  if (!allowed && event.communityId) {
    const [community, sub] = await Promise.all([
      Community.findById(event.communityId).lean<ICommunity>(),
      event.subcommunityId ? Subcommunity.findById(event.subcommunityId).lean<ISubcommunity>() : null,
    ]);
    if (community) allowed = (await spaceAccess({ community, sub }, viewer)).canManage;
  }
  if (!allowed) throw forbidden("Only the host or a community admin can delete this event.");

  // people going hear that it's gone (unless it was already cancelled, and they were told then)
  const going = event.cancelled || +event.startsAt < Date.now() ? [] : await Rsvp.find({ eventId: event._id, status: "going", userId: { $ne: viewer._id } }).select("userId").lean<{ userId: Types.ObjectId }[]>();
  await purgeEvent(event);
  if (going.length) notify(going.map((g) => g.userId), { title: "Event removed", body: `${event.title} was taken down, so it's off.`, data: { href: "/events" } }, { category: "events", ref: `event:${sid(event._id)}` });
  return { deleted: true };
}

/** Delete an event with its RSVPs and saves (no permission check: callers do that). */
export async function purgeEvent(event: Pick<IEvent, "_id" | "coverImage">) {
  await Promise.all([Event.deleteOne({ _id: event._id }), Rsvp.deleteMany({ eventId: event._id }), SavedEvent.deleteMany({ eventId: event._id }), purgeCrews({ eventId: event._id })]);
  deleteUploads([event.coverImage]);
}

/* ------------------------------------------------------------------ */
/* RSVP & save                                                         */
/* ------------------------------------------------------------------ */

/** Going to (or saving) a community's event means joining it first: members are who see its events. */
async function assertCanJoinIn(viewer: IUser, event: IEvent, what: string) {
  if (await canSeeEventInFeeds(event, viewer)) return;
  const c = event.communityId ? await Community.findById(event.communityId).select("name").lean<Pick<ICommunity, "name">>() : null;
  throw forbidden(`Join ${c?.name ?? "the community"} to ${what}.`);
}

export async function setRsvp(viewer: IUser, id: string, status: "going" | "interested"): Promise<EventDTO> {
  const event = await loadVisibleEvent(viewer, id);
  await assertCanJoinIn(viewer, event, "RSVP");
  const end = (event.endsAt ?? new Date(event.startsAt.getTime() + LINGER_MS)).getTime();
  if (event.cancelled) throw conflict("This event was cancelled.");
  if (event.review) throw conflict(event.review === "pending" ? "This event is waiting for an admin to approve it." : "This event wasn't approved.");
  if (end < Date.now()) throw conflict("This event has already happened.");

  const existing = await Rsvp.findOne({ eventId: event._id, userId: viewer._id }).lean<{ status: string }>();
  if (status === "going" && existing?.status !== "going" && event.capacity !== null && event.goingCount >= event.capacity) {
    throw conflict("This event is full.");
  }

  await Rsvp.updateOne({ eventId: event._id, userId: viewer._id }, { status }, { upsert: true });
  await recountRsvps(event._id);
  return getEvent(viewer, id);
}

export async function removeRsvp(viewer: IUser, id: string): Promise<EventDTO> {
  const event = await loadVisibleEvent(viewer, id);
  if (sid(event.hostId) === sid(viewer._id)) throw conflict("You're hosting this one. Cancel the event instead of leaving it.");
  await Rsvp.deleteOne({ eventId: event._id, userId: viewer._id });
  await recountRsvps(event._id);
  return getEvent(viewer, id);
}

export async function setSaved(viewer: IUser, id: string, saved: boolean): Promise<EventDTO> {
  const event = await loadVisibleEvent(viewer, id);
  if (saved) await assertCanJoinIn(viewer, event, "save its events");
  if (saved) await SavedEvent.updateOne({ eventId: event._id, userId: viewer._id }, {}, { upsert: true });
  else await SavedEvent.deleteOne({ eventId: event._id, userId: viewer._id });
  return getEvent(viewer, id);
}

/** Counts are public; names only for signed-in viewers and only for people who made attendance public. */
export async function getAttendees(viewer: IUser | null, id: string): Promise<AttendeesDTO> {
  const event = await loadVisibleEvent(viewer, id);
  const base = { goingCount: event.goingCount, interestedCount: event.interestedCount };
  if (!viewer) return { ...base, people: [], namesHidden: event.goingCount > 0 };

  const hidden = await hiddenUserIds(viewer._id);
  const rsvps = await Rsvp.find({ eventId: event._id, status: "going", userId: { $nin: hidden } })
    .sort({ createdAt: 1 })
    .limit(60)
    .select("userId")
    .lean<{ userId: Types.ObjectId }[]>();

  const users = await User.find({
    _id: { $in: rsvps.map((r) => r.userId) },
    $or: [{ attendancePublic: true }, { _id: viewer._id }],
  })
    .select("handle displayName avatarUrl avatarFrame nameEffect country city")
    .limit(24)
    .lean<IUser[]>();

  const people: UserBrief[] = users.map((u) => ({
    id: sid(u._id),
    handle: u.handle,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    avatarFrame: u.avatarFrame ?? null,
    nameEffect: u.nameEffect ?? null,
    country: u.country ?? "NG",
    city: u.city,
  }));
  return { ...base, people, namesHidden: event.goingCount > people.length };
}

/* ------------------------------------------------------------------ */
/* Helpers for profile pages                                           */
/* ------------------------------------------------------------------ */

/** Events `userId` hosts that `viewer` is allowed to see. */
export async function hostedEventsOf(viewer: IUser | null, userId: Types.ObjectId, limit = 6): Promise<EventDTO[]> {
  const rows = await Event.find({ $and: [await eventVisibilityFilter(viewer), { hostId: userId, cancelled: false }] })
    .sort({ startsAt: -1 })
    .limit(limit)
    .lean<IEvent[]>();
  return toEvents(rows, viewer);
}

/** Upcoming events `userId` is going to that `viewer` is allowed to see. */
export async function upcomingRsvpEventsOf(viewer: IUser | null, userId: Types.ObjectId, limit = 8): Promise<EventDTO[]> {
  const rsvps = await Rsvp.find({ userId, status: "going" }).select("eventId").lean<{ eventId: Types.ObjectId }[]>();
  if (!rsvps.length) return [];
  const rows = await Event.find({
    $and: [
      await eventVisibilityFilter(viewer),
      { _id: { $in: rsvps.map((r) => r.eventId) }, cancelled: false, startsAt: { $gte: new Date(Date.now() - LINGER_MS) } },
    ],
  })
    .sort({ startsAt: 1 })
    .limit(limit)
    .lean<IEvent[]>();
  return toEvents(rows, viewer);
}
