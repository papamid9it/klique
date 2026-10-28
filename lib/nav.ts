"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

/**
 * Change the URL's query on the page you're already on without asking the server for anything.
 * Next.js picks up pushState/replaceState, so useSearchParams updates and the view follows at once,
 * keeping every list, scroll position and draft in place (the way switching channels feels in Discord).
 */
export function softNavigate(href: string, { replace = false }: { replace?: boolean } = {}) {
  if (typeof window === "undefined") return;
  if (replace) window.history.replaceState(null, "", href);
  else window.history.pushState(null, "", href);
}

/** True when `href` points at the page currently open (same path), so only its query changes. */
export function isSamePage(href: string): boolean {
  if (typeof window === "undefined") return false;
  const url = new URL(href, window.location.href);
  return url.origin === window.location.origin && url.pathname === window.location.pathname;
}

/* While a post is open over a page, the address is the post's own link (/p/[id]), but the page underneath hasn't
   changed: layouts ask for the page's path, so nothing behind the pop-up moves. */
let underneath: string | null = null;
const listeners = new Set<() => void>();
export function setPathUnderneath(path: string | null) {
  underneath = path;
  listeners.forEach((f) => f());
}
const subscribe = (f: () => void) => (listeners.add(f), () => void listeners.delete(f));

/** The path of the page on screen: usePathname, or the page under an open post's link. */
export function usePagePath(): string {
  const pathname = usePathname();
  return useSyncExternalStore(subscribe, () => underneath, () => null) ?? pathname;
}
