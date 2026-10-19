import ApiClient from "@/app/ApiCore";
import type { Envelope, PromoteOptionsDTO, PromotionDTO } from "@/lib/types";

const api = new ApiClient();

export const PromotionService = {
  options: (eventId: string) => api.get<Envelope<PromoteOptionsDTO>>(`/api/events/${eventId}/promote`),
  start: (eventId: string, days: number, reach: string) => api.post<Envelope<{ authorizationUrl: string; reference: string }>>(`/api/events/${eventId}/promote`, { days, reach }),
  verify: (reference: string) => api.post<Envelope<PromotionDTO>>("/api/promotions/verify", { reference }),
};
