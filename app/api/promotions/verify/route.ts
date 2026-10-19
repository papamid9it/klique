import { z } from "zod";
import { readJson, withApi } from "@/server/http/api";
import { verifyPromotion } from "@/server/services/promotions.service";

/** After Paystack sends the host back: check the payment with Paystack and switch the promotion on. */
export const POST = withApi({ auth: "required", limit: { name: "promote-verify", max: 30, windowMs: 60_000 } }, async ({ req, viewer }) => {
  const { reference } = await readJson(req, z.object({ reference: z.string().trim().min(6).max(100) }));
  return verifyPromotion(viewer, reference);
});
