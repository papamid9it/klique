import ApiClient from "@/app/ApiCore";
import type { CityId, InterestId } from "@/lib/constants";
import type { CommunityCardDTO, CommunityDTO, CommunityPrivacy, Envelope, GroupPolicy, MyCommunityDTO, Paginated } from "@/lib/types";

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
  eventPolicy?: "admins" | "members";
  coverImage?: string | null;
}

export const CommunityService = {
  list: (params: CommunityListParams = {}) => api.get<Envelope<Paginated<CommunityCardDTO>>>("/api/communities", { ...params }, { ttl: 30 }),
  /** the switcher rail: communities you belong to, with unread + mention counts */
  mine: () => api.get<Envelope<MyCommunityDTO[]>>("/api/me/communities", undefined, { ttl: 20 }),
  get: (slug: string) => api.get<Envelope<CommunityDTO>>(`/api/communities/${slug}`, undefined, { ttl: 15 }),
  create: (input: CommunityInput) => api.post<Envelope<CommunityDTO>>("/api/communities", input),
  update: (slug: string, patch: Partial<CommunityInput>) => api.patch<Envelope<CommunityDTO>>(`/api/communities/${slug}`, patch),
  remove: (slug: string) => api.delete<Envelope<{ deleted: boolean }>>(`/api/communities/${slug}`),
};
