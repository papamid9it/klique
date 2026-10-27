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

/** Off-site: a web link to another host. Relative links, same-site links and mailto:/tel: aren't. */
export function isExternalHref(href: string): boolean {
  if (typeof window === "undefined") return /^https?:\/\//i.test(href);
  try {
    const u = new URL(href, window.location.href);
    return (u.protocol === "http:" || u.protocol === "https:") && u.host !== window.location.host;
  } catch {
    return false;
  }
}
