import { created, readJson, withApi } from "@/server/http/api";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { listEffects, saveEffect } from "@/server/services/effects.service";
import { profileEffectSchema } from "@/server/validators/schemas";

/** Every profile effect, hidden ones too. */
export const GET = withApi({ auth: "required" }, async ({ viewer }) => {
  assertAdmin(viewer);
  return listEffects(true);
});

/** Add a profile effect (its files are uploaded first). */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  const res = await saveEffect(await readJson(req, profileEffectSchema));
  await logAction(viewer, "effect.add", "points", null, res.name, `${res.price} Hype`, "/admin/effects");
  return created(res);
});
