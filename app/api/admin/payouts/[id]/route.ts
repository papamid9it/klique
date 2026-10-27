import { readJson, withApi } from "@/server/http/api";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { decidePayout } from "@/server/services/money.service";
import { payoutDecisionSchema } from "@/server/validators/schemas";

type P = { id: string };

/** Mark a payout paid (with the transfer reference) or turn it down (with a reason). */
export const POST = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  assertAdmin(viewer);
  const { decision, reference, note } = await readJson(req, payoutDecisionSchema);
  const res = await decidePayout(viewer, params.id, decision, { reference, note });
  await logAction(viewer, decision === "paid" ? "payout.paid" : "payout.rejected", "community", null, res.community?.name ?? "", `₦${res.amount.toLocaleString("en-NG")}${reference ? ` · ${reference}` : ""}${note ? ` · ${note}` : ""}`, "/admin/payouts");
  return res;
});
