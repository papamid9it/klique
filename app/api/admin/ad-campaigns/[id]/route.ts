import { readJson, withApi } from "@/server/http/api";
import { reviewCampaign } from "@/server/services/ad-campaigns.service";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { adReviewSchema } from "@/server/validators/schemas";

/** Approve, ask for changes, reject (with a reason), or mark paid (a transfer) and start it. */
export const POST = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  assertAdmin(viewer);
  const { action, note } = await readJson(req, adReviewSchema);
  const out = await reviewCampaign(viewer, params.id, action, note);
  await logAction(viewer, `ad.${action}`, "ad", out.id, out.title, note, "/admin/ads?view=requests");
  return out;
});
