import { readJson, withApi } from "@/server/http/api";
import { unlockStyle } from "@/server/services/points.service";
import { styleUnlockSchema } from "@/server/validators/schemas";
import type { StyleKey } from "@/lib/points";

/** Spend points on a frame or name style (or add another period to one you have). */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => {
  const { key, autoRenew } = await readJson(req, styleUnlockSchema);
  return unlockStyle(viewer, key as StyleKey, autoRenew);
});
