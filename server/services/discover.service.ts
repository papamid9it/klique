import type { InterestId } from "@/lib/constants";
import { parseScope, scopeFilter, scopeFromPlace, scopeToString } from "@/lib/places";
import { visibleCategories } from "@/lib/constants";
import { dateRangeFor, startOfLagosDay } from "@/lib/dates";
import type { CommunityCardDTO, DiscoverDTO, EventDTO, SearchResultsDTO } from "@/lib/types";
import { Community, type ICommunity } from "../models/Community";
import { Event, type IEvent } from "../models/Event";
import { Membership } from "../models/Membership";
import { Rsvp } from "../models/Rsvp";
import type { IUser } from "../models/User";
import { eventVisibilityFilter } from "../policies/access";
import { toCommunityCards, toEvents } from "../serializers";
import { User } from "../models/User";
import { toBrief } from "../serializers";
import { hiddenUserIds } from "./blocks";
import { listCommunities } from "./communities.service";
import { listEvents } from "./events.service";
import { kliqueId } from "./klique-id";
import { escapeRegex } from "./helpers";

const LINGER_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function discover(viewer: IUser | null, whereParam?: string): Promise<DiscoverDTO> {
  // No place chosen: look in the viewer's own city (everywhere when signed out).
  const scope = parseScope(whereParam) ?? (viewer ? scopeFromPlace(viewer, "city") : parseScope("world")!);
  const place = scopeFilter(scope);
  const mine = new Set<string>(viewer?.interests ?? []);
  const from = new Date(Date.now() - LINGER_MS);
  const visibility = await eventVisibilityFilter(viewer);

  const now = new Date();
  const today = startOfLagosDay(now);
  const live = { cancelled: false, startsAt: { $gte: from } };
  const joinedIds = viewer
    ? (await Membership.find({ userId: viewer._id, status: "active", subcommunityId: null }).select("communityId").lean<{ communityId: ICommunity["_id"] }[]>()).map(
        (m) => m.communityId,
      )
    : [];
  const goingIds = viewer ? (await Rsvp.find({ userId: viewer._id, status: "going" }).select("eventId").lean<{ eventId: IEvent["_id"] }[]>()).map((r) => r.eventId) : [];

  const [upcoming, planRows, communityRows, perDay] = await Promise.all([
    Event.find({ $and: [visibility, { ...place, ...live }] })
      .sort({ startsAt: 1 })
      .limit(120)
      .lean<IEvent[]>(),
    goingIds.length ? Event.find({ $and: [visibility, { _id: { $in: goingIds }, ...live }] }).sort({ startsAt: 1 }).limit(3).lean<IEvent[]>() : Promise.resolve<IEvent[]>([]),
    joinedIds.length
      ? // "From your communities": the ones you chose (Klique's events are already all over the page)
        Event.find({ $and: [visibility, { communityId: { $in: joinedIds, $ne: await kliqueId() }, ...live, startsAt: { $gte: now } }] }).sort({ startsAt: 1 }).limit(12).lean<IEvent[]>()
      : Promise.resolve<IEvent[]>([]),
    Event.aggregate<{ _id: string; n: number }>([
      { $match: { $and: [visibility, { ...place, cancelled: false, startsAt: { $gte: today, $lt: new Date(+today + 7 * DAY_MS) } }] } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$startsAt", timezone: "Africa/Lagos" } }, n: { $sum: 1 } } },
    ]),
  ]);

  // Interest matches first, then soonest.
  const ranked = [...upcoming].sort((a, b) => Number(mine.has(b.interest)) - Number(mine.has(a.interest)) || +a.startsAt - +b.startsAt);
  // The big banner is public-facing: only events open to everyone (never a members-only community or group
  // event), the one with the most people going first; your interests, then the sooner one, break ties.
  const candidates = upcoming.filter((e) => e.audience === "public" && !e.subcommunityId);
  const candidateCommunities = [...new Set(candidates.map((e) => e.communityId).filter(Boolean).map(String))];
  const privateCommunities = new Set(
    candidateCommunities.length ? (await Community.find({ _id: { $in: candidateCommunities }, privacy: { $ne: "public" } }).select("_id").lean<{ _id: ICommunity["_id"] }[]>()).map((c) => String(c._id)) : [],
  );
  const featuredRow =
    candidates
      .filter((e) => !e.communityId || !privateCommunities.has(String(e.communityId)))
      .sort((a, b) => (b.goingCount ?? 0) - (a.goingCount ?? 0) || Number(mine.has(b.interest)) - Number(mine.has(a.interest)) || +a.startsAt - +b.startsAt)[0] ?? null;
  const nearRows = ranked.filter((e) => e !== featuredRow).slice(0, 6);

  // The themed rows below never repeat an event already shown above them.
  const shown = new Set([featuredRow, ...nearRows].filter(Boolean).map((e) => String(e!._id)));
  const pick = (rows: IEvent[], keep: (e: IEvent) => boolean, n = 3) => {
    const out = rows.filter((e) => !shown.has(String(e._id)) && keep(e)).slice(0, n);
    for (const e of out) shown.add(String(e._id));
    return out;
  };
  const weekend = dateRangeFor("weekend", now);
  const soon = upcoming.filter((e) => e.startsAt >= now);
  const weekendRows = pick(soon, (e) => e.startsAt >= weekend.from && (!weekend.to || e.startsAt < weekend.to));
  const fromCommunityRows = pick(communityRows, () => true);
  const freeRows = pick(soon, (e) => !e.priceNaira);
  const onlineRows = pick(soon, (e) => e.online);

  // One serializer pass for everything on the page.
  const all = [...new Map([featuredRow, ...nearRows, ...planRows, ...weekendRows, ...fromCommunityRows, ...freeRows, ...onlineRows].filter(Boolean).map((e) => [String(e!._id), e!])).values()];
  const dtos = new Map((await toEvents(all, viewer)).map((d) => [d.id, d]));
  const dto = (rows: IEvent[]) => rows.map((e) => dtos.get(String(e._id))).filter((d): d is EventDTO => !!d);
  const featured = featuredRow ? (dtos.get(String(featuredRow._id)) ?? null) : null;
  const eventsNearYou = dto(nearRows);

  const counts7 = new Map(perDay.map((d) => [d._id, d.n]));
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(+today + i * DAY_MS + 12 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
    return { day, count: counts7.get(day) ?? 0 };
  });

  // Communities
  const [newRows, suggestedPool] = await Promise.all([
    Community.find({ privacy: "public", ...place }).sort({ createdAt: -1 }).limit(4).lean<ICommunity[]>(),
    Community.find({ privacy: "public", ...place, _id: { $nin: joinedIds } }).sort({ memberCount: -1 }).limit(30).lean<ICommunity[]>(),
  ]);
  const suggestedRows = [...suggestedPool].sort((a, b) => Number(mine.has(b.interest)) - Number(mine.has(a.interest)) || b.memberCount - a.memberCount).slice(0, 4);
  const [newCommunities, suggestedCommunities] = await Promise.all([toCommunityCards(newRows, viewer), toCommunityCards(suggestedRows, viewer)]);

  // "Your scenes": the viewer's interests (or the busiest ones, signed out) with upcoming event counts.
  const counts = new Map<string, number>();
  for (const e of upcoming) counts.set(e.interest, (counts.get(e.interest) ?? 0) + 1);
  const interests: InterestId[] = viewer?.interests?.length
    ? viewer.interests
    : visibleCategories().map((c) => c.id).sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0)).slice(0, 4);
  const yourScenes = interests.map((interest) => ({ interest, count: counts.get(interest) ?? 0 }));

  return {
    where: scopeToString(scope),
    featured,
    eventsNearYou,
    newCommunities,
    suggestedCommunities,
    yourScenes,
    yourPlans: dto(planRows),
    week,
    thisWeekend: dto(weekendRows),
    fromCommunities: dto(fromCommunityRows),
    free: dto(freeRows),
    online: dto(onlineRows),
  };
}

