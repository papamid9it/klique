"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { scrollerOf } from "./useInfiniteFeed";

/**
 * Reddit's back-to-top: a small round ↑ at the bottom right of a feed's column, once you've scrolled about two screens
 * down. It scrolls back up (smoothly, no refresh). Put it last in the feed's column; it rides along with the screen
 * (sticky) and sits above the phone's bottom bar. `hidden` while the "New posts" pill is up (that one goes to the top
 * too).
 */
export function BackToTop({ hidden }: { hidden?: boolean }) {
  const self = useRef<HTMLDivElement>(null);
  const [far, setFar] = useState(false);
  useEffect(() => {
    const s = scrollerOf(self.current);
    const on = () => {
      const top = s instanceof Window ? s.scrollY : s.scrollTop;
      const screen = s instanceof Window ? s.innerHeight : s.clientHeight;
      setFar(top > screen * 2);
    };
    on();
    s.addEventListener("scroll", on, { passive: true });
    return () => s.removeEventListener("scroll", on);
  }, []);
  const shown = far && !hidden;
  return (
    <div ref={self} aria-hidden={!shown} className="pointer-events-none sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 flex h-0 justify-end lg:bottom-6">
      <button
        type="button"
        aria-label="Back to top"
        title="Back to top"
        tabIndex={shown ? 0 : -1}
        onClick={() => scrollerOf(self.current).scrollTo({ top: 0, behavior: "smooth" })}
        className={cx(
          "inline-flex size-10 -translate-y-full items-center lg:size-11 justify-center rounded-full border border-line bg-surface text-ink shadow-[0_6px_20px_-8px_rgba(0,0,0,0.45)] transition duration-200 hover:border-ink-muted",
          shown ? "pointer-events-auto scale-100 opacity-100" : "scale-90 opacity-0",
        )}
      >
        <Icon name="arrowdown" size={18} className="rotate-180" />
      </button>
    </div>
  );
}
