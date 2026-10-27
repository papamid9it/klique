"use client";

import { useState } from "react";

/**
 * Sign-ups per day as thin bars (one series, so no legend: the panel title names it). Each bar has a hover /
 * focus tooltip, and a visually hidden table carries the same numbers for screen readers.
 */
const fmtDay = (day: string, opts: Intl.DateTimeFormatOptions) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC", ...opts });

/** `unit`: what the bars count ("sign-ups"; a community's dashboard says "joined") */
export function SignupChart({ data, unit = "sign-ups" }: { data: { day: string; count: number }[]; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = 160;
  const top = 10;
  const max = Math.max(1, ...data.map((d) => d.count));
  const niceMax = max <= 4 ? max : Math.ceil(max / 5) * 5;
  const slot = W / data.length;
  const barW = Math.max(2, slot - 2); // 2px surface gap between bars
  const y = (v: number) => H - (v / niceMax) * (H - top);
  const total = data.reduce((n, d) => n + d.count, 0);

  // A bar with 4px rounded top corners, square at the baseline.
  const bar = (x: number, h: number) => {
    if (h <= 0) return "";
    const r = Math.min(4, barW / 2, h);
    const yTop = H - h;
    return `M${x},${H}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + barW - r}Q${x + barW},${yTop} ${x + barW},${yTop + r}V${H}Z`;
  };

  const tip = hover !== null ? data[hover] : null;
  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H + 1}`} preserveAspectRatio="none" className="block h-40 w-full overflow-visible" role="img" aria-label={`${total} ${unit} in the last 30 days`}>
          {[0.5, 1].map((f) => (
            <line key={f} x1={0} x2={W} y1={y(niceMax * f)} y2={y(niceMax * f)} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="3 4" />
          ))}
          <line x1={0} x2={W} y1={H} y2={H} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {data.map((d, i) => {
            const x = i * slot + 1;
            const h = d.count ? Math.max(3, H - y(d.count)) : 0;
            return (
              <g key={d.day}>
                <path d={bar(x, h)} fill="var(--accent)" opacity={hover === null || hover === i ? 1 : 0.45} />
                {/* hit target: the full column, much bigger than the bar */}
                <rect
                  x={i * slot}
                  y={0}
                  width={slot}
                  height={H}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${fmtDay(d.day, { day: "numeric", month: "short" })}: ${d.count} ${unit}`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="outline-none"
                />
              </g>
            );
          })}
        </svg>
        <span className="pointer-events-none absolute top-0 left-0 -translate-y-1/2 bg-surface pr-1 font-mono text-[10px] text-ink-muted">{niceMax}</span>
        {tip && hover !== null && (
          <div
            role="status"
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-control border border-line bg-canvas px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
            style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}
          >
            <span className="text-ink-muted">{fmtDay(tip.day, { weekday: "short", day: "numeric", month: "short" })}</span>{" "}
            <span className="font-mono font-semibold text-ink">{tip.count}</span>
          </div>
        )}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-ink-muted">
        <span>{fmtDay(data[0].day, { day: "numeric", month: "short" })}</span>
        <span>{fmtDay(data[Math.floor(data.length / 2)].day, { day: "numeric", month: "short" })}</span>
        <span>Today</span>
      </div>
      {/* a table ignores the 1px box sr-only gives it, so the wrapper hides it (else it stretches the page) */}
      <div className="sr-only">
        <table>
          <caption>Sign-ups per day, last 30 days</caption>
          <thead>
            <tr>
              <th>Day</th>
              <th>Sign-ups</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.day}>
                <td>{d.day}</td>
                <td>{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
