import { readQuery, withApi } from "@/server/http/api";
import { assertAdmin, searchUsers } from "@/server/services/admin.service";
import { adminUsersQuery } from "@/server/validators/schemas";

export const GET = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  return searchUsers(readQuery(req, adminUsersQuery).q);
});
