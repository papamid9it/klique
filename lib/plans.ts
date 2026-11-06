import type { StyleKind } from "./wallet";

/**
 * Plans (Nov 2026, replacing bought Hype): Free, Lite and Pro, paid monthly on Paystack.
 *  - kliques: how many you may start each calendar month, and how many you may be in at the same time
 *    (hosting doesn't count towards that; waiting requests do). Site admins have no limits.
 *  - profile media: how many photos and short videos you can have in your gallery (any mix). After a paid plan
 *    ends nothing is deleted or hidden; you can't add or replace until you're back within your plan's slots.
 *  - a Lite or Pro badge by your name, and Pro hosts' kliques are nudged up a little in "Kliques for you".
 *  - (profile designs, the animated styles, are switched off for now: PROFILE_DESIGNS_ENABLED. When they're on,
 *    Lite unlocks frames and name effects, Pro every style.)
 * Prices and limits are a site admin's setting (Admin → Plans); these are the defaults.
 */

export type PlanId = "free" | "lite" | "pro";
export type PaidPlan = Exclude<PlanId, "free">;
export const PAID_PLANS: PaidPlan[] = ["lite", "pro"];

export interface PlanConfig {
  /** naira a month */
  prices: Record<PaidPlan, number>;
  /** kliques you may start in a calendar month (Lagos time) */
  create: Record<PlanId, number>;
  /** kliques you may be in at once (not counting ones you host); null: no limit */
  join: Record<PlanId, number | null>;
  /** photo or video slots in your gallery (any mix of the two) */
  mediaSlots: Record<PlanId, number>;
  /** communities you may own (create), in total */
  communitiesCreate: Record<PlanId, number>;
  /** communities you may be a member of (Klique HQ doesn't count) */
  communitiesJoin: Record<PlanId, number>;
  /** bots (channel webhooks) each community they own can have */
  webhooks: Record<PlanId, number>;
  /** custom emoji each community they own can have */
  emojiSlots: Record<PlanId, number>;
}

export const DEFAULT_PLAN_CONFIG: PlanConfig = {
  prices: { lite: 2000, pro: 5000 },
  // Pro is "unlimited", with a fair-use cap
  create: { free: 2, lite: 6, pro: 30 },
  join: { free: 3, lite: 12, pro: null },
  mediaSlots: { free: 2, lite: 4, pro: 6 },
  communitiesCreate: { free: 5, lite: 10, pro: 25 },
  communitiesJoin: { free: 50, lite: 100, pro: 200 },
  webhooks: { free: 2, lite: 5, pro: 10 },
  emojiSlots: { free: 20, lite: 50, pro: 100 },
};

/** the most gallery slots any plan can have (Admin → Plans) */
export const MEDIA_SLOTS_MAX = 24;

export const PLAN_NAMES: Record<PlanId, string> = { free: "Free", lite: "Lite", pro: "Pro" };

/** Which profile style kinds each plan unlocks. */
const STYLE_ACCESS: Record<PlanId, StyleKind[]> = {
  free: [],
  lite: ["frame", "name"],
  pro: ["frame", "name", "theme", "effect", "anim"],
};
export const planUnlocksStyle = (plan: PlanId, kind: StyleKind) => STYLE_ACCESS[plan].includes(kind);

/** What a plan gets you, in lines for the plan cards. */
export function planPerks(plan: PlanId, c: PlanConfig): string[] {
  const join = c.join[plan];
  const kliques = [`Start ${plan === "pro" ? "unlimited kliques" : `${c.create[plan]} kliques a month`}`, join === null ? "Join as many kliques as you like" : `Be in ${join} kliques at once`];
  const slots = c.mediaSlots[plan];
  const media = `${slots} photos or videos in your gallery, any mix`;
  const w = c.webhooks[plan];
  const em = c.emojiSlots[plan];
  const spaces = [`Create ${c.communitiesCreate[plan]} communities, join up to ${c.communitiesJoin[plan]}`, ...(w ? [`${w} ${w === 1 ? "bot" : "bots"} (webhooks) in each community you own`] : []), `${em} custom emoji in each community you own`, ...(plan === "pro" ? ["Use your communities' emoji anywhere"] : [])];
  if (plan === "free") return [...kliques, media, ...spaces];
  if (plan === "lite") return [...kliques, media, ...spaces, "Lite badge by your name"];
  return [...kliques, media, ...spaces, "Pro badge by your name", "Your kliques shown a little higher"];
}

