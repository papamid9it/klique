"use client";

import { useEffect } from "react";

/** a see-through pixel: what a broken picture shows instead, over the placeholder tile in globals.css */
const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function mark(img: HTMLImageElement) {
  if (img.dataset.broken !== undefined || img.dataset.noFallback !== undefined || img.src === BLANK) return;
  img.dataset.broken = "";
  img.removeAttribute("srcset");
  img.src = BLANK;
}

/**
 * Never the browser's broken-picture icon: any picture that fails to load (a deleted upload, a dead link) becomes a
 * soft neutral tile with a small picture icon instead. Avatars and covers already swap in their own fallback
 * (initials, the cover art); this catches every other <img>. Add data-no-fallback to opt out.
 */
export function BrokenImages() {
  useEffect(() => {
    const onError = (e: Event) => {
      if (e.target instanceof HTMLImageElement) mark(e.target);
    };
    document.addEventListener("error", onError, true);
    // pictures that failed before the page came alive
    for (const img of Array.from(document.images)) if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) mark(img);
    return () => document.removeEventListener("error", onError, true);
  }, []);
  return null;
}
