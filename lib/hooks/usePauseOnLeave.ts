"use client";

import { useEffect, type RefObject } from "react";

/**
 * Pauses every video inside `box` when its page is left. Next keeps the last pages mounted but hidden (so Back
 * is instant), and a hidden `<video>` would otherwise keep playing with sound. React runs this cleanup both
 * when the page is hidden and when it's removed.
 */
export function usePauseOnLeave(box: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = box.current;
    return () => el?.querySelectorAll("video").forEach((v) => v.pause());
  }, [box]);
}
