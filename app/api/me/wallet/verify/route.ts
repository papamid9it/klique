import { readJson, withApi } from "@/server/http/api";
import { verifyHypePurchase } from "@/server/services/wallet.service";
import { adVerifySchema } from "@/server/validators/schemas";

/** Back from Paystack: check the payment and add the Hype. */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => verifyHypePurchase(viewer, (await readJson(req, adVerifySchema)).reference));
