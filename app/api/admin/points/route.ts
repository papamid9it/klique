import { withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { adminPointsOverview } from "@/server/services/points.service";

/** Points sales and recent purchases. */
export const GET = withApi({ auth: "required" }, async ({ viewer }) => {
  assertAdmin(viewer);
  return adminPointsOverview();
});
