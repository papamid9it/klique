/**
 * Links people type and links that leave Klique.
 */

/** "zoom.us/j/1" -> "https://zoom.us/j/1". Empty stays empty; anything that isn't http(s) after that is left as typed. */
export function normalizeLink(v: string): string {
  const t = v.trim();
  if (!t) return "";
  return /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
}

/** A link the server will take: http(s), no spaces, at most 500 characters. */
export function isHttpLink(v: string): boolean {
  return v.length <= 500 && /^https?:\/\/[^\s]+$/i.test(v);
}

/** "www.eventbrite.com" -> "eventbrite.com"; null when it isn't a web link. */
export function domainOf(href: string): string | null {
  try {
    const u = new URL(href);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Klique's own domain: getklique.app, www.getklique.app and any *.getklique.app. */
const OWN_ROOT = "getklique.app";
const bare = (host: string) => host.toLowerCase().replace(/^www\./, "");
const appHost = (() => {
  try {
    return bare(new URL(process.env.NEXT_PUBLIC_APP_URL ?? "").hostname);
  } catch {
    return "";
  }
})();

/**
 * Klique itself: getklique.app with or without www, any *.getklique.app, the site's configured address
 * (NEXT_PUBLIC_APP_URL) and wherever this page is open (a preview or local copy). Ports don't matter.
 */
export function isOwnHost(hostname: string): boolean {
  const h = bare(hostname);
  if (!h) return false;
  if (h === OWN_ROOT || h.endsWith(`.${OWN_ROOT}`) || (appHost && h === appHost)) return true;
  return typeof window !== "undefined" && h === bare(window.location.hostname);
}

/**
 * A link to a page of this app (same site, any of its own addresses) as an in-app path ("/c/lagos?x=1#y"), so it
 * can open with the router instead of a reload or a new tab; null for anything else. Other *.getklique.app hosts
 * (downloads…) aren't pages of the app, and /api/ addresses aren't pages either.
 */
export function inAppPath(href: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const u = new URL(href, window.location.href);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const h = bare(u.hostname);
    const page = h === bare(window.location.hostname) || h === OWN_ROOT || (appHost && h === appHost);
    if (!page || u.pathname.startsWith("/api/")) return null;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return null;
  }
}

/** Off-site: a web link to another host. Relative links, Klique's own addresses (see isOwnHost) and mailto:/tel: aren't. */
export function isExternalHref(href: string): boolean {
  if (typeof window === "undefined") {
    try {
      const u = new URL(href);
      return (u.protocol === "http:" || u.protocol === "https:") && !isOwnHost(u.hostname);
    } catch {
      return false;
    }
  }
  try {
    const u = new URL(href, window.location.href);
    return (u.protocol === "http:" || u.protocol === "https:") && !isOwnHost(u.hostname);
  } catch {
    return false;
  }
}
