/**
 * Ranks: earned with Hype, for showing up. You get Hype when a host confirms you came to their event, when
 * people you hosted came, when your crew made it there together, and when people like your topics and comments.
 * There's a daily cap so it can't be farmed, and bought points never raise your rank. Each new rank pays out
 * points (spent on frames and name styles). A site admin sets the names, the Hype each rank needs, what each
 * action is worth, and the daily cap.
 */

export type HypeAction = "attend" | "hostAttendee" | "crew";

export interface RankSpec {
  name: string;
  /** total Hype needed */
  hype: number;
  /** points given on reaching it */
  points: number;
}

export interface RanksConfig {
  /** in order; the first needs 0 Hype */
  ranks: RankSpec[];
  /** Hype per action */
  actions: Record<HypeAction, number>;
  /** most Hype anyone can earn in one day (Lagos time) */
  dailyCap: number;
}

export const HYPE_ACTIONS: { id: HypeAction; label: string; hint: string }[] = [
  { id: "attend", label: "Came to an event", hint: "The host confirms you were there." },
  { id: "hostAttendee", label: "Someone came to your event", hint: "Per person the host confirms (up to 50 per event)." },
  { id: "crew", label: "Went with a crew", hint: "You were in a crew of 2 or more for an event you were confirmed at." },
];

export const DEFAULT_RANKS: RanksConfig = {
  ranks: [
    { name: "Newbie", hype: 0, points: 0 },
    { name: "Regular", hype: 100, points: 100 },
    { name: "Plug", hype: 400, points: 250 },
    { name: "Connector", hype: 1000, points: 500 },
    { name: "Legend", hype: 2500, points: 1000 },
  ],
  actions: { attend: 30, hostAttendee: 5, crew: 15 },
  dailyCap: 150,
};

const int = (v: unknown, min: number, max: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback);

/** Stored settings over the defaults, tidied: names kept short, Hype rising, the first rank at 0. */
export function ranksConfigOf(stored: unknown): RanksConfig {
  const s = (stored && typeof stored === "object" ? stored : {}) as Partial<RanksConfig>;
  const raw = Array.isArray(s.ranks) && s.ranks.length >= 2 ? s.ranks.slice(0, 10) : DEFAULT_RANKS.ranks;
  const ranks: RankSpec[] = [];
  for (const [i, r] of raw.entries()) {
    const name = typeof r?.name === "string" && r.name.trim() ? r.name.trim().slice(0, 20) : `Rank ${i + 1}`;
    const hype = i === 0 ? 0 : int(r?.hype, (ranks[i - 1]?.hype ?? 0) + 1, 10_000_000, (ranks[i - 1]?.hype ?? 0) + 100);
    ranks.push({ name, hype, points: i === 0 ? 0 : int(r?.points, 0, 1_000_000, 0) });
  }
  const a = (s.actions ?? {}) as Partial<Record<HypeAction, number>>;
  return {
    ranks,
    actions: {
      attend: int(a.attend, 0, 10_000, DEFAULT_RANKS.actions.attend),
      hostAttendee: int(a.hostAttendee, 0, 10_000, DEFAULT_RANKS.actions.hostAttendee),
      crew: int(a.crew, 0, 10_000, DEFAULT_RANKS.actions.crew),
    },
    dailyCap: int(s.dailyCap, 1, 1_000_000, DEFAULT_RANKS.dailyCap),
  };
}

/** Rank number (1-based) for a Hype total. */
export function rankFor(c: RanksConfig, hype: number): number {
  let r = 1;
  c.ranks.forEach((x, i) => {
    if (hype >= x.hype) r = i + 1;
  });
  return r;
}
