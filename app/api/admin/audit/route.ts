import { readQuery, withApi } from "@/server/http/api";
import { assertAdmin, listAudit } from "@/server/services/admin.service";
import { adminAuditQuery } from "@/server/validators/schemas";

export const GET = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  return listAudit(readQuery(req, adminAuditQuery));
});
