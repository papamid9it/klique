import { withApi } from "@/server/http/api";
import { getAdPricing } from "@/server/services/ad-campaigns.service";

/** What ads cost: per placement per day, times how far they reach. */
export const GET = withApi({ auth: "optional" }, async () => getAdPricing());
