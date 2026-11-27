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
  /** causes: Klique's share of what's given, percent */
  causeFeePercent: number;
  /** causes: what 1 Hype given is worth to the community, naira (before Klique's share) */
  causeNairaPerHype: number;
  /** causes open for a community with at least this many members… */
  causeMinMembers: number;
  /** …that's at least this many days old */
  causeMinDays: number;
}

export const DEFAULT_MONEY_CONFIG: MoneyConfig = { donationFeePercent: 8, contributionFeePercent: 10, minPayout: 1000, causeFeePercent: 20, causeNairaPerHype: 10, causeMinMembers: 50, causeMinDays: 30 };

/** a community can have up to this many causes running, and one gift to a cause is at most this much Hype */
export const MAX_CAUSES = 3;
/** the most Hype given to a cause at once: the biggest Hype pack in the stores (40,000), so one purchase always covers it */
export const MAX_CAUSE_GIFT = 40_000;
/** quick amounts in the give popup, Hype */
export const CAUSE_PRESETS = [50, 250, 1000, 5000];

/** smallest and largest single payment, naira */
export const MIN_PAYMENT = 100;
export const MAX_PAYMENT = 5_000_000;

const num = (v: unknown, min: number, max: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);

export function moneyConfigOf(stored: unknown): MoneyConfig {
  const s = (stored && typeof stored === "object" ? stored : {}) as Partial<MoneyConfig>;
  return {
    donationFeePercent: Math.round(num(s.donationFeePercent, 0, 50, DEFAULT_MONEY_CONFIG.donationFeePercent) * 10) / 10,
    contributionFeePercent: Math.round(num(s.contributionFeePercent, 0, 50, DEFAULT_MONEY_CONFIG.contributionFeePercent) * 10) / 10,
    minPayout: Math.round(num(s.minPayout, 100, 10_000_000, DEFAULT_MONEY_CONFIG.minPayout)),
    causeFeePercent: Math.round(num(s.causeFeePercent, 0, 90, DEFAULT_MONEY_CONFIG.causeFeePercent) * 10) / 10,
    causeNairaPerHype: Math.round(num(s.causeNairaPerHype, 0.01, 10_000, DEFAULT_MONEY_CONFIG.causeNairaPerHype) * 100) / 100,
    causeMinMembers: Math.round(num(s.causeMinMembers, 0, 1_000_000, DEFAULT_MONEY_CONFIG.causeMinMembers)),
    causeMinDays: Math.round(num(s.causeMinDays, 0, 3650, DEFAULT_MONEY_CONFIG.causeMinDays)),
  };
}

/** Klique's fee on an amount (whole naira, rounded up so the community never gets more than it should). */
export const feeOf = (amount: number, percent: number) => Math.ceil((amount * percent) / 100);
