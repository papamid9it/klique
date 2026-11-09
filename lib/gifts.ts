/**
 * Gifts, paid with Hype. Hype is back (Nov 2026) as a wallet used ONLY for gifts (no designs): 1 Hype = ₦10. It's
 * bought on the website with Paystack, or in the phone app with Apple or Google (consumable products `hype_<n>`),
 * and spent on gifts people send to posts, comments, board posts and board replies. The person who gets a gift
 * earns a share of its naira value (70% by default) as cash, paid out through Payouts after a hold. Klique keeps the
 * rest. Hype itself is never cash for the buyer: no refunds, no cashing out. Shared by the site, server and apps.
 *
 * The new balance lives in its own field (`User.giftHype`), never the old `User.hype`, so the one-off "Hype to Lite
 * days" migration (server/migrations/hype.ts) can never touch it.
 */

/** naira per Hype */
export const HYPE_NAIRA = 10;
/** the cheapest and dearest gift, naira */
export const GIFT_MIN_PRICE = 10;
export const GIFT_MAX_PRICE = 500_000;
/** the most someone can top up at once on the website, naira */
export const TOPUP_MAX = 500_000;
export const TOPUP_MIN = 100;
/** payouts are made on this day of each month */
export const PAYOUT_DAY = 3;

export type GiftTargetType = "post" | "comment" | "topic" | "reply";
export const GIFT_TARGET_TYPES: GiftTargetType[] = ["post", "comment", "topic", "reply"];
export const giftTargetKey = (t: { type: GiftTargetType; id: string }) => `${t.type}:${t.id}`;

/** A Hype pack in the phone app: its store product id and the Hype it gives (no custom amounts in the stores). */
export interface StoreHypePack {
  productId: string;
  hype: number;
  /** what the store charges, naira (set to match App Store Connect / Play Console; about 30% over the web price) */
  price: number;
}

export interface GiftConfig {
  /** gifts can be sent at all */
  enabled: boolean;
  /** the receiver's share of a gift's naira value, percent (Klique keeps the rest) */
  receiverPercent: number;
  /** days a gift's earnings wait before they can be paid out */
  holdDays: number;
  /** the smallest payout request, naira */
  minPayout: number;
  /** website top-up packs, naira (any amount up to TOPUP_MAX is also allowed) */
  webPacks: number[];
  /** phone app packs */
  storePacks: StoreHypePack[];
  /** what Apple and Google keep of an in-app purchase, percent (for the revenue report) */
  storeFeePercent: { apple: number; google: number };
}

export const DEFAULT_GIFT_CONFIG: GiftConfig = {
  enabled: true,
  receiverPercent: 70,
  holdDays: 7,
  minPayout: 1000,
  webPacks: [500, 1000, 5000, 10_000, 50_000],
  storePacks: [
    { productId: "hype_50", hype: 50, price: 650 },
    { productId: "hype_100", hype: 100, price: 1300 },
    { productId: "hype_500", hype: 500, price: 6500 },
    { productId: "hype_1000", hype: 1000, price: 13_000 },
    { productId: "hype_5000", hype: 5000, price: 65_000 },
  ],
  storeFeePercent: { apple: 15, google: 15 },
};

const int = (v: unknown, min: number, max: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback);

/** Stored settings merged over the defaults, anything odd dropped. */
export function giftConfigOf(stored: unknown): GiftConfig {
  const s = (stored && typeof stored === "object" ? stored : {}) as Partial<GiftConfig>;
  const d = DEFAULT_GIFT_CONFIG;
  const webPacks = Array.isArray(s.webPacks) ? [...new Set(s.webPacks.map((n) => int(n, TOPUP_MIN, TOPUP_MAX, 0)).filter((n) => n > 0))].sort((a, b) => a - b) : d.webPacks;
  const storePacks = Array.isArray(s.storePacks)
    ? s.storePacks.filter((p) => p && /^hype_\d{1,7}$/.test(p.productId) && p.hype > 0).map((p) => ({ productId: p.productId, hype: int(p.hype, 1, 1_000_000, 1), price: int(p.price, 1, 100_000_000, p.hype * HYPE_NAIRA) }))
    : d.storePacks;
  return {
    enabled: typeof s.enabled === "boolean" ? s.enabled : d.enabled,
    receiverPercent: int(s.receiverPercent, 0, 100, d.receiverPercent),
    holdDays: int(s.holdDays, 0, 90, d.holdDays),
    minPayout: int(s.minPayout, 100, 10_000_000, d.minPayout),
    webPacks: webPacks.length ? webPacks : d.webPacks,
    storePacks: storePacks.sort((a, b) => a.hype - b.hype),
    storeFeePercent: { apple: int(s.storeFeePercent?.apple, 0, 50, d.storeFeePercent.apple), google: int(s.storeFeePercent?.google, 0, 50, d.storeFeePercent.google) },
  };
}

/** A gift's price in Hype (its naira price ÷ ₦10, never below 1). */
export const giftHype = (priceNaira: number) => Math.max(1, Math.ceil(priceNaira / HYPE_NAIRA));
/** Hype for a naira top-up on the website. */
export const hypeForNaira = (naira: number) => Math.floor(naira / HYPE_NAIRA);
/** The receiver's share of a gift, naira (whole naira, rounded down). */
export const receiverShare = (priceNaira: number, percent: number) => Math.floor((priceNaira * percent) / 100);

/** The default catalogue, seeded once (Admin → Gifts edits it). `emoji` is the art until an animated picture is uploaded. */
export const DEFAULT_GIFTS: { slug: string; name: string; emoji: string; price: number }[] = [
  { slug: "heart", name: "Heart", emoji: "❤️", price: 10 },
  { slug: "rose", name: "Rose", emoji: "🌹", price: 50 },
  { slug: "fire", name: "Fire", emoji: "🔥", price: 100 },
  { slug: "clap", name: "Clap", emoji: "👏", price: 200 },
  { slug: "party", name: "Party", emoji: "🎉", price: 500 },
  { slug: "trophy", name: "Trophy", emoji: "🏆", price: 1000 },
  { slug: "crown", name: "Crown", emoji: "👑", price: 5000 },
  { slug: "diamond", name: "Diamond", emoji: "💎", price: 10_000 },
  { slug: "rocket", name: "Rocket", emoji: "🚀", price: 50_000 },
  { slug: "lion", name: "Lion", emoji: "🦁", price: 100_000 },
  { slug: "castle", name: "Castle", emoji: "🏰", price: 500_000 },
];

/**
 * The payout day for a request made at `at`: requests made by the end of a month are paid on the 3rd of the next
 * month (Lagos time is close enough to UTC for a calendar day; we use UTC dates throughout).
 */
export function payoutDayFor(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, PAYOUT_DAY));
}
/** "3 December" */
export const payoutDayLabel = (d: Date | string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
