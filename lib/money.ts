/**
 * Money through Paystack: donations to a community and contributions toward its events. Klique keeps a fee (a
 * site admin sets it: 8% of donations and 10% of contributions by default) and the rest goes to the community,
 * paid out to its owner's bank on request. Donations can't be refunded; a contribution can be, minus the fee,
 * until the money is paid out.
 */
export interface MoneyConfig {
  /** Klique's share, percent */
  donationFeePercent: number;
  contributionFeePercent: number;
  /** smallest payout, naira */
  minPayout: number;
}

export const DEFAULT_MONEY_CONFIG: MoneyConfig = { donationFeePercent: 8, contributionFeePercent: 10, minPayout: 1000 };

/** smallest and largest single payment, naira */
export const MIN_PAYMENT = 100;
export const MAX_PAYMENT = 5_000_000;
/** quick amounts in the donate dialog */
export const DONATION_PRESETS = [1000, 2000, 5000, 10000];

const num = (v: unknown, min: number, max: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);

export function moneyConfigOf(stored: unknown): MoneyConfig {
  const s = (stored && typeof stored === "object" ? stored : {}) as Partial<MoneyConfig>;
  return {
    donationFeePercent: Math.round(num(s.donationFeePercent, 0, 50, DEFAULT_MONEY_CONFIG.donationFeePercent) * 10) / 10,
    contributionFeePercent: Math.round(num(s.contributionFeePercent, 0, 50, DEFAULT_MONEY_CONFIG.contributionFeePercent) * 10) / 10,
    minPayout: Math.round(num(s.minPayout, 100, 10_000_000, DEFAULT_MONEY_CONFIG.minPayout)),
  };
}

/** Klique's fee on an amount (whole naira, rounded up so the community never gets more than it should). */
export const feeOf = (amount: number, percent: number) => Math.ceil((amount * percent) / 100);
