"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(display-mode: standalone), (display-mode: window-controls-overlay)";

/** Running as Klique installed from the browser (its own window, or a home-screen app). False on the server. */
export function isInstalledWebApp(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.(QUERY).matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function useInstalledWebApp(): boolean {
  return useSyncExternalStore(
    (fn) => {
      const m = window.matchMedia?.(QUERY);
      m?.addEventListener?.("change", fn);
      return () => m?.removeEventListener?.("change", fn);
    },
    isInstalledWebApp,
    () => false,
  );
}
