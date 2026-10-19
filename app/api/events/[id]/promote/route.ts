import { z } from "zod";
import { created, readJson, withApi } from "@/server/http/api";
import { promoteOptions, startPromotion } from "@/server/services/promotions.service";

/** Prices, reach options and past promotions for the host's event. */
export const GET = withApi<{ id: string }, "required">({ auth: "required" }, async ({ params, viewer }) => promoteOptions(viewer, params.id));

/** Start a Paystack checkout for a promotion. */
export const POST = withApi<{ id: string }, "required">({ auth: "required", limit: { name: "promote", max: 10, windowMs: 10 * 60_000 } }, async ({ req, params, viewer }) => {
  const input = await readJson(req, z.object({ days: z.number().int(), reach: z.string().max(80) }));
  return created(await startPromotion(viewer, params.id, input));
});
