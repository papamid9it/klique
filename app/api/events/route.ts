import { bump } from "@/server/cache";
import { created, readJson, readQuery, withApi } from "@/server/http/api";
import { createEvent, listEvents } from "@/server/services/events.service";
import { eventCreateSchema, eventListQuery } from "@/server/validators/schemas";

export const GET = withApi({ auth: "optional" }, async ({ req, viewer }) => listEvents(viewer, readQuery(req, eventListQuery)));

export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => {
  const input = await readJson(req, eventCreateSchema);
  const event = await createEvent(viewer, input);
  await bump("public"); // new event: anonymous lists refresh straight away
  return created(event);
});
