import { readJson, withApi } from "@/server/http/api";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { getMoneyConfig, setMoneyConfig } from "@/server/services/money.service";
import { moneyConfigSchema } from "@/server/validators/schemas";

export const GET = withApi({ auth: "required" }, async ({ viewer }) => {
  assertAdmin(viewer);
  return getMoneyConfig();
});

/** Klique's fees on donations and contributions, and the smallest payout. Payments already made keep their fee. */
export const PUT = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  const next = await setMoneyConfig(await readJson(req, moneyConfigSchema));
  await logAction(viewer, "money.config", "points", null, "Fees", `donations ${next.donationFeePercent}% · contributions ${next.contributionFeePercent}% · min payout ₦${next.minPayout}`, "/admin/payouts?view=fees");
  return next;
});
