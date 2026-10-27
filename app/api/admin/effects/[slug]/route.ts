import { readJson, withApi } from "@/server/http/api";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { deleteEffect, saveEffect } from "@/server/services/effects.service";
import { profileEffectSchema } from "@/server/validators/schemas";

type P = { slug: string };

export const PATCH = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  assertAdmin(viewer);
  const res = await saveEffect(await readJson(req, profileEffectSchema), params.slug);
  await logAction(viewer, "effect.edit", "points", null, res.name, `${res.price} Hype${res.active ? "" : " · hidden"}`, "/admin/effects");
  return res;
});

export const DELETE = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => {
  assertAdmin(viewer);
  const res = await deleteEffect(params.slug);
  await logAction(viewer, "effect.remove", "points", null, params.slug, "", "/admin/effects");
  return res;
});
