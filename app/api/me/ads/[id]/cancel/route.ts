import { withApi } from "@/server/http/api";
import { cancelCampaign } from "@/server/services/ad-campaigns.service";

export const POST = withApi<{ id: string }, "required">({ auth: "required" }, async ({ params, viewer }) => cancelCampaign(viewer, params.id));
