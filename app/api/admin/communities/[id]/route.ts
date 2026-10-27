import { readJson, readQuery, withApi } from "@/server/http/api";
import { adminCommunityFlags, adminDeleteCommunity, assertAdmin } from "@/server/services/admin.service";
import { adminCommunityFlagsSchema, adminNoteSchema } from "@/server/validators/schemas";

export const DELETE = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  assertAdmin(viewer);
  const { note } = readQuery(req, adminNoteSchema);
  return adminDeleteCommunity(viewer, params.id, note);
});

/** Take the 18+ or explicit flag off. */
export const PATCH = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  assertAdmin(viewer);
  return adminCommunityFlags(viewer, params.id, await readJson(req, adminCommunityFlagsSchema));
});
