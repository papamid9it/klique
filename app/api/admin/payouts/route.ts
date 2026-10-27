import { readQuery, withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { adminPayouts } from "@/server/services/money.service";
import { payoutListQuery } from "@/server/validators/schemas";

/** Payout requests (waiting first), with full bank details. */
export const GET = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  return adminPayouts(readQuery(req, payoutListQuery).status);
});
