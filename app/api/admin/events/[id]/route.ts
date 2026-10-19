import { readJson, readQuery, withApi } from "@/server/http/api";
import { adminDeleteEvent, assertAdmin, setEventCancelled } from "@/server/services/admin.service";
import { adminEventUpdateSchema, adminNoteSchema } from "@/server/validators/schemas";

/** Cancel or restore an event. */
export const PATCH = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  assertAdmin(viewer);
  const { cancelled, note } = await readJson(req, adminEventUpdateSchema);
  return setEventCancelled(viewer, params.id, cancelled, note);
});

export const DELETE = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  assertAdmin(viewer);
  const { note } = readQuery(req, adminNoteSchema);
  return adminDeleteEvent(viewer, params.id, note);
});
