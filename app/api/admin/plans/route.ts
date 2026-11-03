import { readJson, withApi } from "@/server/http/api";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { getPlanConfig, setPlanConfig } from "@/server/services/subscriptions.service";
import { planConfigSchema } from "@/server/validators/schemas";

export const GET = withApi({ auth: "required" }, async ({ viewer }) => {
  assertAdmin(viewer);
  return getPlanConfig();
});

/** Change plan prices and limits. A new price applies to new subscriptions; people already paying keep theirs. */
export const PUT = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  const next = await setPlanConfig(await readJson(req, planConfigSchema));
  await logAction(viewer, "plans.config", "points", null, "Plans", `Lite ₦${next.prices.lite} · Pro ₦${next.prices.pro} · start ${next.create.free}/${next.create.lite}/${next.create.pro} · join ${next.join.free ?? "∞"}/${next.join.lite ?? "∞"}/${next.join.pro ?? "∞"}`, "/admin/plans");
  return next;
});
