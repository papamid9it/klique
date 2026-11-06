"use client";

import { useEffect, useRef } from "react";

/** Put the returned ref on an element at the end of a list: when it scrolls into view, more loads. */
export function useLoadOnScroll<T extends HTMLElement>(load: () => void, on: boolean) {
  const ref = useRef<T | null>(null);
  const latest = useRef(load);
  latest.current = load;
  useEffect(() => {
    const el = ref.current;
    if (!on || !el) return;
    const seen = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) latest.current();
    }, { rootMargin: "240px" });
    seen.observe(el);
    return () => seen.disconnect();
  });
  return ref;
}
