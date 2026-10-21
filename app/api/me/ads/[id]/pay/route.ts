import { withApi } from "@/server/http/api";
import { payCampaign } from "@/server/services/ad-campaigns.service";

/** Start a card payment for an approved ad (Paystack checkout). */
export const POST = withApi<{ id: string }, "required">({ auth: "required" }, async ({ params, viewer }) => payCampaign(viewer, params.id));
