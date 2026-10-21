import { readQuery, withApi } from "@/server/http/api";
import { adminListCampaigns } from "@/server/services/ad-campaigns.service";
import { assertAdmin } from "@/server/services/admin.service";
import { adCampaignListQuery } from "@/server/validators/schemas";

/** Ad requests: waiting for review, approved (waiting for payment), running, or all. */
export const GET = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  return adminListCampaigns(readQuery(req, adCampaignListQuery).status);
});
