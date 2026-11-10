/**
 * Gifts, paid with Hype. Hype is back (Nov 2026) as a wallet used ONLY for gifts (no designs): 1 Hype = ₦10. It's
 * bought on the website with Paystack, or in the phone app with Apple or Google (consumable products `hype_<n>`),
 * and spent on gifts people send to posts, comments, board posts and community chat messages (never DMs or klique chats). The person who gets a gift
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
  minPayout: 20_000,
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

/**
 * The gifts every new catalogue starts with, cheapest first. `art` is our own drawing in public/gifts: the .svg moves a
 * little (the tray and the send burst) and a still .png of it sits next to it (everywhere else, and in the phone app).
 * The emoji is only a text stand-in, for notifications.
 */
export const DEFAULT_GIFTS: { slug: string; name: string; emoji: string; price: number; art: string }[] = [
  { slug: "heart", name: "Heart", emoji: "❤️", price: 10, art: "/gifts/heart.svg" },
  { slug: "laughing", name: "Laughing", emoji: "😆", price: 20, art: "/gifts/laughing.svg" },
  { slug: "not-impressed", name: "Not impressed", emoji: "😑", price: 20, art: "/gifts/not-impressed.svg" },
  { slug: "holding-laughter", name: "Holding laughter", emoji: "🤭", price: 20, art: "/gifts/holding-laughter.svg" },
  { slug: "laugh-crying", name: "Laugh crying", emoji: "😂", price: 30, art: "/gifts/laugh-crying.svg" },
  { slug: "shy", name: "Shy", emoji: "☺️", price: 30, art: "/gifts/shy.svg" },
  { slug: "rose", name: "Rose", emoji: "🌹", price: 50, art: "/gifts/rose.svg" },
  { slug: "heart-eyes", name: "Heart eyes", emoji: "😍", price: 50, art: "/gifts/heart-eyes.svg" },
  { slug: "popcorn", name: "Popcorn", emoji: "🍿", price: 50, art: "/gifts/popcorn.svg" },
  { slug: "fire", name: "Fire", emoji: "🔥", price: 100, art: "/gifts/fire.svg" },
  { slug: "mind-blown", name: "Mind blown", emoji: "🤯", price: 100, art: "/gifts/mind-blown.svg" },
  { slug: "clap", name: "Clap", emoji: "👏", price: 200, art: "/gifts/clap.svg" },
  { slug: "jollof", name: "Jollof pot", emoji: "🍲", price: 200, art: "/gifts/jollof.svg" },
  { slug: "suya", name: "Suya", emoji: "🍢", price: 300, art: "/gifts/suya.svg" },
  { slug: "party", name: "Party", emoji: "🎉", price: 500, art: "/gifts/party.svg" },
  { slug: "trophy", name: "Trophy", emoji: "🏆", price: 1000, art: "/gifts/trophy.svg" },
  { slug: "golden-poop", name: "Golden poop", emoji: "💩", price: 1000, art: "/gifts/golden-poop.svg" },
  { slug: "talking-drum", name: "Talking drum", emoji: "🥁", price: 2000, art: "/gifts/talking-drum.svg" },
  { slug: "crown", name: "Crown", emoji: "👑", price: 5000, art: "/gifts/crown.svg" },
  { slug: "diamond", name: "Diamond", emoji: "💎", price: 10_000, art: "/gifts/diamond.svg" },
  { slug: "danfo", name: "Danfo", emoji: "🚐", price: 20_000, art: "/gifts/danfo.svg" },
  { slug: "diamonds", name: "Diamonds", emoji: "💎", price: 30_000, art: "/gifts/diamonds.svg" },
  { slug: "rocket", name: "Rocket", emoji: "🚀", price: 50_000, art: "/gifts/rocket.svg" },
  { slug: "lion", name: "Lion", emoji: "🦁", price: 100_000, art: "/gifts/lion.svg" },
  { slug: "castle", name: "Castle", emoji: "🏰", price: 500_000, art: "/gifts/castle.svg" },
];

/** Our own gift drawings: the still picture for a moving one (public/gifts/x.svg → x.png). Uploads pass through. */
export const giftArtStill = (url: string | null) => (url && /^\/gifts\/[\w-]+\.svg$/.test(url) ? url.replace(/\.svg$/, ".png") : url);

/**
 * The payout day for a request made at `at`: requests made by the end of a month are paid on the 3rd of the next
 * month (Lagos time is close enough to UTC for a calendar day; we use UTC dates throughout).
 */
export function payoutDayFor(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, PAYOUT_DAY));
}
/** "3 December" */
export const payoutDayLabel = (d: Date | string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

/**
 * How big the celebration is when you send a gift (the burst from the gift button): bigger gifts, a bigger moment.
 * Naira prices: under `medium` small, under `large` medium, from `large` up large.
 */
export const GIFT_BURST = { medium: 500, large: 10_000 } as const;
export type GiftBurstTier = "small" | "medium" | "large";
export const burstTier = (priceNaira: number): GiftBurstTier => (priceNaira >= GIFT_BURST.large ? "large" : priceNaira >= GIFT_BURST.medium ? "medium" : "small");
/** particles and length per tier (kept small: it must never slow anything down) */
export const BURST_SPEC: Record<GiftBurstTier, { particles: number; ms: number; scale: number }> = {
  small: { particles: 10, ms: 1200, scale: 2.4 },
  medium: { particles: 14, ms: 1400, scale: 3 },
  large: { particles: 18, ms: 1600, scale: 3.6 },
};
