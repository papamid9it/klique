import { readJson, withApi } from "@/server/http/api";
import { verifyCheckout } from "@/server/services/subscriptions.service";
import { planVerifySchema } from "@/server/validators/schemas";

/** Back from Paystack: check the payment and turn the plan on. */
export const POST = withApi<Record<string, never>, "required">({ auth: "required" }, async ({ req, viewer }) => verifyCheckout(viewer, (await readJson(req, planVerifySchema)).reference));
