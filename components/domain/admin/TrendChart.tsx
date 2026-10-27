"use client";

import { useState } from "react";
import { cx } from "@/components/ui/cx";

const fmtDay = (day: string, opts: Intl.DateTimeFormatOptions) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC", ...opts });

/** a round top for the scale (1, 2, 5, 10, 20…), always an even number of whole steps */
function niceTop(max: number) {
  const half = Math.max(1, max / 2);
  const p = 10 ** Math.floor(Math.log10(half));
  const m = half / p;
  const step = Math.max(1, Math.ceil((m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p));
  return step * 2;
}

/**
 * One daily series as bars: every day is on it (a quiet day keeps a stub on the baseline), with a scale on
 * the left and dates under it. Point or use ← → (after focusing it) to read a day. A hidden table carries the same
 * numbers for screen readers.
 */
export function TrendChart({ data, unit }: { data: { day: string; value: number }[]; unit: string }) {
  const [at, setAt] = useState<number | null>(null);
  const W = 1000;
  const H = 200;
  const n = data.length;
  const top = niceTop(Math.max(0, ...data.map((d) => d.value)));
  const total = data.reduce((s, d) => s + d.value, 0);
  // about six dates under the chart, always ending today
  const every = Math.max(1, Math.round((n - 1) / 5));
  const ticks = data.map((_, i) => i).filter((i) => (n - 1 - i) % every === 0);
  const pct = (i: number) => ((i + 0.5) / n) * 100;
  const tip = at !== null ? data[at] : null;

  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setAt(Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * n))));
  };

  return (
    <div className="flex gap-3">
      {/* the scale */}
      <div className="relative h-48 w-7 shrink-0 font-mono text-[10px] text-ink-muted" aria-hidden="true">
        {[top, top / 2, 0].map((v, i) => (
          <span key={i} className="absolute right-0 -translate-y-1/2 tabular-nums" style={{ top: `${(1 - v / top) * 100}%` }}>
            {v.toLocaleString()}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div
          role="img"
          aria-label={`${total.toLocaleString()} ${unit} in the last ${n} days`}
          tabIndex={0}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={() => setAt(null)}
          onBlur={() => setAt(null)}
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            setAt((a) => Math.min(n - 1, Math.max(0, (a ?? n) + (e.key === "ArrowLeft" ? -1 : 1))));
          }}
          className="relative h-48 touch-pan-y rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-accent-text/60"
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
            {[0, 0.5].map((f) => (
              <line key={f} x1={0} x2={W} y1={f * H} y2={f * H} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="3 4" />
            ))}
          </svg>
          {/* a bar a day; a day with none keeps a stub on the baseline, so quiet days still show */}
          <div className={cx("absolute inset-0 flex items-end border-b border-line", n > 45 ? "gap-px" : "gap-[3px]")}>
            {data.map((d, i) => (
              <span key={d.day} className="flex h-full min-w-0 flex-1 items-end">
                <span className={cx("w-full transition-opacity", d.value ? "rounded-t-[3px] bg-accent" : "h-[2px] bg-ink-muted/25")} style={{ height: d.value ? `${Math.max(1.5, (d.value / top) * 100)}%` : undefined, opacity: at === null || at === i ? 1 : 0.4 }} />
              </span>
            ))}
          </div>
          {tip && at !== null && (
            <>
              <div
                role="status"
                className="pointer-events-none absolute -top-2 z-10 rounded-control border border-line bg-canvas px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
                style={{ left: `${pct(at)}%`, transform: `translate(${pct(at) < 15 ? "0" : pct(at) > 85 ? "-100%" : "-50%"}, -100%)` }}
              >
                <span className="text-ink-muted">{fmtDay(tip.day, { weekday: "short", day: "numeric", month: "short" })}</span>{" "}
                <span className="font-mono font-semibold text-ink">{tip.value.toLocaleString()}</span> <span className="text-ink-muted">{unit}</span>
              </div>
            </>
          )}
          {total === 0 && <p className="absolute inset-x-0 top-1/3 text-center text-xs text-ink-muted">Nothing in these {n} days yet.</p>}
        </div>
        <div className="relative mt-2 h-4 font-mono text-[10px] text-ink-muted" aria-hidden="true">
          {ticks.map((i) => (
            <span key={i} className="absolute whitespace-nowrap" style={{ left: `${pct(i)}%`, transform: `translateX(${i === 0 ? "0" : i === n - 1 ? "-100%" : "-50%"})` }}>
              {i === n - 1 ? "Today" : fmtDay(data[i].day, { day: "numeric", month: "short" })}
            </span>
          ))}
        </div>
        {/* a table ignores the 1px box sr-only gives it, so the wrapper hides it (else it stretches the page) */}
        <div className="sr-only">
          <table>
            <caption>
              {unit} per day, last {n} days
            </caption>
            <tbody>
              {data.map((d) => (
                <tr key={d.day}>
                  <td>{d.day}</td>
                  <td>{d.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
