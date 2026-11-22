import { z } from "zod";
import { readQuery, withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { listFeedback } from "@/server/services/feedback.service";

const query = z.object({ done: z.enum(["0", "1"]).default("0") });

/** Admin → Feedback: what people sent from Help & feedback. */
export const GET = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  return listFeedback(readQuery(req, query).done === "1");
});
