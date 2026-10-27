import { readJson, withApi } from "@/server/http/api";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { getWalletConfig, setWalletConfig } from "@/server/services/wallet.service";
import { walletConfigSchema } from "@/server/validators/schemas";

export const GET = withApi({ auth: "required" }, async ({ viewer }) => {
  assertAdmin(viewer);
  return getWalletConfig();
});

/** Change packs, unlock length and design prices. Unlocks already bought keep their end date. */
export const PUT = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  const next = await setWalletConfig(await readJson(req, walletConfigSchema));
  await logAction(viewer, "hype.config", "points", null, "Hype prices", `${next.packs.map((p) => `${p.hype}=₦${p.price}`).join(", ")} · ${next.unlockDays}d`, "/admin/points?view=prices");
  return next;
});
