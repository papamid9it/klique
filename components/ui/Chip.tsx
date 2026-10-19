import type { ReactNode } from "react";
import { getInterest, type InterestId } from "@/lib/constants";
import { cx } from "./cx";

export function Chip({ tone = "ink", className, children }: { tone?: "ink" | "accent" | "accent2"; className?: string; children: ReactNode }) {
  return <span className={cx("chip", tone === "accent" ? "chip-accent" : tone === "accent2" ? "chip-accent2" : "chip-ink", className)}>{children}</span>;
}

/** Interest chip: alternates the two accents by interest so a row of them feels varied but cohesive. */
const TONE_BY_INTEREST: Record<InterestId, "accent" | "accent2" | "ink"> = {
  skate: "accent",
  music: "accent2",
  streetwear: "accent",
  photography: "accent2",
  running: "accent",
  art: "accent2",
  film: "ink",
  dance: "accent",
};

export function InterestChip({ id, short, className }: { id: InterestId; short?: boolean; className?: string }) {
  const i = getInterest(id);
  return (
    <Chip tone={TONE_BY_INTEREST[id] ?? "ink"} className={className}>
      <span aria-hidden="true">{i.glyph}</span>
      {short ? i.short : i.name}
    </Chip>
  );
}
