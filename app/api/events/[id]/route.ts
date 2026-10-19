import { readJson, withApi } from "@/server/http/api";
import { deleteEvent, getEvent, updateEvent } from "@/server/services/events.service";
import { eventUpdateSchema } from "@/server/validators/schemas";

type P = { id: string };

export const GET = withApi<P, "optional">({ auth: "optional" }, async ({ params, viewer }) => getEvent(viewer, params.id));

export const PATCH = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const patch = await readJson(req, eventUpdateSchema);
  return updateEvent(viewer, params.id, patch);
});

export const DELETE = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => deleteEvent(viewer, params.id));
