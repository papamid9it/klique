import { created, readJson, withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { adminListGifts, adminSaveGift } from "@/server/services/gifts.service";
import { giftSaveSchema } from "@/server/validators/schemas";

/** Admin → Gifts: the whole catalogue (hidden ones too). */
export const GET = withApi({ auth: "required" }, async ({ viewer }) => {
  assertAdmin(viewer);
  return adminListGifts();
});

export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  return created(await adminSaveGift(await readJson(req, giftSaveSchema)));
});
