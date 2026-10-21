import { readJson, withApi } from "@/server/http/api";
import { verifyPointPurchase } from "@/server/services/points.service";
import { adVerifySchema } from "@/server/validators/schemas";

/** Back from Paystack: check the payment and add the points. */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => verifyPointPurchase(viewer, (await readJson(req, adVerifySchema)).reference));
