"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["M", "T", "W", "T", "F", "S", "S"];
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A month grid with a dot (and count) on every day that has events. Click a day to filter to it.
 * `todayKey` and every day key are Lagos calendar days, "YYYY-MM-DD".
 */
export function MiniCalendar({ todayKey, counts, selected, onSelect }: { todayKey: string | null; counts: Record<string, number>; selected: string; onSelect: (day: string) => void }) {
  const [offset, setOffset] = useState(0);
  if (!todayKey) return <div className="h-64 rounded-card border border-line bg-surface" aria-hidden="true" />;

  const [ty, tm] = todayKey.split("-").map(Number);
  const m0 = tm - 1 + offset;
  const year = ty + Math.floor(m0 / 12);
  const month = ((m0 % 12) + 12) % 12;
  const first = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // Monday-first
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  return (
    <section aria-label="Event calendar" className="rounded-card border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight">
          {MONTHS[month]} <span className="font-normal text-ink-muted">{year}</span>
        </h3>
        <div className="flex gap-1">
          <button type="button" onClick={() => setOffset((o) => Math.max(0, o - 1))} disabled={offset === 0} aria-label="Previous month" className="inline-flex size-7 items-center justify-center rounded-full text-ink-muted hover:bg-raised disabled:opacity-30">
            <Icon name="chevron-left" size={15} />
          </button>
          <button type="button" onClick={() => setOffset((o) => Math.min(2, o + 1))} disabled={offset === 2} aria-label="Next month" className="inline-flex size-7 items-center justify-center rounded-full text-ink-muted hover:bg-raised disabled:opacity-30">
            <Icon name="chevron-right" size={15} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {DOW.map((d, i) => (
          <span key={i} className="pb-1 font-mono text-[10px] text-ink-muted">{d}</span>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <span key={`b${i}`} />;
          const key = `${year}-${pad(month + 1)}-${pad(d)}`;
          const n = counts[key] ?? 0;
          const isToday = key === todayKey;
          const isSel = key === selected;
          return (
            <button
              key={key}
              type="button"
              disabled={!n}
              onClick={() => onSelect(isSel ? "" : key)}
              aria-pressed={isSel}
              aria-label={`${d} ${MONTHS[month]}${n ? `, ${n} ${n === 1 ? "event" : "events"}` : ""}`}
              className={cx(
                "relative mx-auto flex size-9 flex-col items-center justify-center rounded-full text-[13px] transition",
                isSel ? "bg-accent font-semibold text-accent-ink" : n ? "font-semibold text-ink hover:bg-raised" : "text-ink-muted/50",
                isToday && !isSel && "ring-1 ring-accent-text",
              )}
            >
              {d}
              {n > 0 && !isSel && <span className="absolute bottom-1 size-1 rounded-full bg-accent-text" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      {selected && (
        <button type="button" onClick={() => onSelect("")} className="mt-3 w-full text-center text-[12px] font-semibold text-accent-text hover:underline">
          Clear day filter
        </button>
      )}
    </section>
  );
}
