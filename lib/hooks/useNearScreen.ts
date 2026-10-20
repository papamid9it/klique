"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Becomes true once the element is on screen or close to it (`margin` ahead), and stays true.
 * For things worth fetching only when someone will see them: link previews, video metadata, heavy media.
 */
export function useNearScreen(ref: RefObject<Element | null>, margin = "600px"): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (near || !el) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin, near]);
  return near;
}
