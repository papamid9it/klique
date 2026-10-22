"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * False while this component is being hydrated (and on the server), true right after and for every later
 * render. Per component, so it's correct even for a part of the page that hydrates late (inside Suspense):
 * use it to render exactly what the server sent first, then what only the browser knows (a remembered
 * place, the time "now").
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
