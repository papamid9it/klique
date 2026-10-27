import ApiClient from "@/app/ApiCore";
import type { PointsConfig } from "@/lib/points";
import type { WalletConfig } from "@/lib/wallet";
import type { AdminHypeOverviewDTO, AdminWalletUserDTO, Envelope, HypeTxnDTO, HypeWalletDTO, PointsProgressDTO } from "@/lib/types";

const api = new ApiClient();

/** Your Hype (balance, unlocking designs, buying packs) and your points, and the admin side of both. */
export const PointsService = {
  wallet: () => api.get<Envelope<HypeWalletDTO>>("/api/me/wallet"),
  history: (before: string) => api.get<Envelope<{ items: HypeTxnDTO[]; hasMore: boolean }>>("/api/me/wallet/history", { before }),
  unlock: (key: string, autoRenew?: boolean) => api.post<Envelope<HypeWalletDTO>>("/api/me/wallet/unlock", { key, autoRenew }),
  autoRenew: (key: string, autoRenew: boolean) => api.post<Envelope<HypeWalletDTO>>("/api/me/wallet/auto-renew", { key, autoRenew }),
  buy: (packId: string) => api.post<Envelope<{ authorizationUrl: string; reference: string }>>("/api/me/wallet/buy", { packId }),
  verify: (reference: string) => api.post<Envelope<{ paid: boolean; hype: number; wallet: HypeWalletDTO }>>("/api/me/wallet/verify", { reference }),
  points: () => api.get<Envelope<PointsProgressDTO>>("/api/me/points"),

  adminOverview: () => api.get<Envelope<AdminHypeOverviewDTO>>("/api/admin/wallet"),
  adminConfig: () => api.get<Envelope<WalletConfig>>("/api/admin/wallet/config"),
  setConfig: (c: Partial<WalletConfig>) => api.put<Envelope<WalletConfig>>("/api/admin/wallet/config", c),
  adminEarning: () => api.get<Envelope<PointsConfig>>("/api/admin/points/config"),
  setEarning: (c: Partial<PointsConfig>) => api.put<Envelope<PointsConfig>>("/api/admin/points/config", c),
  adminUser: (who: string) => api.get<Envelope<AdminWalletUserDTO>>("/api/admin/points/user", { who }),
  adjust: (who: string, currency: "hype" | "points", amount: number, note: string) => api.post<Envelope<AdminWalletUserDTO>>("/api/admin/points/adjust", { who, currency, amount, note }),
};
