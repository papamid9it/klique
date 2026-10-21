"use client";

import { useState, type ReactNode } from "react";
import { cdn } from "@/lib/cdn";
import { getInterest, type InterestId } from "@/lib/constants";
import { cx } from "./cx";

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}

/** One graphic motif per scene, drawn in the current mood's accent colours. */
function Pattern({ interest, seed }: { interest: InterestId; seed: number }) {
  const r = seed % 360;
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2 } as const;
  switch (interest) {
    case "skate":
      return (
        <g transform={`rotate(${-18 + (seed % 20)} 200 120)`} {...common} opacity=".5">
          {Array.from({ length: 12 }).map((_, i) => (
            <line key={i} x1={-60 + i * 48} y1={-40} x2={-60 + i * 48 + 70} y2={320} />
          ))}
        </g>
      );
    case "music":
      return (
        <g {...common} opacity=".5" transform={`translate(${100 + (seed % 200)} ${60 + (seed % 100)})`}>
          {[16, 40, 66, 94, 124, 156].map((rad) => (
            <circle key={rad} r={rad} />
          ))}
        </g>
      );
    case "streetwear":
      return (
        <g fill="currentColor" opacity=".35">
          {Array.from({ length: 8 }).flatMap((_, y) =>
            Array.from({ length: 14 }).map((_, x) => <circle key={`${x}-${y}`} cx={20 + x * 30 + (y % 2) * 15} cy={16 + y * 30} r={3.2} />),
          )}
        </g>
      );
    case "photography":
      return (
        <g {...common} opacity=".5" transform={`translate(${160 + (seed % 120)} 120)`}>
          {Array.from({ length: 6 }).map((_, i) => (
            <path key={i} transform={`rotate(${i * 60 + (r % 30)})`} d="M0 -22 L60 -92 A92 92 0 0 1 100 -58 Z" />
          ))}
          <circle r="20" />
        </g>
      );
    case "running":
      return (
        <g {...common} opacity=".5" strokeLinecap="round" strokeLinejoin="round">
          {Array.from({ length: 7 }).map((_, i) => (
            <polyline key={i} points={`${-20 + i * 70},40 ${30 + i * 70},120 ${-20 + i * 70},200`} />
          ))}
        </g>
      );
    case "art":
      return (
        <g fill="currentColor" opacity=".3">
          <circle cx={90 + (seed % 120)} cy={90} r={70} />
          <circle cx={250 + (seed % 60)} cy={150} r={90} />
          <ellipse cx={170} cy={220} rx={120} ry={42} />
        </g>
      );
    case "film":
      return (
        <g fill="currentColor" opacity=".32">
          {[0, 1].map((row) => Array.from({ length: 14 }).map((_, i) => <rect key={`${row}-${i}`} x={8 + i * 30} y={row ? 196 : 18} width="16" height="22" rx="4" />))}
          <rect x="0" y="62" width="400" height="2" />
          <rect x="0" y="176" width="400" height="2" />
        </g>
      );
    case "dance":
    default:
      return (
        <g {...common} opacity=".5" strokeLinecap="round">
          {Array.from({ length: 6 }).map((_, i) => (
            <path key={i} d={`M-10 ${40 + i * 38} q 50 -${30 + (seed % 20)} 100 0 t 100 0 t 100 0 t 100 0 t 100 0`} />
          ))}
        </g>
      );
  }
}

/** Generative cover, always in the active mood's colours. Used when there is no image — or it fails to load. */
export function ArtCover({ seed, interest, className, glyph = true }: { seed: string; interest: InterestId; className?: string; glyph?: boolean }) {
  const h = hash(seed);
  const flip = h % 2 === 0;
  const angle = 110 + (h % 90);
  const i = getInterest(interest);
  return (
    <div
      aria-hidden="true"
      className={cx("relative isolate overflow-hidden", className)}
      style={{
        background: `linear-gradient(${angle}deg, color-mix(in oklab, var(${flip ? "--accent" : "--accent2"}) 38%, var(--surface)), color-mix(in oklab, var(${flip ? "--accent2" : "--accent"}) 34%, var(--raised)))`,
      }}
    >
      <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full text-ink">
        <Pattern interest={interest} seed={h} />
      </svg>
      {glyph && <span className="absolute right-4 bottom-2 text-6xl leading-none font-semibold text-ink/15 select-none">{i.glyph}</span>}
    </div>
  );
}

/** An <img> that gracefully falls back to ArtCover. Fills its parent. */
export function Cover({
  src,
  seed,
  interest,
  className,
  children,
  fit = "cover",
}: {
  src?: string | null;
  seed: string;
  interest: InterestId;
  className?: string;
  children?: ReactNode;
  fit?: "cover" | "contain";
}) {
  const [failed, setFailed] = useState(false);
  const showArt = !src || failed;
  return (
    // "relative" only when the caller doesn't place it themselves: both at once and "relative" wins, which
    // collapses a full-bleed background (the Discover banner) to zero height
    <div className={cx(!/\b(absolute|fixed|sticky)\b/.test(className ?? "") && "relative", "overflow-hidden bg-raised", className)}>
      {showArt ? (
        <ArtCover seed={seed} interest={interest} className="absolute inset-0" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cdn(src, { w: 1200 })} alt="" loading="lazy" onError={() => setFailed(true)} className={cx("absolute inset-0 size-full", fit === "cover" ? "object-cover" : "object-contain")} />
      )}
      {children}
    </div>
  );
}
