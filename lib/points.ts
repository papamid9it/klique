import { FRAMES, NAME_EFFECTS } from "./cosmetics";

/**
 * Points: what you spend to wear a picture frame or a name style. Your picture and banner are always free.
 * An unlock lasts `unlockDays` (30 by default); it can renew itself from your balance. Points are bought in
 * packs (set by a site admin), given by admins, and later earned from Hype. They can't be cashed out or sent
 * to someone else, and they never raise your rank.
 */

export type StyleKind = "frame" | "name";
/** "frame:fire", "name:gold-shimmer" */
export type StyleKey = `${StyleKind}:${string}`;

export interface PointPack {
  id: string;
  points: number;
  /** naira */
  price: number;
}

export interface PointsConfig {
  currency: "NGN";
  packs: PointPack[];
  /** how long one unlock lasts */
  unlockDays: number;
  /** price of any frame / name style without its own price */
  defaultPrice: Record<StyleKind, number>;
  /** per-design prices; 0 makes that design free */
  prices: Record<string, number>;
}

export const DEFAULT_POINTS_CONFIG: PointsConfig = {
  currency: "NGN",
  packs: [
    { id: "small", points: 500, price: 1000 },
    { id: "medium", points: 1200, price: 2000 },
    { id: "large", points: 3000, price: 4500 },
  ],
  unlockDays: 30,
  defaultPrice: { frame: 300, name: 200 },
  prices: {},
};

export const STYLE_KEYS: StyleKey[] = [...FRAMES.map((f) => `frame:${f.id}` as StyleKey), ...NAME_EFFECTS.map((e) => `name:${e.id}` as StyleKey)];
export const isStyleKey = (k: string): k is StyleKey => (STYLE_KEYS as string[]).includes(k);

export function styleName(key: string): string {
  const [kind, id] = key.split(":");
  const spec = kind === "frame" ? FRAMES.find((f) => f.id === id) : NAME_EFFECTS.find((e) => e.id === id);
  return spec ? `${spec.name} ${kind === "frame" ? "frame" : "name style"}` : key;
}

export function stylePrice(c: PointsConfig, key: StyleKey): number {
  const own = c.prices[key];
  return typeof own === "number" ? own : c.defaultPrice[key.split(":")[0] as StyleKind];
}

const int = (v: unknown, min: number, max: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback);

/** Stored settings merged over the defaults, with anything odd dropped. */
export function pointsConfigOf(stored: unknown): PointsConfig {
  const s = (stored && typeof stored === "object" ? stored : {}) as Partial<PointsConfig>;
  const packs = Array.isArray(s.packs) ? s.packs.filter((p) => p && typeof p.id === "string" && p.points > 0 && p.price > 0).map((p) => ({ id: p.id, points: int(p.points, 1, 1_000_000, 1), price: int(p.price, 100, 10_000_000, 100) })) : DEFAULT_POINTS_CONFIG.packs;
  const prices: Record<string, number> = {};
  for (const [k, v] of Object.entries(s.prices ?? {})) if (isStyleKey(k) && typeof v === "number") prices[k] = int(v, 0, 1_000_000, 0);
  return {
    currency: "NGN",
    packs: packs.sort((a, b) => a.points - b.points),
    unlockDays: int(s.unlockDays, 1, 365, DEFAULT_POINTS_CONFIG.unlockDays),
    defaultPrice: {
      frame: int(s.defaultPrice?.frame, 0, 1_000_000, DEFAULT_POINTS_CONFIG.defaultPrice.frame),
      name: int(s.defaultPrice?.name, 0, 1_000_000, DEFAULT_POINTS_CONFIG.defaultPrice.name),
    },
    prices,
  };
}
