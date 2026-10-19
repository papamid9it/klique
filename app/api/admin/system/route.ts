import { withApi } from "@/server/http/api";
import { assertAdmin, systemStatus } from "@/server/services/admin.service";

export const GET = withApi({ auth: "required" }, async ({ viewer }) => {
  assertAdmin(viewer);
  return systemStatus();
});
