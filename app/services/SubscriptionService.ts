import ApiClient from "@/app/ApiCore";
import type { PlanConfig } from "@/lib/plans";
import type { Envelope, SubscriptionDTO } from "@/lib/types";

const api = new ApiClient();

/** Your plan (Free, Lite, Pro) and paying for it on Paystack; the admin side of plans. */
export const SubscriptionService = {
  mine: () => api.get<Envelope<SubscriptionDTO>>("/api/me/subscription"),
  /** the plans on offer, for anyone (the pricing page) */
  plans: () => api.get<Envelope<{ config: PlanConfig; canBuy: boolean }>>("/api/plans"),
  checkout: (plan: "lite" | "pro") => api.post<Envelope<{ authorizationUrl: string; reference: string }>>("/api/me/subscription/checkout", { plan }),
  verify: (reference: string) => api.post<Envelope<{ paid: boolean; subscription: SubscriptionDTO }>>("/api/me/subscription/verify", { reference }),
  cancel: () => api.post<Envelope<SubscriptionDTO>>("/api/me/subscription/cancel"),

  adminConfig: () => api.get<Envelope<PlanConfig>>("/api/admin/plans"),
  setConfig: (c: Partial<PlanConfig>) => api.put<Envelope<PlanConfig>>("/api/admin/plans", c),
  grant: (who: string, plan: "lite" | "pro", days: number) => api.post<Envelope<{ until: string }>>("/api/admin/plans/grant", { who, plan, days }),
};
