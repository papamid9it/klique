import { readJson, withApi } from "@/server/http/api";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { deleteAd, setAdStatus, updateAd } from "@/server/services/ads.service";
import { adInputSchema, adStatusSchema } from "@/server/validators/schemas";

/** Edit an ad (full form) or just pause / resume it ({ status }). */
export const PATCH = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  assertAdmin(viewer);
  const raw = (await req.clone().json().catch(() => ({}))) as Record<string, unknown>;
  if (Object.keys(raw).length === 1 && "status" in raw) {
    const { status } = await readJson(req, adStatusSchema);
    const ad = await setAdStatus(params.id, status);
    await logAction(viewer, status === "paused" ? "ad.pause" : "ad.resume", "ad", ad.id, ad.name, "", "/admin/ads");
    return ad;
  }
  const ad = await updateAd(params.id, await readJson(req, adInputSchema));
  await logAction(viewer, "ad.update", "ad", ad.id, ad.name, "", "/admin/ads");
  return ad;
});

export const DELETE = withApi<{ id: string }, "required">({ auth: "required" }, async ({ params, viewer }) => {
  assertAdmin(viewer);
  const out = await deleteAd(params.id);
  await logAction(viewer, "ad.delete", "ad", params.id, out.name);
  return { deleted: true };
});
