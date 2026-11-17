import type { PayProvider, PaymentsSettingDTO } from "@/lib/types";
import { AppSetting } from "../models/AppSetting";
import { ApiError } from "../http/errors";
import { flutterwaveConfig, opayConfig, paystackConfig } from "../env";

/*
 * Paying on the website, switched in Admin → System (no deploy): which payment companies are on (Paystack, OPay,
 * Flutterwave; one, several, or none), and donations to communities. None on: buying happens in the phone app
 * (Google Play and Apple). A company can only be switched on once Klique is connected to it (its code and keys).
 * Payments already made are always confirmed, whatever this says.
 */

const KEY = "webPayments";
type Saved = Record<PayProvider, boolean> & { donations: boolean; earnings: boolean };
const OFF: Saved = { paystack: false, opay: false, flutterwave: false, donations: false, earnings: false };

export const PROVIDER_LABEL: Record<PayProvider, string> = { paystack: "Paystack", opay: "OPay", flutterwave: "Flutterwave" };

/** Connected: its keys are set in the environment (.env / Vercel). Only then can it be switched on. */
export function providerConnected(p: PayProvider): boolean {
  if (p === "paystack") return !!paystackConfig();
  if (p === "flutterwave") return !!flutterwaveConfig();
  return !!opayConfig();
}

// read on nearly every page that sells something: kept for half a minute per server (a change shows within that)
let cache: { at: number; value: Saved } | null = null;

async function saved(): Promise<Saved> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  const row = await AppSetting.findById(KEY).lean<{ value?: Partial<Saved> }>();
  const value = { ...OFF, ...(row?.value ?? {}) };
  cache = { at: Date.now(), value };
  return value;
}

/** The companies people can pay with on the website right now (switched on and connected). */
export async function liveProviders(): Promise<PayProvider[]> {
  const s = await saved();
  return (Object.keys(PROVIDER_LABEL) as PayProvider[]).filter((p) => s[p] && providerConnected(p));
}

/** Can a new payment start on the website: at least one company is on and connected. */
export async function webPaymentsOn(): Promise<boolean> {
  return (await liveProviders()).length > 0;
}

/** The company a payment goes through: the one they picked, if it's live; else the first live one. */
export async function pickProvider(asked?: PayProvider | null): Promise<PayProvider> {
  const live = await liveProviders();
  if (!live.length) throw new ApiError(400, "Paying on the website isn't available right now. You can buy in the Klique app.");
  if (asked && live.includes(asked)) return asked;
  if (asked) throw new ApiError(400, `${PROVIDER_LABEL[asked]} isn't available right now. Pick another way to pay.`);
  return live[0];
}

/** Donations to communities and their payouts: their own switch, and only with web payments working. */
export async function donationsOn(): Promise<boolean> {
  return (await saved()).donations && (await webPaymentsOn());
}

/**
 * Earning from awards (recipients' 70%, paid to their bank): its own switch. Off: awards still send and show, but their
 * whole value is Klique's (as for anyone who doesn't qualify), and no new payouts can be asked for. Earnings already
 * made are kept. It doesn't depend on web payments: Hype is also bought in the phone app.
 */
export async function earningsOn(): Promise<boolean> {
  return (await saved()).earnings;
}

/** For Admin → System. */
/** Names (never values) of the settings a company still needs in Vercel, and whether its keys are test keys. */
const NEEDS: Record<PayProvider, string[]> = {
  paystack: ["PAYSTACK_SECRET_KEY"],
  flutterwave: ["FLUTTERWAVE_SECRET_KEY", "FLUTTERWAVE_WEBHOOK_HASH"],
  opay: ["OPAY_MERCHANT_ID", "OPAY_PUBLIC_KEY", "OPAY_SECRET_KEY"],
};
function envState(p: PayProvider): { missing: string[]; test: boolean } {
  const missing = NEEDS[p].filter((k) => !process.env[k]?.trim());
  const key = process.env[NEEDS[p][0] === "OPAY_MERCHANT_ID" ? "OPAY_SECRET_KEY" : NEEDS[p][0]]?.trim() ?? "";
  const test = p === "paystack" ? key.startsWith("sk_test") : p === "flutterwave" ? key.includes("_TEST") : /sandbox|testapi/i.test(process.env.OPAY_API_URL ?? "") || /test/i.test(key.slice(0, 12));
  return { missing, test: !!key && test };
}

export async function paymentsSetting(): Promise<PaymentsSettingDTO> {
  const s = await saved();
  return {
    providers: (Object.keys(PROVIDER_LABEL) as PayProvider[]).map((id) => ({ id, label: PROVIDER_LABEL[id], on: s[id], connected: providerConnected(id), ...envState(id) })),
    donations: s.donations,
    earnings: s.earnings,
    live: await liveProviders(),
  };
}

export async function setPaymentsSetting(patch: Partial<Saved>): Promise<PaymentsSettingDTO> {
  const now = await saved();
  const next: Saved = { ...now, ...patch };
  for (const p of Object.keys(PROVIDER_LABEL) as PayProvider[]) {
    if (next[p] && !now[p] && !providerConnected(p)) throw new ApiError(422, `${PROVIDER_LABEL[p]} isn't connected yet, so it can't be switched on.`);
  }
  await AppSetting.updateOne({ _id: KEY }, { $set: { value: next } }, { upsert: true });
  cache = { at: Date.now(), value: next };
  return paymentsSetting();
}
