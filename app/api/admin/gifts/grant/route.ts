import { readJson, withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { adminGrantHype } from "@/server/services/gifts.service";
import { giftGrantSchema } from "@/server/validators/schemas";

/** Give someone Hype (or take it back): for refunds and support. */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  const b = await readJson(req, giftGrantSchema);
  return adminGrantHype(viewer, b.userId, b.amount, b.note);
});
