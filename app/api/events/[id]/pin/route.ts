import { readJson, withApi } from "@/server/http/api";
import { setEventPin } from "@/server/services/events.service";
import { eventPinSchema } from "@/server/validators/schemas";

/** Pin or unpin an event on its community's list (its owner). */
export const POST = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => setEventPin(viewer, params.id, (await readJson(req, eventPinSchema)).on));
