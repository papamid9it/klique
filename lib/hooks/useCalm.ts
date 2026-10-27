"use client";

import { useSyncExternalStore } from "react";
import { useDataSaver } from "./useDataSaver";

const QUERY = "(prefers-reduced-motion: reduce)";
const subscribe = (fn: () => void) => {
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", fn);
  return () => m.removeEventListener("change", fn);
};

/** Keep decoration still: the person asked for less motion, or data saver is on (GIF pictures show their first frame). */
export function useCalm(): boolean {
  const reduce = useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
  return useDataSaver().on || reduce;
}
