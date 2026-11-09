import { readJson, withApi } from "@/server/http/api";
import { storeTopup } from "@/server/services/gifts.service";
import { giftStoreTopupSchema } from "@/server/validators/schemas";

/** A Hype pack bought in the phone app: checked with Apple or Google, credited once per store transaction. */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => storeTopup(viewer, await readJson(req, giftStoreTopupSchema)));
