import { created, readJson, withApi } from "@/server/http/api";
import { listMyCampaigns, submitCampaign } from "@/server/services/ad-campaigns.service";
import { adCampaignSchema } from "@/server/validators/schemas";

/** Your ads: every one you've sent, newest first. */
export const GET = withApi({ auth: "required" }, async ({ viewer }) => listMyCampaigns(viewer));

/** Send an ad for review. */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => created(await submitCampaign(viewer, await readJson(req, adCampaignSchema))));
