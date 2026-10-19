import { created, readJson, withApi } from "@/server/http/api";
import { createReport } from "@/server/services/safety.service";
import { reportSchema } from "@/server/validators/schemas";

export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => {
  const input = await readJson(req, reportSchema);
  return created(await createReport(viewer, input), "Thanks — we'll take a look.");
});
