import { readJson, withApi } from "@/server/http/api";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { getRanksConfig, setRanksConfig } from "@/server/services/hype.service";
import { ranksConfigSchema } from "@/server/validators/schemas";

export const GET = withApi({ auth: "required" }, async ({ viewer }) => {
  assertAdmin(viewer);
  return getRanksConfig();
});

/** Rename ranks, move their Hype lines, change their points, what earns Hype and the daily cap. */
export const PUT = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  const next = await setRanksConfig(await readJson(req, ranksConfigSchema));
  await logAction(viewer, "ranks.config", "points", null, "Ranks", next.ranks.map((r) => `${r.name} ${r.hype}/${r.points}p`).join(", "), "/admin/points?view=ranks");
  return next;
});
