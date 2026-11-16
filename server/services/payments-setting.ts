import type { PayProvider, PaymentsSettingDTO } from "@/lib/types";
import { AppSetting } from "../models/AppSetting";
import { ApiError } from "../http/errors";
import { paystackConfig } from "../env";

/*
 * Paying on the website, switched in Admin → System (no deploy): which payment companies are on (Paystack, OPay,
 * Flutterwave; one, several, or none), and donations to communities. None on: buying happens in the phone app
 * (Google Play and Apple). A company can only be switched on once Klique is connected to it (its code and keys).
 * Payments already made are always confirmed, whatever this says.
 */

const KEY = "webPayments";
type Saved = Record<PayProvider, boolean> & { donations: boolean };
const OFF: Saved = { paystack: false, opay: false, flutterwave: false, donations: false };

export const PROVIDER_LABEL: Record<PayProvider, string> = { paystack: "Paystack", opay: "OPay", flutterwave: "Flutterwave" };

/** Connected: Klique has the code for it and its keys are set. OPay and Flutterwave aren't built yet. */
export function providerConnected(p: PayProvider): boolean {
  if (p === "paystack") return !!paystackConfig();
  return false;
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

/**
 * Can a new payment start on the website? For now the checkout code is Paystack's, so it's Paystack being live. When
 * OPay or Flutterwave are connected, their checkouts plug in here too (and people choose between those that are on).
 */
export async function webPaymentsOn(): Promise<boolean> {
  return (await liveProviders()).includes("paystack");
}

/** Donations to communities and their payouts: their own switch, and only with web payments working. */
export async function donationsOn(): Promise<boolean> {
  return (await saved()).donations && (await webPaymentsOn());
}

/** For Admin → System. */
export async function paymentsSetting(): Promise<PaymentsSettingDTO> {
  const s = await saved();
  return {
    providers: (Object.keys(PROVIDER_LABEL) as PayProvider[]).map((id) => ({ id, label: PROVIDER_LABEL[id], on: s[id], connected: providerConnected(id) })),
    donations: s.donations,
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
