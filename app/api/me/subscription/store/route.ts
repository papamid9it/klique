import { readJson, withApi } from "@/server/http/api";
import { verifyPlanStorePurchase } from "@/server/services/subscriptions.service";
import { adStoreVerifySchema } from "@/server/validators/schemas";

/** A Lite or Pro purchase made in the phone app. Only what the store itself says counts. */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => verifyPlanStorePurchase(viewer, await readJson(req, adStoreVerifySchema)));
