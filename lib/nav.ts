"use client";

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
