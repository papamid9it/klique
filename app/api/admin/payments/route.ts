import { z } from "zod";
import { readJson, withApi } from "@/server/http/api";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { paymentsSetting, setPaymentsSetting } from "@/server/services/payments-setting";

export const GET = withApi({ auth: "required" }, async ({ viewer }) => {
  assertAdmin(viewer);
  return paymentsSetting();
});

/** Switch payment companies (Paystack, OPay, Flutterwave) and donations on or off for the website. */
export const PUT = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  const patch = await readJson(req, z.object({ paystack: z.boolean().optional(), opay: z.boolean().optional(), flutterwave: z.boolean().optional(), donations: z.boolean().optional(), earnings: z.boolean().optional() }));
  const next = await setPaymentsSetting(patch);
  const what = Object.entries(patch).map(([k, v]) => `${k} ${v ? "on" : "off"}`).join(", ");
  await logAction(viewer, "payments.switch", "points", null, "Payments", what, "/admin/system");
  return next;
});
