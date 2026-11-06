import { cx } from "./cx";

/**
 * The badge by a person's name, the same as in the app: blue with a check for Pro, silver with a check for Lite, and
 * black with a gold crown and edge for Klique's own people.
 */
const FILL = { blue: "#1d9bf0", silver: "#9aa3ad", team: "#111111" } as const;
const GOLD = "#ffd24a";
/** the same shape as the app's badge */
const ROSETTE = "M12 1.800l2.500 1.900 3.100-.3 1.200 2.900 2.700 1.600-.7 3.100.7 3-2.700 1.600-1.200 2.900-3.100-.3L12 20.100l-2.500-1.900-3.100.3-1.200-2.900-2.700-1.600.7-3-.7-3.100 2.700-1.600 1.200-2.900 3.100.3z";

export function Rosette({ tone, size = 16, label, className }: { tone: keyof typeof FILL; size?: number; label: string; className?: string }) {
  const team = tone === "team";
  // the mark in the middle: 24 units across, scaled to fit
  const scale = team ? 0.56 : 0.6;
  const at = (24 - 24 * scale) / 2;
  return (
    <svg viewBox="0 -1 24 24" width={size} height={size} role="img" aria-label={label} className={cx("inline-block shrink-0 align-[-0.15em]", className)}>
      <title>{label}</title>
      <path d={ROSETTE} fill={FILL[tone]} stroke={team ? GOLD : "none"} strokeWidth={team ? 1.5 : 0} />
      <g transform={`translate(${at} ${at - 1}) scale(${scale})`} strokeLinecap="round" strokeLinejoin="round">
        {team ? <path d="M4 19 3 7l5 5 4-8 4 8 5-5-1 12z" fill={GOLD} stroke={GOLD} strokeWidth="1" /> : <path d="m5 12 5 5 9-10" fill="none" stroke="#fff" strokeWidth="3.2" />}
      </g>
    </svg>
  );
}
