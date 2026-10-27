import ApiClient from "@/app/ApiCore";
import type { Envelope, ProfileEffectDTO } from "@/lib/types";

const api = new ApiClient();

export interface EffectInput {
  name: string;
  /** a Lottie JSON */
  fileUrl: string;
  posterFrame?: number;
  price?: number | null;
  active?: boolean;
}

/** Profile effects: the catalogue, and the site admins' side. */
export const EffectService = {
  list: () => api.get<Envelope<ProfileEffectDTO[]>>("/api/effects"),
  adminList: () => api.get<Envelope<ProfileEffectDTO[]>>("/api/admin/effects"),
  add: (input: EffectInput) => api.post<Envelope<ProfileEffectDTO>>("/api/admin/effects", input),
  edit: (slug: string, input: EffectInput) => api.patch<Envelope<ProfileEffectDTO>>(`/api/admin/effects/${slug}`, input),
  /** Upload an effect's file (.lottie or .json): the server checks it, minifies JSON, and says the sizes before and after. */
  uploadFile: (file: File) => api.postFile<Envelope<{ url: string; before: number; after: number }>>(`/api/admin/effect-files?name=${encodeURIComponent(file.name)}`, file),
  remove: (slug: string) => api.delete<Envelope<{ deleted: boolean }>>(`/api/admin/effects/${slug}`),
};
