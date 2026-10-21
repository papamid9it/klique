import { readJson, withApi } from "@/server/http/api";
import { verifyCampaignPayment } from "@/server/services/ad-campaigns.service";
import { adVerifySchema } from "@/server/validators/schemas";

/** Back from Paystack: check the payment and start the ad. */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => verifyCampaignPayment(viewer, (await readJson(req, adVerifySchema)).reference));
