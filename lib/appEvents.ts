"use client";

import { useEffect, useRef } from "react";

/**
 * Things that happened in this tab that other screens care about, so they update without a refresh:
 * "membership" when you join, ask to join or leave a community or group (crew pages show their Join button).
 */
export type AppEvent = "membership";

const TARGET = typeof window !== "undefined" ? window : null;

export function emitAppEvent(name: AppEvent) {
  TARGET?.dispatchEvent(new CustomEvent(`klique:${name}`));
}

export function useAppEvent(name: AppEvent, fn: () => void) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    const h = () => ref.current();
    window.addEventListener(`klique:${name}`, h);
    return () => window.removeEventListener(`klique:${name}`, h);
  }, [name]);
}
