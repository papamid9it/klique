import { FRAMES, NAME_EFFECTS, isAnimatedPicture } from "./cosmetics";

/**
 * Hype: the currency you buy, and the only thing you spend. It pays for profile designs, Nitro style: picture
 * frames, name effects, a profile theme, profile effects, and
 * animated (GIF) pictures and banners. A plain picture and banner are always free; an unlock lasts `unlockDays` (30 by default) and can renew itself from
 * your balance. Hype comes in packs bought on Paystack (set by a site admin) or from admins. It can't be cashed
 * out or sent to someone else. (Points are different: earned, never bought. See lib/points.ts.)
 */

export type StyleKind = "frame" | "name" | "theme" | "effect" | "anim";
/** "frame:fire", "name:gold-shimmer", "theme:custom", "effect:<slug>", "anim:profile" */
export type StyleKey = `${StyleKind}:${string}`;

/** Each kind of design, for prices and labels. */
export const STYLE_KINDS: { id: StyleKind; label: string }[] = [
  { id: "frame", label: "Picture frame" },
  { id: "name", label: "Name effect" },
  { id: "theme", label: "Profile theme" },
  { id: "effect", label: "Profile effect" },
  { id: "anim", label: "Animated picture & banner" },
];

export interface HypePack {
  id: string;
  /** Hype you get */
  hype: number;
  /** naira */
  price: number;
}

export interface WalletConfig {
  currency: "NGN";
  packs: HypePack[];
  /** how long one unlock lasts */
  unlockDays: number;
  /** price of any frame / name style without its own price */
  defaultPrice: Record<StyleKind, number>;
  /** per-design prices; 0 makes that design free */
  prices: Record<string, number>;
}

export const DEFAULT_WALLET_CONFIG: WalletConfig = {
  currency: "NGN",
  packs: [
    { id: "small", hype: 500, price: 1000 },
    { id: "medium", hype: 1200, price: 2000 },
    { id: "large", hype: 3000, price: 4500 },
  ],
  unlockDays: 30,
  defaultPrice: { frame: 300, name: 200, theme: 400, effect: 350, anim: 500 },
  prices: {},
};

export const STYLE_KEYS: StyleKey[] = [
  ...FRAMES.map((f) => `frame:${f.id}` as StyleKey),
  ...NAME_EFFECTS.map((e) => `name:${e.id}` as StyleKey),
  "theme:custom",
  "anim:profile",
];
/** A design key. Profile effects are uploaded by site admins, so any "effect:<slug>" is a key (the server checks it exists). */
export const isStyleKey = (k: string): k is StyleKey => (STYLE_KEYS as string[]).includes(k) || /^effect:[a-z0-9-]{1,40}$/.test(k);

export function styleName(key: string): string {
  const [kind, id] = key.split(":");
  if (kind === "theme") return "Profile theme";
  if (kind === "anim") return "Animated picture & banner";
  if (kind === "effect") return `${id.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase())} profile effect`;
  const spec = kind === "frame" ? FRAMES.find((f) => f.id === id) : NAME_EFFECTS.find((e) => e.id === id);
  return spec ? `${spec.name} ${kind === "frame" ? "frame" : "name effect"}` : key;
}

export function stylePrice(c: WalletConfig, key: StyleKey): number {
  const own = c.prices[key];
  return typeof own === "number" ? own : c.defaultPrice[key.split(":")[0] as StyleKind];
}

const int = (v: unknown, min: number, max: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback);

/** Stored settings merged over the defaults, with anything odd dropped. (Packs saved before the rename say `points`.) */
export function walletConfigOf(stored: unknown): WalletConfig {
  const s = (stored && typeof stored === "object" ? stored : {}) as Partial<WalletConfig>;
  const amount = (p: { hype?: number; points?: number }) => p.hype ?? p.points ?? 0;
  const packs = Array.isArray(s.packs) ? s.packs.filter((p) => p && typeof p.id === "string" && amount(p) > 0 && p.price > 0).map((p) => ({ id: p.id, hype: int(amount(p), 1, 1_000_000, 1), price: int(p.price, 100, 10_000_000, 100) })) : DEFAULT_WALLET_CONFIG.packs;
  const prices: Record<string, number> = {};
  for (const [k, v] of Object.entries(s.prices ?? {})) if (isStyleKey(k) && typeof v === "number") prices[k] = int(v, 0, 1_000_000, 0);
  return {
    currency: "NGN",
    packs: packs.sort((a, b) => a.hype - b.hype),
    unlockDays: int(s.unlockDays, 1, 365, DEFAULT_WALLET_CONFIG.unlockDays),
    defaultPrice: Object.fromEntries(STYLE_KINDS.map((k) => [k.id, int(s.defaultPrice?.[k.id], 0, 1_000_000, DEFAULT_WALLET_CONFIG.defaultPrice[k.id])])) as Record<StyleKind, number>,
    prices,
  };
}

/** What a profile shows that can cost Hype. */
export interface Worn {
  avatarFrame?: string | null;
  nameEffect?: string | null;
  profileTheme?: { primary: string; accent: string } | null;
  profileEffect?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
}

/** The designs a profile is wearing, as unlock keys (a GIF picture or banner needs "anim:profile"). */
export function wornKeys(w: Worn): StyleKey[] {
  const keys: StyleKey[] = [];
  if (w.avatarFrame) keys.push(`frame:${w.avatarFrame}`);
  if (w.nameEffect) keys.push(`name:${w.nameEffect}`);
  if (w.profileTheme) keys.push("theme:custom");
  if (w.profileEffect) keys.push(`effect:${w.profileEffect}`);
  if (isAnimatedPicture(w.avatarUrl) || isAnimatedPicture(w.bannerUrl)) keys.push("anim:profile");
  return keys.filter(isStyleKey);
}
