"use client";

import Link from "next/link";
import { cx } from "./cx";

export interface TabItem {
  id: string;
  label: string;
  count?: number | null;
  /** render as a link instead of a button */
  href?: string;
}

/** Underline tabs (WAI-ARIA tablist). Works as buttons (state) or links (routes). */
export function Tabs({ items, active, onChange, label }: { items: TabItem[]; active: string; onChange?: (id: string) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto no-bar border-b border-line px-1">
      {items.map((t) => {
        const selected = t.id === active;
        const cls = cx(
          "relative flex shrink-0 items-center gap-2 px-3 py-3 text-sm font-medium transition",
          selected ? "text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-ink" : "text-ink-muted hover:text-ink",
        );
        const inner = (
          <>
            {t.label}
            {t.count != null && t.count > 0 && <span className="font-mono text-[11px] text-ink-muted">{t.count}</span>}
          </>
        );
        return t.href ? (
          <Link key={t.id} role="tab" aria-selected={selected} href={t.href} className={cls} scroll={false}>
            {inner}
          </Link>
        ) : (
          <button key={t.id} type="button" role="tab" aria-selected={selected} onClick={() => onChange?.(t.id)} className={cls}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}
