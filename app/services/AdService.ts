import ApiClient from "@/app/ApiCore";
import type { AdDTO, AdInput, AdminAdDTO, AdSlot, Envelope } from "@/lib/types";

const api = new ApiClient();

export const AdService = {
  /** The ad(s) for one spot. Never cached: each view is a fresh pick. */
  forSlot: (slot: AdSlot, ctx: { where?: string; interest?: string; q?: string; exclude?: string; count?: number } = {}) =>
    api.get<Envelope<AdDTO[]>>("/api/ads", { slot, ...ctx }),
  /** Count a click; the link itself navigates on its own. */
  click: (id: string) => {
    void fetch(`/api/ads/${id}/click`, { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
  },

  /* admin */
  list: () => api.get<Envelope<AdminAdDTO[]>>("/api/admin/ads"),
  create: (input: AdInput) => api.post<Envelope<AdminAdDTO>>("/api/admin/ads", input),
  update: (id: string, input: AdInput) => api.patch<Envelope<AdminAdDTO>>(`/api/admin/ads/${id}`, input),
  setStatus: (id: string, status: "active" | "paused") => api.patch<Envelope<AdminAdDTO>>(`/api/admin/ads/${id}`, { status }),
  remove: (id: string) => api.delete<Envelope<{ deleted: boolean }>>(`/api/admin/ads/${id}`),
};
