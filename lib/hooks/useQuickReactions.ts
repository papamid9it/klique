"use client";

import { useSyncExternalStore } from "react";
import { REACTIONS, type ReactionKind } from "@/lib/reactions";

/**
 * The three reactions in a message's hover bar: the ones you use most (counted on this device), else 👍 ❤️ 😂.
 * Counting happens when you react from anywhere (`countReaction`).
 */
const KEY = "klique.reactionCounts";
const FALLBACK: ReactionKind[] = ["like", "love", "laugh"];
const listeners = new Set<() => void>();
let cached: ReactionKind[] | null = null;

function read(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function top(): ReactionKind[] {
  if (cached) return cached;
  const counts = read();
  const used = REACTIONS.map((r) => r.id).filter((k) => (counts[k] ?? 0) > 0).sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
  cached = [...used, ...FALLBACK.filter((k) => !used.includes(k))].slice(0, 3);
  return cached;
}

export function countReaction(kind: ReactionKind) {
  try {
    const counts = read();
    counts[kind] = (counts[kind] ?? 0) + 1;
    localStorage.setItem(KEY, JSON.stringify(counts));
  } catch {
    // private window: the defaults stay
  }
  cached = null;
  listeners.forEach((l) => l());
}

export function useQuickReactions(): ReactionKind[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    top,
    () => FALLBACK,
  );
}
