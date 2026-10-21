import { readJson, withApi } from "@/server/http/api";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { adminAdjustPoints } from "@/server/services/points.service";
import { adminPointsAdjustSchema } from "@/server/validators/schemas";

/** Give (+) or take (−) someone's points. */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  const { who, amount, note } = await readJson(req, adminPointsAdjustSchema);
  const res = await adminAdjustPoints(viewer, who, amount, note);
  await logAction(viewer, amount > 0 ? "points.grant" : "points.revoke", "user", res.user.id, `@${res.user.handle}`, `${amount > 0 ? "+" : ""}${amount}${note ? ` · ${note}` : ""}`, `/admin/points?view=people&who=${res.user.handle}`);
  return res;
});
