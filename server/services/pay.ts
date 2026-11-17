import { createHmac } from "node:crypto";
import type { PayProvider } from "@/lib/types";
import { appUrl, flutterwaveConfig, opayConfig } from "../env";
import { ApiError } from "../http/errors";
import { paystack } from "./promotions.service";

/*
 * Paying on the website through Flutterwave or OPay (Paystack keeps its own calls, which also handle its monthly
 * plans). Each answer is turned into Paystack's shape, { status: "success", amount in kobo, currency }, so the code that
 * gives people what they paid for (Hype, a plan, an ad) is the same whichever company took the money.
 *
 * A payment is never taken on trust: the redirect back and the webhooks only say "look at this one", and Klique asks
 * the company's own server whether it was paid, in naira, and how much.
 */

export type Charged = { status: string; amount: number; currency: string; paid_at?: string };

/** What a checkout needs: our reference, naira, who pays, and a line on what it's for. */
export type ChargeInput = { reference: string; amountNaira: number; email: string; name: string; title: string };

/**
 * Where people come back to: /api/pay/back, which sends them on to the right page (Hype, Plan or Ads) by the
 * reference. Flutterwave adds "?status=…&tx_ref=…" to whatever link it's given, so that link has no "?" of its own.
 */
export function payBackPath(reference: string): string | null {
  if (!/^(khy|ksb|kad)_[a-f0-9]{18}$/.test(reference)) return null;
  if (reference.startsWith("khy_")) return `/settings?tab=hype&hype_ref=${reference}`;
  if (reference.startsWith("ksb_")) return `/settings?tab=plan&reference=${reference}`;
  return `/ads?reference=${reference}`;
}

/** Open a checkout with Flutterwave or OPay; the browser goes to the returned link. */
export async function startCharge(provider: Exclude<PayProvider, "paystack">, c: ChargeInput): Promise<string> {
  return provider === "flutterwave" ? flutterwaveStart(c) : opayStart(c);
}

/** Ask the company that took it whether a payment went through. Unknown or not paid yet: status "pending". */
export async function checkCharge(provider: PayProvider, reference: string): Promise<Charged> {
  if (provider === "paystack") return paystack<Charged>(`/transaction/verify/${encodeURIComponent(reference)}`);
  return provider === "flutterwave" ? flutterwaveCheck(reference) : opayCheck(reference);
}

/* ------------------------------ Flutterwave ------------------------------ */

function flw() {
  const cfg = flutterwaveConfig();
  if (!cfg) throw new ApiError(503, "Flutterwave isn't set up.");
  return cfg;
}

async function flutterwaveStart(c: ChargeInput): Promise<string> {
  const cfg = flw();
  const res = await fetch(`${cfg.baseUrl}/v3/payments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      tx_ref: c.reference,
      amount: c.amountNaira,
      currency: "NGN",
      redirect_url: `${appUrl()}/api/pay/back`,
      customer: { email: c.email, name: c.name },
      customizations: { title: "Klique", description: c.title },
    }),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => null)) as { status?: string; message?: string; data?: { link?: string } } | null;
  if (!res.ok || j?.status !== "success" || !j.data?.link) {
    console.warn("[pay] Flutterwave checkout failed", res.status, j?.message);
    throw new ApiError(502, "Flutterwave couldn't start the payment. Try again, or pick another way to pay.");
  }
  return j.data.link;
}

async function flutterwaveCheck(reference: string): Promise<Charged> {
  const cfg = flw();
  const res = await fetch(`${cfg.baseUrl}/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${cfg.secretKey}` }, cache: "no-store" });
  const j = (await res.json().catch(() => null)) as { status?: string; message?: string; data?: { status?: string; amount?: number; currency?: string; tx_ref?: string; created_at?: string } } | null;
  // not found (yet): not paid
  if (!res.ok || j?.status !== "success" || !j.data) return { status: "pending", amount: 0, currency: "NGN" };
  const d = j.data;
  if (d.tx_ref && d.tx_ref !== reference) return { status: "failed", amount: 0, currency: "NGN" };
  return { status: d.status === "successful" ? "success" : d.status === "failed" ? "failed" : "pending", amount: Math.round((d.amount ?? 0) * 100), currency: d.currency ?? "", paid_at: d.created_at };
}

/** A Flutterwave webhook is theirs when it carries the secret hash typed in their dashboard. */
export function flutterwaveWebhookOk(header: string | null): boolean {
  const cfg = flutterwaveConfig();
  return !!cfg?.webhookHash && !!header && header === cfg.webhookHash;
}

/* --------------------------------- OPay --------------------------------- */

function op() {
  const cfg = opayConfig();
  if (!cfg) throw new ApiError(503, "OPay isn't set up.");
  return cfg;
}

async function opayStart(c: ChargeInput): Promise<string> {
  const cfg = op();
  const res = await fetch(`${cfg.baseUrl}/api/v1/international/cashier/create`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.publicKey}`, MerchantId: cfg.merchantId, "Content-Type": "application/json" },
    body: JSON.stringify({
      country: "NG",
      reference: c.reference,
      // kobo
      amount: { total: Math.round(c.amountNaira * 100), currency: "NGN" },
      returnUrl: `${appUrl()}/api/pay/back?reference=${c.reference}`,
      cancelUrl: `${appUrl()}/api/pay/back?reference=${c.reference}`,
      callbackUrl: `${appUrl()}/api/webhooks/opay`,
      expireAt: 30,
      userInfo: { userEmail: c.email, userName: c.name },
      product: { name: "Klique", description: c.title },
    }),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => null)) as { code?: string; message?: string; data?: { cashierUrl?: string } } | null;
  if (!res.ok || !j?.data?.cashierUrl) {
    console.warn("[pay] OPay checkout failed", res.status, j?.code, j?.message);
    throw new ApiError(502, "OPay couldn't start the payment. Try again, or pick another way to pay.");
  }
  return j.data.cashierUrl;
}

async function opayCheck(reference: string): Promise<Charged> {
  const cfg = op();
  const body = JSON.stringify({ reference, country: "NG" });
  // the status call is signed: HMAC-SHA512 of the exact JSON sent, with the secret key, in hex
  const signature = createHmac("sha512", cfg.secretKey).update(body).digest("hex");
  const res = await fetch(`${cfg.baseUrl}/api/v1/international/cashier/status`, {
    method: "POST",
    headers: { Authorization: `Bearer ${signature}`, MerchantId: cfg.merchantId, "Content-Type": "application/json" },
    body,
    cache: "no-store",
  });
  const j = (await res.json().catch(() => null)) as { code?: string; message?: string; data?: { reference?: string; status?: string; amount?: { total?: number; currency?: string } } } | null;
  if (!res.ok || !j?.data) return { status: "pending", amount: 0, currency: "NGN" };
  const d = j.data;
  if (d.reference && d.reference !== reference) return { status: "failed", amount: 0, currency: "NGN" };
  return { status: d.status === "SUCCESS" ? "success" : d.status === "FAIL" || d.status === "CLOSE" ? "failed" : "pending", amount: d.amount?.total ?? 0, currency: d.amount?.currency ?? "" };
}
