import { readJson, withApi } from "@/server/http/api";
import { actOnReport, assertAdmin } from "@/server/services/admin.service";
import { adminReportActionSchema } from "@/server/validators/schemas";

export const POST = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  assertAdmin(viewer);
  const { action, note } = await readJson(req, adminReportActionSchema);
  return actOnReport(viewer, params.id, action, note);
});
