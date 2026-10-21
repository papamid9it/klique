import { readQuery, withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { adminPointsUser } from "@/server/services/points.service";
import { adminPointsUserQuery } from "@/server/validators/schemas";

/** One person's balance, unlocks and history (by @handle). */
export const GET = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  return adminPointsUser(readQuery(req, adminPointsUserQuery).who);
});
