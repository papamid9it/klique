import { readJson, withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { adminDeleteGift, adminSaveGift } from "@/server/services/gifts.service";
import { giftSaveSchema } from "@/server/validators/schemas";

type P = { id: string };

export const PATCH = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  assertAdmin(viewer);
  return adminSaveGift(await readJson(req, giftSaveSchema), params.id);
});

export const DELETE = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => {
  assertAdmin(viewer);
  return adminDeleteGift(params.id);
});
