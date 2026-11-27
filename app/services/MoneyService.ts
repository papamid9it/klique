import ApiClient from "@/app/ApiCore";
import type { MoneyConfig } from "@/lib/money";
import type { CommunityMoneyDTO, Envelope, PaymentDTO, PayoutDTO } from "@/lib/types";

const api = new ApiClient();
type Checkout = Envelope<{ authorizationUrl: string; reference: string }>;

/** Event contributions, refunds and payouts (lib/money), and the admin side. */
export const MoneyService = {
  contribute: (eventId: string, quantity: number) => api.post<Checkout>(`/api/events/${eventId}/contribute`, { quantity, agree: true }),
  contributions: (eventId: string) => api.get<Envelope<PaymentDTO[]>>(`/api/events/${eventId}/contributions`),
  refund: (paymentId: string) => api.post<Envelope<PaymentDTO>>(`/api/payments/${paymentId}/refund`),
  verify: (reference: string) => api.post<Envelope<{ paid: boolean; kind: "donation" | "contribution"; amount: number }>>("/api/payments/verify", { reference }),
  money: (slug: string) => api.get<Envelope<CommunityMoneyDTO>>(`/api/communities/${slug}/money`),
  banks: () => api.get<Envelope<{ code: string; name: string }[]>>("/api/banks"),
  requestPayout: (slug: string, input: { useSaved?: boolean; bankCode?: string; bankName?: string; accountNumber?: string; accountName?: string }) => api.post<Envelope<CommunityMoneyDTO>>(`/api/communities/${slug}/payouts`, input),

  adminPayouts: (status: "requested" | "paid" | "rejected" | "all") => api.get<Envelope<PayoutDTO[]>>("/api/admin/payouts", { status }),
  decidePayout: (id: string, decision: "paid" | "rejected", input: { reference?: string; note?: string }) => api.post<Envelope<PayoutDTO>>(`/api/admin/payouts/${id}`, { decision, ...input }),
  config: () => api.get<Envelope<MoneyConfig>>("/api/admin/money/config"),
  setConfig: (c: Partial<MoneyConfig>) => api.put<Envelope<MoneyConfig>>("/api/admin/money/config", c),
};
