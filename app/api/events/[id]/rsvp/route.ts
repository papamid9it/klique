import { readJson, withApi } from "@/server/http/api";
import { removeRsvp, setRsvp } from "@/server/services/events.service";
import { rsvpSchema } from "@/server/validators/schemas";

type P = { id: string };

export const POST = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { status } = await readJson(req, rsvpSchema);
  return setRsvp(viewer, params.id, status);
});

export const DELETE = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => removeRsvp(viewer, params.id));
