import Link from "next/link";
import { LogoArt, MarkArt, TAGLINE } from "@/lib/brand-logo";

/** the logo follows the mood: the word in ink, the crown in the accent, the swash in the second accent */
const MOOD = { ink: "var(--ink)", accent: "var(--accent)", accent2: "var(--accent2)" };

/**
 * The Klique logo (lib/brand-logo). `compact`: on narrow phones only the mark (the K with its crown) stays.
 * `tagline`: "FIND YOUR KLIQUE" under it, where there's room (sign in, onboarding, legal pages).
 */
export function Logo({ className = "", compact, tagline, height = 40 }: { className?: string; compact?: boolean; tagline?: boolean; height?: number }) {
  return (
    <Link href="/" aria-label="Klique — home" className={`inline-flex flex-col items-start gap-1.5 ${className}`}>
      <span className={compact ? "max-[399px]:hidden" : ""}>
        <LogoArt height={height} colors={MOOD} title="" />
      </span>
      {compact && (
        <span className="min-[400px]:hidden">
          <MarkArt size={36} colors={MOOD} title="" />
        </span>
      )}
      {tagline && <span className="pl-1 font-mono text-[10.5px] font-medium tracking-[0.3em] text-ink-muted">{TAGLINE}</span>}
    </Link>
  );
}

/** Just the mark, for tight spots (the rail's home button). */
export function LogoMark({ size = 30 }: { size?: number }) {
  return <MarkArt size={size} colors={MOOD} title="" />;
}
