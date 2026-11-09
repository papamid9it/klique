import { readJson, withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { getGiftConfig, setGiftConfig } from "@/server/services/gifts.service";
import { giftConfigSchema } from "@/server/validators/schemas";

/** The receiver's share, the hold, the smallest payout, and the top-up packs. */
export const GET = withApi({ auth: "required" }, async ({ viewer }) => {
  assertAdmin(viewer);
  return getGiftConfig();
});

export const PATCH = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  return setGiftConfig(await readJson(req, giftConfigSchema));
});
