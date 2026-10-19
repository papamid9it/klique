import { lookup as dnsLookup } from "node:dns";
import { isIP } from "node:net";

/**
 * SSRF defence for anything that fetches a URL on a user's behalf (link previews).
 * Only public http(s) hosts on standard ports are allowed, every resolved address is checked, and
 * the validated address is the one actually connected to (see `safeLookup`), which defeats DNS rebinding.
 */

/** True for any address that is not a normal public internet address. */
export function isBlockedAddress(addr: string): boolean {
  const ip = addr.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const kind = isIP(ip);
  if (kind === 4) return isBlockedV4(ip);
  if (kind === 6) {
    if (ip === "::" || ip === "::1") return true;
    // IPv4-mapped / compatible (::ffff:a.b.c.d or its hex form)
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/) ?? ip.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedV4(mapped[1]);
    const hexMapped = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexMapped) {
      const hi = parseInt(hexMapped[1], 16);
      const lo = parseInt(hexMapped[2], 16);
      return isBlockedV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    const first = parseInt(ip.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    if (ip.startsWith("64:ff9b:")) return true; // NAT64
    if (ip.startsWith("2001:db8:")) return true; // documentation
    if (ip.startsWith("2002:")) return true; // 6to4 can wrap private v4
    return false;
  }
  return true; // not an IP at all
}

function isBlockedV4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0) return true; // 192.0.0.0/24, 192.0.2.0/24
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51) return true;
  if (a === 203 && b === 0) return true;
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

export class UnsafeUrlError extends Error {}

/** Parse and vet a URL before any network access. Returns the normalised URL. */
export function assertPublicHttpUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeUrlError("Not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeUrlError("Only http(s) links can be previewed.");
  if (url.username || url.password) throw new UnsafeUrlError("Links with credentials aren't allowed.");
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (port !== 80 && port !== 443) throw new UnsafeUrlError("Unusual ports aren't allowed.");
  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".") && isIP(host.replace(/^\[|\]$/g, "")) === 0) {
    throw new UnsafeUrlError("That host isn't allowed.");
  }
  if (isIP(host.replace(/^\[|\]$/g, "")) && isBlockedAddress(host)) throw new UnsafeUrlError("That address isn't allowed.");
  return url;
}

/** `lookup` for http(s).request: resolves, rejects any non-public answer, connects only to a vetted address. */
export function safeLookup(hostname: string, options: unknown, callback: (err: Error | null, address?: unknown, family?: number) => void) {
  const all = typeof options === "object" && options !== null && (options as { all?: boolean }).all === true;
  dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = Array.isArray(addresses) ? addresses : [];
    if (!list.length || list.some((a) => isBlockedAddress(a.address))) return callback(new UnsafeUrlError("That host isn't allowed."));
    if (all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}
