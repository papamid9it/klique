import { readJson, withApi } from "@/server/http/api";
import { startContribution } from "@/server/services/money.service";
import { contributeSchema } from "@/server/validators/schemas";

type P = { id: string };

/** Start chipping in toward an event on Paystack (they've read how refunds work). */
export const POST = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => startContribution(viewer, params.id, (await readJson(req, contributeSchema)).quantity));
