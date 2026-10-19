import { readQuery, withApi } from "@/server/http/api";
import { adminDeleteCommunity, assertAdmin } from "@/server/services/admin.service";
import { adminNoteSchema } from "@/server/validators/schemas";

export const DELETE = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  assertAdmin(viewer);
  const { note } = readQuery(req, adminNoteSchema);
  return adminDeleteCommunity(viewer, params.id, note);
});
