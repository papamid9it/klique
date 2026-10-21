"use client";

import { RankService } from "@/app/services/RankService";
import { DEFAULT_RANKS } from "@/lib/ranks";
import { useApi } from "@/lib/hooks/useApi";
import { cx } from "./cx";

/** The rank ladder (names, Hype lines, points), fetched once and shared by every badge on screen. */
export function useRanks() {
  const { data } = useApi(() => RankService.config(), [], { key: "ranks" });
  return data ?? DEFAULT_RANKS;
}

/** Each rank's colour, lowest to highest (the top ones get the loud ones). */
const TONE = [
  "border-line text-ink-muted",
  "border-sky-400/40 bg-sky-400/10 text-sky-300",
  "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  "border-violet-400/50 bg-violet-400/15 text-violet-300",
  "border-amber-300/60 bg-amber-300/15 text-amber-200",
];

/**
 * A small pill with someone's rank name. By default the first rank isn't shown (everyone starts there), so
 * badges only appear once someone has earned one; `always` shows it anyway (their profile, your own page).
 */
export function RankBadge({ rank, always, className }: { rank?: number | null; always?: boolean; className?: string }) {
  const c = useRanks();
  const r = Math.max(1, Math.min(rank ?? 1, c.ranks.length));
  if (r === 1 && !always) return null;
  const name = c.ranks[r - 1]?.name ?? `Rank ${r}`;
  return (
    <span title={`Rank ${r}: ${name}`} className={cx("inline-flex h-[18px] shrink-0 items-center rounded-full border px-1.5 text-[10.5px] leading-none font-bold tracking-wide whitespace-nowrap uppercase", TONE[Math.min(r - 1, TONE.length - 1)], r >= c.ranks.length && "shadow-[0_0_10px_rgba(252,211,77,0.35)]", className)}>
      {name}
    </span>
  );
}
