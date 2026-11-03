import { readJson, withApi } from "@/server/http/api";
import { startCheckout } from "@/server/services/subscriptions.service";
import { planCheckoutSchema } from "@/server/validators/schemas";

/** Start paying for Lite or Pro: returns the Paystack checkout to send the browser to. */
export const POST = withApi<Record<string, never>, "required">({ auth: "required" }, async ({ req, viewer }) => startCheckout(viewer, (await readJson(req, planCheckoutSchema)).plan));
