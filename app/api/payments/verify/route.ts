import { readJson, withApi } from "@/server/http/api";
import { verifyPayment } from "@/server/services/money.service";
import { payVerifySchema } from "@/server/validators/schemas";

/** Back from Paystack: check the payment with Paystack and count it. */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => verifyPayment(viewer, (await readJson(req, payVerifySchema)).reference));
