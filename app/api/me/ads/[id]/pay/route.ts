import { readJson, withApi } from "@/server/http/api";
import { payCampaign } from "@/server/services/ad-campaigns.service";
import { payWithSchema } from "@/server/validators/schemas";

/** Start a card payment for an approved ad (a Paystack, Flutterwave or OPay checkout; body `{ provider? }`). */
export const POST = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const body = await readJson(req, payWithSchema).catch(() => ({ provider: undefined }));
  return payCampaign(viewer, params.id, body.provider);
});
