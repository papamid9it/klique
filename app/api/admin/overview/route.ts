import { withApi } from "@/server/http/api";
import { adminOverview, assertAdmin } from "@/server/services/admin.service";

export const GET = withApi({ auth: "required" }, async ({ viewer }) => {
  assertAdmin(viewer);
  return adminOverview();
});
