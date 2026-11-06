import { cx } from "./cx";

/** The "Verified" badge by a community's name (site admins give it; Klique HQ always has it): the app's gold check. */
export function VerifiedCheck({ on, size = 14, className }: { on?: boolean | null; size?: number; className?: string }) {
  if (!on) return null;
  return (
    <span role="img" aria-label="Verified community" title="Verified community" style={{ width: size, height: size, backgroundColor: "#e2b33c" }} className={cx("inline-flex shrink-0 items-center justify-center rounded-full align-[-0.15em] text-white", className)}>
      <svg viewBox="0 0 24 24" width={size * 0.68} height={size * 0.68} fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m5 12 5 5 9-10" />
      </svg>
    </span>
  );
}
