import { readJson, withApi } from "@/server/http/api";
import { startTopup } from "@/server/services/gifts.service";
import { giftTopupSchema } from "@/server/validators/schemas";

/** Top up Hype on the website: a Paystack checkout for a pack or any amount up to ₦500,000. */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => startTopup(viewer, await readJson(req, giftTopupSchema)));
