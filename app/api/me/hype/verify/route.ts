import { readJson, withApi } from "@/server/http/api";
import { verifyTopup } from "@/server/services/gifts.service";
import { adVerifySchema } from "@/server/validators/schemas";

/** Back from Paystack: check the payment and add the Hype. */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => verifyTopup(viewer, (await readJson(req, adVerifySchema)).reference));
