import { readQuery, withApi } from "@/server/http/api";
import { assertAdmin, listReports } from "@/server/services/admin.service";
import { adminReportsQuery } from "@/server/validators/schemas";

export const GET = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  const { status, page } = readQuery(req, adminReportsQuery);
  return listReports(status, page);
});
