import { readJson, withApi } from "@/server/http/api";
import { requestGiftPayout } from "@/server/services/gifts.service";
import { payoutRequestSchema } from "@/server/validators/schemas";

/** Ask for your available gift earnings to be paid (on the 3rd of next month). */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => requestGiftPayout(viewer, await readJson(req, payoutRequestSchema)));
