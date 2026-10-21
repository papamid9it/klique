import { cx } from "./cx";

/**
 * A small count pill: unread messages in a channel, a crew or a whole community. `mention` marks counts that
 * include messages tagging you (they stand out more). Nothing renders for 0.
 */
export function CountBadge({ n, mention, className, label }: { n: number; mention?: boolean; className?: string; label?: string }) {
  if (n <= 0) return null;
  return (
    <span
      aria-label={label ?? `${n} unread${mention ? ", including mentions of you" : ""}`}
      className={cx("inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] leading-none font-bold tabular-nums", mention ? "bg-danger text-white" : "bg-accent text-accent-ink", className)}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}