export async function search(viewer: IUser | null, q: string, where?: string): Promise<SearchResultsDTO> {
  const [communities, events, people] = await Promise.all([
    // Both reuse the list services, so search can never see more than browsing can.
    listCommunities(viewer, { q, where, page: 1, scope: "discover" }).then((r) => r.items.slice(0, 6) as CommunityCardDTO[]),
    listEvents(viewer, { q, where, page: 1, price: "any", format: "any", date: "any", scope: "all", past: false }).then((r) => r.items.slice(0, 6)),
    searchPeople(viewer, q, where),
  ]);
  return { query: q, communities, events, people };
}

async function searchPeople(viewer: IUser | null, q: string, where?: string) {
  const scope = parseScope(where);
  const hidden = await hiddenUserIds(viewer?._id ?? null);
  const rx = new RegExp(escapeRegex(q), "i");
  const rows = await User.find({
    profileVisibility: viewer ? { $ne: "private" } : "public",
    _id: { $nin: [...hidden, ...(viewer ? [viewer._id] : [])] },
    ...scopeFilter(scope),
    $or: [{ handle: rx }, { displayName: rx }],
  })
    .limit(8)
    .select("handle displayName avatarUrl avatarFrame nameEffect rank country city")
    .lean<IUser[]>();
  return rows.map(toBrief);
}
