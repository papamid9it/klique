import { readJson, withApi } from "@/server/http/api";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { getPointsConfig, setPointsConfig } from "@/server/services/points.service";
import { pointsConfigSchema } from "@/server/validators/schemas";

export const GET = withApi({ auth: "required" }, async ({ viewer }) => {
  assertAdmin(viewer);
  return getPointsConfig();
});

/** Change packs, unlock length and design prices. Unlocks already bought keep their end date. */
export const PUT = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  const next = await setPointsConfig(await readJson(req, pointsConfigSchema));
  await logAction(viewer, "points.config", "points", null, "Points prices", `${next.packs.map((p) => `${p.points}=₦${p.price}`).join(", ")} · ${next.unlockDays}d`, "/admin/points?view=prices");
  return next;
});
