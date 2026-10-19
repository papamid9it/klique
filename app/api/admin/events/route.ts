import { readQuery, withApi } from "@/server/http/api";
import { assertAdmin, listAdminEvents } from "@/server/services/admin.service";
import { adminEventsQuery } from "@/server/validators/schemas";

export const GET = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  return listAdminEvents(readQuery(req, adminEventsQuery));
});
