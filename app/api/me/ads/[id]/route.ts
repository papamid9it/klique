import { readJson, withApi } from "@/server/http/api";
import { getMyCampaign, updateCampaign } from "@/server/services/ad-campaigns.service";
import { adCampaignSchema } from "@/server/validators/schemas";

type P = { id: string };

export const GET = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => getMyCampaign(viewer, params.id));

/** Change an ad that isn't paid yet; it goes back for review. */
export const PATCH = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => updateCampaign(viewer, params.id, await readJson(req, adCampaignSchema)));
