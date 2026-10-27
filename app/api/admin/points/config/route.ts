import { readJson, withApi } from "@/server/http/api";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { getPointsConfig, setPointsConfig } from "@/server/services/points.service";
import { pointsEarningSchema } from "@/server/validators/schemas";

export const GET = withApi({ auth: "required" }, async ({ viewer }) => {
  assertAdmin(viewer);
  return getPointsConfig();
});

/** What each action earns in points, and each one's daily cap. */
export const PUT = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  const next = await setPointsConfig(await readJson(req, pointsEarningSchema));
  await logAction(viewer, "points.config", "points", null, "Points earning", Object.entries(next.actions).map(([k, v]) => `${k} ${v}/${next.caps[k as keyof typeof next.caps]}`).join(", "), "/admin/points?view=earning");
  return next;
});
