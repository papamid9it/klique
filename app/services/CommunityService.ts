import ApiClient from "@/app/ApiCore";
import type { Reach } from "@/lib/places";
import type { CityId, InterestId } from "@/lib/constants";

/** a cause as its owner writes it: goal in Hype (null: no goal) */
export type CauseInput = { label: string; title: string; description?: string; imageUrl?: string | null; goalHype?: number | null; main?: boolean };
import type { CommunityCardDTO, CommunityDTO, CommunityPrivacy, Envelope, GroupPolicy, MyCommunityDTO, Paginated, SidebarDTO, CommunityDashboardDTO, CommunityReviewDTO, CauseDTO, CausesDTO, GrowthStatsDTO, VerificationDTO, Move } from "@/lib/types";

const api = new ApiClient();

export interface CommunityListParams {
  /** where to look, e.g. "country:GH" (see lib/places.ts) */
  where?: string;
  interest?: InterestId;
  q?: string;
  /** "joined" lists the signed-in user's communities (including private ones they belong to). */
  scope?: "discover" | "joined";
  page?: number;
}

export interface CommunityInput {
  audience?: "everyone" | "women" | "men";
  name: string;
  description?: string;
  interest: InterestId;
  country: string;
  region: string;
  /** "" when it reaches further than a city */
  city: CityId;
  /** set only when it reaches a whole continent */
  continent?: string;
  /** what was picked: a city, a state, a country, a continent or worldwide (the server checks the fields fill it) */
  reach?: Reach;
  neighborhood?: string;
  privacy?: CommunityPrivacy;
  /** 18+ (private only), and allowing explicit content (18+ only) */
  adult?: boolean;
  explicit?: boolean;
  groupPolicy?: GroupPolicy;
  /** the Posts section (pictures and videos): off, or who may post */
  feedPolicy?: GroupPolicy;
  /** the board and the community's own kliques, on or off */
  boardsOn?: boolean;
  kliquesOn?: boolean;
  /** points needed to join and to post (0: anyone) */
  minPointsJoin?: number;
  minPointsPost?: number;
  /** members may send events in for approval */
  memberEvents?: boolean;
  /** members may use @everyone / @here */
  membersMassMention?: boolean;
  /** the member list shows how many are online (owner only) */
  showOnline?: boolean;
  coverImage?: string | null;
}

export const CommunityService = {
  list: (params: CommunityListParams = {}) => api.get<Envelope<Paginated<CommunityCardDTO>>>("/api/communities", { ...params }, { ttl: 30 }),
  /** the switcher rail: communities you belong to, with unread + mention counts */
  mine: () => api.get<Envelope<MyCommunityDTO[]>>("/api/me/communities", undefined, { ttl: 20 }),
  /** everything you can see there: read up to the newest message */
  markRead: (slug: string) => api.post<Envelope<{ read: boolean }>>(`/api/communities/${slug}/read`),
  setMuted: (slug: string, muted: boolean) => api.put<Envelope<{ muted: boolean }>>(`/api/communities/${slug}/mute`, { muted }),
  /** header, channels and boards of up to 20 communities in one request (preloading) */
  sidebars: (slugs: string[]) => api.get<Envelope<Record<string, SidebarDTO | null>>>("/api/me/sidebars", { slugs: slugs.join(",") }),
  get: (slug: string) => api.get<Envelope<CommunityDTO>>(`/api/communities/${slug}`, undefined, { ttl: 15 }),
  create: (input: CommunityInput) => api.post<Envelope<CommunityDTO>>("/api/communities", input),
  update: (slug: string, patch: Partial<CommunityInput> & { moveBoards?: Move; mainChannel?: string | null }) => api.patch<Envelope<CommunityDTO>>(`/api/communities/${slug}`, patch),
  /** the owner's dashboard: members and growth, what's waiting for approval, this week (owners and admins) */
  dashboard: (slug: string) => api.get<Envelope<CommunityDashboardDTO>>(`/api/communities/${slug}/dashboard`),
  /** "To review": members' events waiting for approval, and how many join requests (people who approve things) */
  /** causes: what the community raises Hype for (anyone who can see it), and making, changing and ending them (owner, admins) */
  causes: (slug: string) => api.get<Envelope<CausesDTO>>(`/api/communities/${slug}/causes`),
  saveCause: (slug: string, input: CauseInput, id?: string) => (id ? api.patch<Envelope<CauseDTO>>(`/api/communities/${slug}/causes/${id}`, input) : api.post<Envelope<CauseDTO>>(`/api/communities/${slug}/causes`, input)),
  endCause: (slug: string, id: string) => api.delete<Envelope<{ ended: boolean }>>(`/api/communities/${slug}/causes/${id}`),
  /** give Hype to a cause: a gift, never refunded */
  giveToCause: (slug: string, id: string, input: { hype: number; clientKey: string; anonymous?: boolean; agree: true }) => api.post<Envelope<{ balance: number; cause: CauseDTO }>>(`/api/communities/${slug}/causes/${id}/give`, input),
  review: (slug: string, after?: string | null) => api.get<Envelope<CommunityReviewDTO>>(`/api/communities/${slug}/review`, after ? { after } : undefined),
  growth: (slug: string) => api.get<Envelope<GrowthStatsDTO>>(`/api/communities/${slug}/growth`),
  remove: (slug: string) => api.delete<Envelope<{ deleted: boolean }>>(`/api/communities/${slug}`),
  /** the Verified check: where it stands, and applying for it (the owner) */
  verification: (slug: string) => api.get<Envelope<VerificationDTO>>(`/api/communities/${slug}/verification`),
  applyForVerification: (slug: string) => api.post<Envelope<VerificationDTO>>(`/api/communities/${slug}/verification`),
};