const int = (v: unknown, min: number, max: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback);

const per = (v: Partial<Record<PlanId, number>> | undefined, d: Record<PlanId, number>, max: number): Record<PlanId, number> => ({ free: int(v?.free, 0, max, d.free), lite: int(v?.lite, 0, max, d.lite), pro: int(v?.pro, 0, max, d.pro) });

/** Stored settings merged over the defaults, with anything odd dropped. */
export function planConfigOf(v: unknown): PlanConfig {
  const o = (v && typeof v === "object" ? v : {}) as Partial<PlanConfig>;
  const d = DEFAULT_PLAN_CONFIG;
  const join = (id: PlanId) => {
    const x = o.join?.[id];
    return x === null ? null : int(x, 0, 1000, d.join[id] ?? 1000);
  };
  return {
    prices: { lite: int(o.prices?.lite, 100, 1_000_000, d.prices.lite), pro: int(o.prices?.pro, 100, 1_000_000, d.prices.pro) },
    create: { free: int(o.create?.free, 0, 1000, d.create.free), lite: int(o.create?.lite, 0, 1000, d.create.lite), pro: int(o.create?.pro, 0, 1000, d.create.pro) },
    join: { free: join("free"), lite: join("lite"), pro: o.join && "pro" in o.join ? join("pro") : d.join.pro },
    mediaSlots: per(o.mediaSlots, d.mediaSlots, MEDIA_SLOTS_MAX),
    communitiesCreate: per(o.communitiesCreate, d.communitiesCreate, 10_000),
    communitiesJoin: per(o.communitiesJoin, d.communitiesJoin, 10_000),
    webhooks: per(o.webhooks, d.webhooks, 50),
    emojiSlots: per(o.emojiSlots, d.emojiSlots, 500),
  };
}

/** The plan someone has right now (a paid plan only until it runs out). */
export function activePlan(u: { plan?: PlanId | null; planUntil?: Date | string | null }, now = Date.now()): PlanId {
  if (!u.plan || u.plan === "free" || !u.planUntil) return "free";
  return +new Date(u.planUntil) > now ? u.plan : "free";
}

/**
 * Lite and Pro in the phone app: 30 days bought through Apple or Google, which don't renew by themselves. The store
 * products with these ids have to exist in App Store Connect (as non-renewing subscriptions) and Play Console.
 */
export const PLAN_STORE_PRODUCTS: Record<PaidPlan, string> = { lite: "plan_lite_30d", pro: "plan_pro_30d" };
export const planFromStoreProduct = (id: string): PaidPlan | null => (id === PLAN_STORE_PRODUCTS.lite ? "lite" : id === PLAN_STORE_PRODUCTS.pro ? "pro" : null);
const PLAN_DAY_MS = 24 * 60 * 60 * 1000;
/**
 * What a 30-day purchase gives. More of the same plan adds on to the time left. A higher plan starts today. A lower
 * plan while on a higher one (the app doesn't offer it, but a purchase can't be undone) keeps the higher plan and adds the days.
 */
export function planAfterPurchase(current: { plan: PlanId; until: Date | null }, bought: PaidPlan, now: Date): { plan: PaidPlan; until: Date } {
  const left = current.plan !== "free" && current.until && +current.until > +now ? +current.until : null;
  const rank = (p: PlanId) => (p === "pro" ? 2 : p === "lite" ? 1 : 0);
  if (left && rank(current.plan) >= rank(bought)) return { plan: current.plan as PaidPlan, until: new Date(left + 30 * PLAN_DAY_MS) };
  return { plan: bought, until: new Date(+now + 30 * PLAN_DAY_MS) };
}
