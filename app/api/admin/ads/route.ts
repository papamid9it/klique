import { created, readJson, withApi } from "@/server/http/api";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { createAd, listAds } from "@/server/services/ads.service";
import { adInputSchema } from "@/server/validators/schemas";

export const GET = withApi({ auth: "required" }, async ({ viewer }) => {
  assertAdmin(viewer);
  return listAds();
});

export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  const ad = await createAd(viewer, await readJson(req, adInputSchema));
  await logAction(viewer, "ad.create", "ad", ad.id, ad.name, "", "/admin/ads");
  return created(ad);
});
