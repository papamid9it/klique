import { readJson, withApi } from "@/server/http/api";
import { verifyStorePurchase } from "@/server/services/ad-campaigns.service";
import { adStoreVerifySchema } from "@/server/validators/schemas";

/** A purchase made in the phone app: check it with Apple or Google, and start the ad. */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => verifyStorePurchase(viewer, await readJson(req, adStoreVerifySchema)));
