import { cx } from "./cx";

/**
 * A scalloped "verification" rosette with a white check, drawn here (not anyone's asset). `tone`: blue for Pro
 * members, silver for Lite members, gold for verified communities, so a person's plan never reads as a
 * community's verification.
 */
const FILL = { blue: "#1D9BF0", silver: "#8B98A5", gold: "#D4A017" } as const;

/** 12 soft scallops around a circle (a rosette), as one path. */
const ROSETTE = (() => {
  const n = 12;
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const r = i % 2 === 0 ? 11.4 : 9.6;
    pts.push(`${(12 + r * Math.cos(a)).toFixed(2)},${(12 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
})();

export function Rosette({ tone, size = 16, label, className }: { tone: keyof typeof FILL; size?: number; label: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={label} className={cx("inline-block shrink-0 align-[-0.15em]", className)}>
      <title>{label}</title>
      <path d={ROSETTE} fill={FILL[tone]} stroke={FILL[tone]} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7.6 12.3l2.9 2.9 5.9-6" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
