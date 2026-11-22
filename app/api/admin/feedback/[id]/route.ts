import { z } from "zod";
import { readJson, withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { closeFeedback } from "@/server/services/feedback.service";

const body = z.object({ done: z.boolean() });

/** Mark one as dealt with (or open again). */
export const POST = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  assertAdmin(viewer);
  return closeFeedback(params.id, (await readJson(req, body)).done);
});
