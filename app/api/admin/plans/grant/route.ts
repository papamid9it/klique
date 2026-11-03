import { Types } from "mongoose";
import { readJson, withApi } from "@/server/http/api";
import { notFound } from "@/server/http/errors";
import { User } from "@/server/models/User";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { grantPlanDays } from "@/server/services/subscriptions.service";
import { planGrantSchema } from "@/server/validators/schemas";

/** Give someone days of Lite or Pro, free (by @handle or id). */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  const input = await readJson(req, planGrantSchema);
  const q = input.who.replace(/^@/, "").toLowerCase();
  const user = Types.ObjectId.isValid(q) ? await User.findById(q).select("_id handle").lean() : await User.findOne({ handle: q }).select("_id handle").lean();
  if (!user) throw notFound("We couldn't find that person.");
  const until = await grantPlanDays(user._id, input.plan, input.days, "grant");
  await logAction(viewer, "plans.grant", "user", user._id, `@${user.handle}`, `${input.days} days of ${input.plan}`, null);
  return { until: until.toISOString() };
});
