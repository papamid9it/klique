import ApiClient from "@/app/ApiCore";
import type { Envelope, SubcommunityDTO, SubVisibility } from "@/lib/types";

const api = new ApiClient();

export interface SubcommunityInput {
  name: string;
  description?: string;
  /** "parent" = anyone in the parent community can see and join; "private" = invite-only. */
  visibility?: SubVisibility;
}

export const SubcommunityService = {
  list: (slug: string) => api.get<Envelope<SubcommunityDTO[]>>(`/api/communities/${slug}/groups`),
  get: (slug: string, subSlug: string) => api.get<Envelope<SubcommunityDTO>>(`/api/communities/${slug}/groups/${subSlug}`),
  create: (slug: string, input: SubcommunityInput) => api.post<Envelope<SubcommunityDTO>>(`/api/communities/${slug}/groups`, input),
  update: (slug: string, subSlug: string, patch: Partial<SubcommunityInput>) =>
    api.patch<Envelope<SubcommunityDTO>>(`/api/communities/${slug}/groups/${subSlug}`, patch),
  remove: (slug: string, subSlug: string) => api.delete<Envelope<{ deleted: boolean }>>(`/api/communities/${slug}/groups/${subSlug}`),
};
