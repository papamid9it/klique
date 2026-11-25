import { readJson, withApi } from "@/server/http/api";
import { adminCommunityStanding, assertAdmin } from "@/server/services/admin.service";
import { adminCommunityStandingSchema } from "@/server/validators/schemas";

/** Warn a community's owner, restrict or suspend it, or lift it (site admins; logged). */
export const POST = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  assertAdmin(viewer);
  return adminCommunityStanding(viewer, params.id, await readJson(req, adminCommunityStandingSchema));
});
