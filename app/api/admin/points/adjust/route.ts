import { Types } from "mongoose";
import { readJson, withApi } from "@/server/http/api";
import { conflict } from "@/server/http/errors";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { adjustPoints } from "@/server/services/points.service";
import { adminAdjustHype, adminWalletUser } from "@/server/services/wallet.service";
import { adminAdjustSchema } from "@/server/validators/schemas";

/** Give (+) or take (−) someone's Hype or points. */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  const { who, currency, amount, note } = await readJson(req, adminAdjustSchema);
  let res;
  if (currency === "hype") res = await adminAdjustHype(viewer, who, amount, note);
  else {
    const before = await adminWalletUser(who);
    if ((await adjustPoints(new Types.ObjectId(before.user.id), amount)) === null) throw conflict(`@${before.user.handle} only has ${before.points} points.`);
    res = await adminWalletUser(before.user.id);
  }
  const unit = currency === "hype" ? "Hype" : "points";
  await logAction(viewer, `${currency}.${amount > 0 ? "grant" : "revoke"}`, "user", res.user.id, `@${res.user.handle}`, `${amount > 0 ? "+" : ""}${amount} ${unit}${note ? ` · ${note}` : ""}`, `/admin/points?view=people&who=${res.user.handle}`);
  return res;
});
