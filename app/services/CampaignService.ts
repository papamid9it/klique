import ApiClient from "@/app/ApiCore";
import type { AdPricing } from "@/lib/ads";
import type { AdCampaignDTO, AdCampaignInput, Envelope } from "@/lib/types";

const api = new ApiClient();

/** Ads people send in (yours), and the admin side of reviewing them. */
export const CampaignService = {
  pricing: () => api.get<Envelope<AdPricing>>("/api/ads/pricing"),
  mine: () => api.get<Envelope<AdCampaignDTO[]>>("/api/me/ads"),
  get: (id: string) => api.get<Envelope<AdCampaignDTO>>(`/api/me/ads/${id}`),
  submit: (input: AdCampaignInput) => api.post<Envelope<AdCampaignDTO>>("/api/me/ads", input),
  update: (id: string, input: AdCampaignInput) => api.patch<Envelope<AdCampaignDTO>>(`/api/me/ads/${id}`, input),
  cancel: (id: string) => api.post<Envelope<AdCampaignDTO>>(`/api/me/ads/${id}/cancel`),
  pay: (id: string) => api.post<Envelope<{ authorizationUrl: string; reference: string }>>(`/api/me/ads/${id}/pay`),
  verify: (reference: string) => api.post<Envelope<AdCampaignDTO>>("/api/me/ads/verify", { reference }),

  adminList: (status: "review" | "approved" | "running" | "all") => api.get<Envelope<AdCampaignDTO[]>>("/api/admin/ad-campaigns", { status }),
  review: (id: string, action: "approve" | "changes" | "reject" | "mark-paid", note = "") => api.post<Envelope<AdCampaignDTO>>(`/api/admin/ad-campaigns/${id}`, { action, note }),
  adminPricing: () => api.get<Envelope<AdPricing>>("/api/admin/ad-pricing"),
  setPricing: (p: Partial<AdPricing>) => api.put<Envelope<AdPricing>>("/api/admin/ad-pricing", p),
};
