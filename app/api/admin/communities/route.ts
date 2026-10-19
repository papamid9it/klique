import { readQuery, withApi } from "@/server/http/api";
import { assertAdmin, listAdminCommunities } from "@/server/services/admin.service";
import { adminCommunitiesQuery } from "@/server/validators/schemas";

export const GET = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  return listAdminCommunities(readQuery(req, adminCommunitiesQuery));
});
