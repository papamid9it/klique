import { readJson, withApi } from "@/server/http/api";
import { getAdPricing, setAdPricing } from "@/server/services/ad-campaigns.service";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { adPricingSchema } from "@/server/validators/schemas";

export const GET = withApi({ auth: "required" }, async ({ viewer }) => {
  assertAdmin(viewer);
  return getAdPricing();
});

/** Change ad prices. New requests use them; ones already sent keep their price. */
export const PUT = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  const next = await setAdPricing(await readJson(req, adPricingSchema));
  await logAction(viewer, "ad.pricing", "ad", null, "Ad prices", JSON.stringify(next.perDay), "/admin/ads?view=pricing");
  return next;
});
