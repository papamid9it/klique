import { withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { adminHypeOverview } from "@/server/services/wallet.service";

/** Hype sales and recent purchases. */
export const GET = withApi({ auth: "required" }, async ({ viewer }) => {
  assertAdmin(viewer);
  return adminHypeOverview();
});
