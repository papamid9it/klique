"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * Running inside the Klique desktop app (its preload sets `window.kliqueDesktop`). False on the server and while
 * hydrating, so the first render matches the server's; true right after, in the app.
 */
export function useInDesktopApp(): boolean {
  return useSyncExternalStore(
    noop,
    () => !!(window as unknown as { kliqueDesktop?: unknown }).kliqueDesktop,
    () => false,
  );
}
