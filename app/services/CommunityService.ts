import ApiClient from "@/app/ApiCore";
import type { CityId, InterestId } from "@/lib/constants";
import type { CommunityCardDTO, CommunityDTO, CommunityPrivacy, Envelope, GroupPolicy, MyCommunityDTO, Paginated, SidebarDTO, CommunityDashboardDTO } from "@/lib/types";

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
  name: string;
  description?: string;
  interest: InterestId;
  country: string;
  region: string;
  city: CityId;
  neighborhood?: string;
  privacy?: CommunityPrivacy;
  groupPolicy?: GroupPolicy;
  /** the Posts section (pictures and videos): off, or who may post */
  feedPolicy?: GroupPolicy;
  /** points needed to join and to post (0: anyone) */
  minPointsJoin?: number;
  minPointsPost?: number;
  /** members may send events in for approval */
  memberEvents?: boolean;
  coverImage?: string | null;
}

export const CommunityService = {
  list: (params: CommunityListParams = {}) => api.get<Envelope<Paginated<CommunityCardDTO>>>("/api/communities", { ...params }, { ttl: 30 }),
  /** the switcher rail: communities you belong to, with unread + mention counts */
  mine: () => api.get<Envelope<MyCommunityDTO[]>>("/api/me/communities", undefined, { ttl: 20 }),
  /** header, channels and boards of up to 20 communities in one request (preloading) */
  sidebars: (slugs: string[]) => api.get<Envelope<Record<string, SidebarDTO | null>>>("/api/me/sidebars", { slugs: slugs.join(",") }),
  get: (slug: string) => api.get<Envelope<CommunityDTO>>(`/api/communities/${slug}`, undefined, { ttl: 15 }),
  create: (input: CommunityInput) => api.post<Envelope<CommunityDTO>>("/api/communities", input),
  update: (slug: string, patch: Partial<CommunityInput>) => api.patch<Envelope<CommunityDTO>>(`/api/communities/${slug}`, patch),
  /** the owner's dashboard: members and growth, what's waiting for approval, this week (owners and admins) */
  dashboard: (slug: string) => api.get<Envelope<CommunityDashboardDTO>>(`/api/communities/${slug}/dashboard`),
  remove: (slug: string) => api.delete<Envelope<{ deleted: boolean }>>(`/api/communities/${slug}`),
};
