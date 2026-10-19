import type { InterestId } from "@/lib/constants";
import { parseScope, scopeFilter, scopeFromPlace, scopeToString } from "@/lib/places";
import { INTEREST_IDS } from "@/lib/constants";
import type { CommunityCardDTO, DiscoverDTO, EventDTO, SearchResultsDTO } from "@/lib/types";
import { Community, type ICommunity } from "../models/Community";
import { Event, type IEvent } from "../models/Event";
import { Membership } from "../models/Membership";
import type { IUser } from "../models/User";
import { eventVisibilityFilter } from "../policies/access";
import { toCommunityCards, toEvents } from "../serializers";
import { User } from "../models/User";
import { toBrief } from "../serializers";
import { hiddenUserIds } from "./blocks";
import { listCommunities } from "./communities.service";
import { listEvents } from "./events.service";
import { escapeRegex } from "./helpers";

const LINGER_MS = 3 * 60 * 60 * 1000;

export async function discover(viewer: IUser | null, whereParam?: string): Promise<DiscoverDTO> {
  // No place chosen: look in the viewer's own city (everywhere when signed out).
  const scope = parseScope(whereParam) ?? (viewer ? scopeFromPlace(viewer, "city") : parseScope("world")!);
  const place = scopeFilter(scope);
  const mine = new Set<string>(viewer?.interests ?? []);
  const from = new Date(Date.now() - LINGER_MS);
  const visibility = await eventVisibilityFilter(viewer);

  const upcoming = await Event.find({ $and: [visibility, { ...place, cancelled: false, startsAt: { $gte: from } }] })
    .sort({ startsAt: 1 })
    .limit(40)
    .lean<IEvent[]>();

  // Interest matches first, then soonest.
  const ranked = [...upcoming].sort((a, b) => Number(mine.has(b.interest)) - Number(mine.has(a.interest)) || +a.startsAt - +b.startsAt);
  const featuredRow = ranked.find((e) => e.coverImage) ?? ranked[0] ?? null;
  const nearRows = ranked.filter((e) => e !== featuredRow).slice(0, 6);
  const [featured, eventsNearYou] = await Promise.all([
    featuredRow ? toEvents([featuredRow], viewer).then((r) => r[0]) : Promise.resolve<EventDTO | null>(null),
    toEvents(nearRows, viewer),
  ]);

  // Communities
  const joinedIds = viewer
    ? (await Membership.find({ userId: viewer._id, status: "active", subcommunityId: null }).select("communityId").lean<{ communityId: ICommunity["_id"] }[]>()).map(
        (m) => m.communityId,
      )
    : [];
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
    : [...INTEREST_IDS].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0)).slice(0, 4);
  const yourScenes = interests.map((interest) => ({ interest, count: counts.get(interest) ?? 0 }));

  return { where: scopeToString(scope), featured, eventsNearYou, newCommunities, suggestedCommunities, yourScenes };
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
    .select("handle displayName avatarUrl avatarFrame nameEffect country city")
    .lean<IUser[]>();
  return rows.map(toBrief);
}
