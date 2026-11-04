"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { scrollerOf } from "./useInfiniteFeed";

const GAP = 24;

/**
 * Reddit's back-to-top: a small round ↑ once you've scrolled about two screens down; it scrolls back up (smoothly,
 * no refresh). Put it last in the feed's column. `hidden` while the "New posts" pill is up (that goes to the top too).
 *  - big screens: in the gap to the right of the feed column, never over a post and never past the right panel
 *    (measured live; when the gap is narrow it gets smaller and sits in the middle of it)
 *  - phones: bottom right, above the bottom tabs
 */
export function BackToTop({ hidden }: { hidden?: boolean }) {
  const self = useRef<HTMLDivElement>(null);
  const big = useMediaQuery("(min-width: 1024px)");
  const [far, setFar] = useState(false);
  const [spot, setSpot] = useState<{ left: number; size: number } | null>(null);

  useEffect(() => {
    const s = scrollerOf(self.current);
    const place = () => {
      const top = s instanceof Window ? s.scrollY : s.scrollTop;
      const screen = s instanceof Window ? s.innerHeight : s.clientHeight;
      setFar(top > screen * 2);
      if (!big || !self.current) return setSpot(null);
      // the feed column's right edge, and how far right we may go: the right panel, the scrolling panel's edge
      // (less its scrollbar), or the window
      const col = self.current.getBoundingClientRect().right;
      const rail = document.querySelector<HTMLElement>("[data-right-rail]");
      const railLeft = rail && rail.offsetParent !== null ? rail.getBoundingClientRect().left : Infinity;
      const limit = Math.min(railLeft, s instanceof Window ? document.documentElement.clientWidth : s.getBoundingClientRect().left + s.clientWidth);
      const room = limit - col;
      const size = room >= 44 + 16 ? 44 : 36;
      setSpot({ left: col + Math.max(2, Math.min(GAP, (room - size) / 2)), size });
    };
    place();
    s.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      s.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [big]);

  const shown = far && !hidden;
  const go = () => scrollerOf(self.current).scrollTo({ top: 0, behavior: "smooth" });
  const look = (size: number) =>
    cx(
      "pointer-events-auto inline-flex items-center justify-center rounded-full border border-line bg-surface text-ink shadow-[0_6px_20px_-8px_rgba(0,0,0,0.45)] transition duration-200 hover:border-ink-muted",
      size >= 44 ? "size-11" : size >= 40 ? "size-10" : "size-9",
      shown ? "scale-100 opacity-100" : "pointer-events-none scale-90 opacity-0",
    );

  return (
    <div ref={self} aria-hidden={!shown} className="pointer-events-none sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 flex h-0 justify-end lg:bottom-6">
      {big && spot ? (
        <button type="button" aria-label="Back to top" title="Back to top" tabIndex={shown ? 0 : -1} onClick={go} style={{ position: "fixed", left: spot.left, bottom: 24 }} className={look(spot.size)}>
          <Icon name="arrowdown" size={spot.size >= 44 ? 18 : 16} className="rotate-180" />
        </button>
      ) : (
        <button type="button" aria-label="Back to top" title="Back to top" tabIndex={shown ? 0 : -1} onClick={go} className={cx(look(40), "-translate-y-full")}>
          <Icon name="arrowdown" size={18} className="rotate-180" />
        </button>
      )}
    </div>
  );
}
