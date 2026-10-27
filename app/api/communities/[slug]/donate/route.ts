import { readJson, withApi } from "@/server/http/api";
import { startDonation } from "@/server/services/money.service";
import { donateSchema } from "@/server/validators/schemas";

type P = { slug: string };

/** Start a donation on Paystack (they've agreed donations can't be refunded). */
export const POST = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { buttonId, amount, message } = await readJson(req, donateSchema);
  return startDonation(viewer, params.slug, buttonId, { amount, message });
});
