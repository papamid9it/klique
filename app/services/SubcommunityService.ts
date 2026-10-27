import ApiClient from "@/app/ApiCore";
import type { Envelope, SubcommunityDTO, UserBrief } from "@/lib/types";

const api = new ApiClient();

/** Groups are always private: nobody joins, the group's owner and admins add people from the community. */
export interface SubcommunityInput {
  name: string;
  description?: string;
  /** points needed to be added and to post (0: anyone) */
  minPointsJoin?: number;
  minPointsPost?: number;
}

export const SubcommunityService = {
  list: (slug: string) => api.get<Envelope<SubcommunityDTO[]>>(`/api/communities/${slug}/groups`),
  get: (slug: string, subSlug: string) => api.get<Envelope<SubcommunityDTO>>(`/api/communities/${slug}/groups/${subSlug}`),
  create: (slug: string, input: SubcommunityInput) => api.post<Envelope<SubcommunityDTO>>(`/api/communities/${slug}/groups`, input),
  update: (slug: string, subSlug: string, patch: Partial<SubcommunityInput>) =>
    api.patch<Envelope<SubcommunityDTO>>(`/api/communities/${slug}/groups/${subSlug}`, patch),
  remove: (slug: string, subSlug: string) => api.delete<Envelope<{ deleted: boolean }>>(`/api/communities/${slug}/groups/${subSlug}`),
  /** community members not in the group yet (group owners and admins only) */
  addable: (slug: string, subSlug: string, q = "") => api.get<Envelope<UserBrief[]>>(`/api/communities/${slug}/groups/${subSlug}/members/add`, { q }),
  addMembers: (slug: string, subSlug: string, userIds: string[]) =>
    api.post<Envelope<{ added: number; memberCount: number }>>(`/api/communities/${slug}/groups/${subSlug}/members/add`, { userIds }),
};
