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

/*
 * "Back" inside Klique: how deep this tab's history was when Klique first opened in it. A page reached by moving around
 * Klique sits deeper than that, so Back can step back to it; a page opened straight from a link can't, so Back goes to
 * a sensible page instead (rather than out to another site). A new tab starts again.
 */
const ENTRY_KEY = "klique:entry-depth";
if (typeof window !== "undefined") {
  try {
    if (!sessionStorage.getItem(ENTRY_KEY)) sessionStorage.setItem(ENTRY_KEY, String(window.history.length));
  } catch {
    /* storage blocked: Back always uses the fallback */
  }
}
/** Back to the previous Klique page, or to `fallback` when there isn't one. */
export function goBack(router: { back: () => void; push: (href: string) => void }, fallback: string) {
  let entry = Infinity;
  try {
    entry = Number(sessionStorage.getItem(ENTRY_KEY)) || Infinity;
  } catch {
    /* fallback */
  }
  if (window.history.length > entry) router.back();
  else router.push(fallback);
}
