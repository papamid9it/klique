import { MarkArt } from "@/lib/brand-logo";

/**
 * What shows while Klique first loads (the root layout's fallback, so it's in the very first HTML): the mark
 * breathing gently over a small sliding bar, in the mood's colours. It fades in after a beat, so a fast load never
 * flashes it. Plain HTML and CSS (app/motion.css), no script; still and simple for people who prefer less motion.
 */
export function BootSplash() {
  return (
    <div role="status" aria-busy="true" className="kq-boot fixed inset-0 z-50 grid place-items-center bg-canvas">
      <div className="flex flex-col items-center gap-6">
        <span className="kq-boot-mark block">
          <MarkArt size={76} colors={{ ink: "var(--ink)", accent: "var(--accent)" }} title="" />
        </span>
        <span aria-hidden="true" className="relative block h-[3px] w-28 overflow-hidden rounded-full bg-line">
          <span className="kq-boot-bar absolute inset-y-0 left-0 w-1/3 rounded-full bg-ink" />
        </span>
        <span className="sr-only">Loading Klique</span>
      </div>
    </div>
  );
}
