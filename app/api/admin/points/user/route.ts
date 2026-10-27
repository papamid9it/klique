import { readQuery, withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { adminWalletUser } from "@/server/services/wallet.service";
import { adminWalletUserQuery } from "@/server/validators/schemas";

/** One person's Hype (balance, unlocks, history) and points (by @handle). */
export const GET = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  return adminWalletUser(readQuery(req, adminWalletUserQuery).who);
});
