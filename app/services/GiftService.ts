import ApiClient from "@/app/ApiCore";
import type { GiftConfig, GiftTargetType } from "@/lib/gifts";
import type { AdminGiftsReportDTO, AdminStuckTopupDTO, Envelope, GiftDTO, GiftEarningsDTO, GiftSentDTO, GiftSummaryDTO, GiftTrayDTO, GiftWalletDTO } from "@/lib/types";

const api = new ApiClient();

/** Gifts and the Hype that pays for them (lib/gifts). Same service for web, mobile and desktop. */
export const GiftService = {
  tray: () => api.get<Envelope<GiftTrayDTO>>("/api/gifts"),
  send: (input: { giftId: string; target: { type: GiftTargetType; id: string }; anonymous: boolean; clientKey: string }) => api.post<Envelope<{ balance: number; summary: GiftSummaryDTO }>>("/api/gifts/send", input),
  summaries: (keys: string[]) => api.get<Envelope<Record<string, GiftSummaryDTO>>>("/api/gifts/summary", { targets: keys.join(",") }),
  wallet: (before?: string) => api.get<Envelope<GiftWalletDTO>>("/api/me/hype", before ? { before } : undefined),
  topup: (amount: number) => api.post<Envelope<{ authorizationUrl: string; reference: string }>>("/api/me/hype/topup", { amount }),
  verify: (reference: string) => api.post<Envelope<{ paid: boolean; hype: number; balance: number }>>("/api/me/hype/verify", { reference }),
  earnings: (before?: string) => api.get<Envelope<GiftEarningsDTO>>("/api/me/earnings", before ? { before } : undefined),
  requestPayout: (input: { useSaved?: boolean; bankCode?: string; bankName?: string; accountNumber?: string; accountName?: string }) => api.post<Envelope<GiftEarningsDTO>>("/api/me/earnings/payout", input),
  sent: (before?: string) => api.get<Envelope<{ items: GiftSentDTO[]; hasMore: boolean }>>("/api/me/gifts/sent", before ? { before } : undefined),

  adminList: () => api.get<Envelope<GiftDTO[]>>("/api/admin/gifts"),
  adminSave: (input: { name: string; emoji: string; artUrl?: string | null; price: number; active: boolean; position?: number }, id?: string) => (id ? api.patch<Envelope<GiftDTO>>(`/api/admin/gifts/${id}`, input) : api.post<Envelope<GiftDTO>>("/api/admin/gifts", input)),
  adminRemove: (id: string) => api.delete<Envelope<{ deleted: boolean }>>(`/api/admin/gifts/${id}`),
  adminReorder: (ids: string[]) => api.post<Envelope<GiftDTO[]>>("/api/admin/gifts/reorder", { ids }),
  adminConfig: () => api.get<Envelope<GiftConfig>>("/api/admin/gifts/config"),
  adminSetConfig: (c: Partial<GiftConfig>) => api.patch<Envelope<GiftConfig>>("/api/admin/gifts/config", c),
  adminReport: (q: { from?: string; to?: string; group?: "day" | "month" }) => api.get<Envelope<AdminGiftsReportDTO>>("/api/admin/gifts/report", q),
  adminStuckTopups: () => api.get<Envelope<AdminStuckTopupDTO[]>>("/api/admin/gifts/topups"),
  adminRetryTopups: () => api.post<Envelope<{ checked: number; credited: number; stuck: AdminStuckTopupDTO[] }>>("/api/admin/gifts/topups", {}),
  adminGrant: (userId: string, amount: number, note: string) => api.post<Envelope<{ balance: number }>>("/api/admin/gifts/grant", { userId, amount, note }),
};
