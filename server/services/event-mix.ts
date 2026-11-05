import { createHash } from "node:crypto";

/**
 * Mixing which events lead, so the busiest one doesn't sit first for everyone, always. An event with more going on for
 * this person has better odds, but no event holds the top spot. The mix is different per person and changes every
 * MIX_WINDOW_MS, and stays put in between, so cards don't reshuffle while someone is looking at them.
 */
export const MIX_WINDOW_MS = 10 * 60 * 1000;

const windowOf = (now: number) => Math.floor(now / MIX_WINDOW_MS);
/** A number from 0 to 1 for this id and seed, the same every time. */
function chance(id: string, seed: string): number {
  // never exactly 0: it would sink an event to the bottom whatever its weight
  return (createHash("sha256").update(`${seed}:${id}`).digest().readUInt32BE(0) + 1) / 4294967297;
}

/** Heavier items tend to come first, in an order fixed by the seed (weighted shuffle: chance ^ (1 / weight), highest first). */
function shuffleBy<T extends { id: string }>(list: T[], weightOf: (item: T) => number, seed: string): T[] {
  return list
    .map((item) => ({ item, key: chance(item.id, seed) ** (1 / Math.max(weightOf(item), 0.01)) }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.item);
}

/**
 * This person's order for now. It never leads with what the same mix led with in the window before, when there's
 * anything else to lead with.
 */
export function mixEvents<T extends { id: string }>(list: T[], weightOf: (item: T) => number, who: string, now = Date.now()): T[] {
  const window = windowOf(now);
  const mixed = shuffleBy(list, weightOf, `${who}:${window}`);
  if (mixed.length < 2) return mixed;
  const before = shuffleBy(list, weightOf, `${who}:${window - 1}`);
  if (mixed[0].id === before[0].id) [mixed[0], mixed[1]] = [mixed[1], mixed[0]];
  return mixed;
}
