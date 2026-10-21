import ApiClient from "@/app/ApiCore";
import type { PointsConfig } from "@/lib/points";
import type { AdminPointsOverviewDTO, AdminPointsUserDTO, Envelope, PointTxnDTO, PointsWalletDTO } from "@/lib/types";

const api = new ApiClient();

/** Your points (balance, unlocking designs, buying packs), and the admin side. */
export const PointsService = {
  wallet: () => api.get<Envelope<PointsWalletDTO>>("/api/me/points"),
  history: (before: string) => api.get<Envelope<{ items: PointTxnDTO[]; hasMore: boolean }>>("/api/me/points/history", { before }),
  unlock: (key: string, autoRenew?: boolean) => api.post<Envelope<PointsWalletDTO>>("/api/me/points/unlock", { key, autoRenew }),
  autoRenew: (key: string, autoRenew: boolean) => api.post<Envelope<PointsWalletDTO>>("/api/me/points/auto-renew", { key, autoRenew }),
  buy: (packId: string) => api.post<Envelope<{ authorizationUrl: string; reference: string }>>("/api/me/points/buy", { packId }),
  verify: (reference: string) => api.post<Envelope<{ paid: boolean; points: number; wallet: PointsWalletDTO }>>("/api/me/points/verify", { reference }),

  adminOverview: () => api.get<Envelope<AdminPointsOverviewDTO>>("/api/admin/points"),
  adminConfig: () => api.get<Envelope<PointsConfig>>("/api/admin/points/config"),
  setConfig: (c: Partial<PointsConfig>) => api.put<Envelope<PointsConfig>>("/api/admin/points/config", c),
  adminUser: (who: string) => api.get<Envelope<AdminPointsUserDTO>>("/api/admin/points/user", { who }),
  adjust: (who: string, amount: number, note: string) => api.post<Envelope<AdminPointsUserDTO>>("/api/admin/points/adjust", { who, amount, note }),
};
