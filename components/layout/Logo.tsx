import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" aria-label="klique — home" className={`inline-flex items-center gap-2.5 ${className}`}>
      <span aria-hidden="true" className="inline-flex size-8 items-center justify-center rounded-full bg-accent text-accent-ink">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M12 3.5v17M4.6 7.8l14.8 8.4M4.6 16.2 19.4 7.8" />
        </svg>
      </span>
      <span className="text-[26px] leading-none font-semibold tracking-[-0.045em] text-ink">klique.</span>
    </Link>
  );
}
