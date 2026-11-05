import type { CrewCardDTO, EventDTO } from "./types";

/**
 * What goes between posts in the Home feed, on the web and in the phone app. Now and then, at a random spot, an event
 * or a klique shows up like a post (and now and then an ad). It looks random to people but stays put for one `seed`,
 * so nothing moves around while they scroll and more posts load. A new seed is a new mix: each visit feels different.
 */
export type FeedSlot = { kind: "klique"; klique: CrewCardDTO } | { kind: "event"; event: EventDTO } | { kind: "ad"; ad: number };

/** Posts between two cards: at least, and at most. */
const GAP_MIN = 4;
const GAP_MAX = 8;
/** How often each kind comes up; a kind with nothing left gives its turn to another. */
const CHANCE = { event: 0.4, klique: 0.4, ad: 0.2 };
/** Once: communities to join, after this many posts. */
export const COMMUNITIES_AT = 9;
/** The first row of kliques, how often it comes back, and how many one row shows. */
const KLIQUES_ROW_AT = 4;
const KLIQUES_ROW_EVERY = 15;
const KLIQUES_PER_ROW = 8;

/** Random numbers that repeat for the same seed (mulberry32). */
function randomFrom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (s: string, seed: number) => {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
};

/** Shuffled the same way for a seed, whatever else is in the list, so hiding one card doesn't reshuffle the rest. */
const shuffled = <T extends { id: string }>(list: T[], seed: number) => [...list].sort((a, b) => hash(a.id, seed) - hash(b.id, seed));

/** A seed for this visit. */
export const newFeedSeed = () => Math.floor(Math.random() * 2 ** 31);

/** Planned this far ahead every time, so more posts loading never changes what's above them. */
const PLANNED_POSTS = 1000;

/** Where every card and row goes, in post order. `avoid`: post numbers that already have something after them. */
export function mixFeed(posts: number, kliques: CrewCardDTO[], events: EventDTO[], ads: number, seed: number, avoid: number[] = []) {
  const slots = new Map<number, FeedSlot>();
  const rows = new Map<number, CrewCardDTO[]>();
  const random = randomFrom(seed);
  const mixed = shuffled(kliques, seed);
  // half the kliques for rows and half for single cards, so each gets some and none shows twice
  const rowPool = mixed.filter((_, i) => i % 2 === 1);
  const pool = { klique: mixed.filter((_, i) => i % 2 === 0), event: shuffled(events, seed) };
  const rowAt: number[] = [];
  for (let n = KLIQUES_ROW_AT; n <= PLANNED_POSTS && rowPool.length; n += KLIQUES_ROW_EVERY) {
    let at = n;
    while (avoid.includes(at) || avoid.includes(at - 1)) at++;
    rowAt.push(at);
    const row = rowPool.splice(0, KLIQUES_PER_ROW);
    if (at <= posts) rows.set(at, row);
  }
  const busy = (n: number) => [n - 1, n, n + 1].some((x) => avoid.includes(x) || rowAt.includes(x));
  let adNo = 0;
  let last: FeedSlot["kind"] | null = null;
  let n = 0;
  while (n <= PLANNED_POSTS) {
    n += GAP_MIN + Math.floor(random() * (GAP_MAX - GAP_MIN + 1));
    while (busy(n)) n++;
    const roll = random();
    const wish: FeedSlot["kind"] = roll < CHANCE.event ? "event" : roll < CHANCE.event + CHANCE.klique ? "klique" : "ad";
    // the same kind twice running only when nothing else is left
    const order: FeedSlot["kind"][] = [wish, ...(["event", "klique", "ad"] as const).filter((k) => k !== wish)];
    const can = (k: FeedSlot["kind"]) => (k === "ad" ? ads > 0 : pool[k].length > 0);
    const kind = order.find((k) => can(k) && k !== last) ?? order.find(can);
    if (!kind) continue;
    last = kind;
    const slot: FeedSlot = kind === "event" ? { kind, event: pool.event.shift()! } : kind === "klique" ? { kind, klique: pool.klique.shift()! } : { kind, ad: adNo++ % ads };
    if (n <= posts) slots.set(n, slot);
  }
  return { slots, rows };
}
