import { readJson, withApi } from "@/server/http/api";
import { reviewEvent } from "@/server/services/events.service";
import { eventReviewSchema } from "@/server/validators/schemas";

type P = { id: string };

/** The space's owner or an admin approves a member's event, or turns it down with a reason. */
export const POST = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { decision, reason } = await readJson(req, eventReviewSchema);
  return reviewEvent(viewer, params.id, decision, reason);
});
