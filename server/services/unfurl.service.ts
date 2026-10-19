import { createHash } from "node:crypto";
import http from "node:http";
import https from "node:https";
import type { LinkPreviewDTO } from "@/lib/types";
import { rateLimit } from "../http/rate-limit";
import { LinkPreview, type ILinkPreview } from "../models/LinkPreview";
import type { IUser } from "../models/User";
import { assertPublicHttpUrl, safeLookup, UnsafeUrlError } from "../net-guard";
import { badRequest } from "../http/errors";
import { sid } from "./helpers";

const TIMEOUT_MS = 5000;
const MAX_BYTES = 400 * 1024;
const MAX_REDIRECTS = 3;
const FAIL_TTL_MS = 60 * 60 * 1000;

/* ------------------------------ parsing ----------------------------- */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(s: string): string {
  return s
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function metaTags(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = new Map<string, string>();
    for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs.set(m[1].toLowerCase(), m[2] ?? m[3] ?? "");
    const key = (attrs.get("property") ?? attrs.get("name") ?? "").toLowerCase();
    const content = attrs.get("content");
    if (key && content && !out.has(key)) out.set(key, decode(content));
  }
  return out;
}

const httpOnly = (value: string | undefined, base: URL): string | null => {
  if (!value) return null;
  try {
    const u = new URL(value, base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString().slice(0, 1000) : null;
  } catch {
    return null;
  }
};

/** Pull OpenGraph / Twitter-card data out of a page's HTML. Pure, so it can be tested without a network. */
export function parseOpenGraph(html: string, pageUrl: URL): Omit<LinkPreviewDTO, "url"> {
  const head = html.split(/<\/head>/i)[0] ?? html;
  const meta = metaTags(head);
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const video = httpOnly(meta.get("og:video:secure_url") ?? meta.get("og:video:url") ?? meta.get("og:video"), pageUrl);
  const videoType = (meta.get("og:video:type") ?? "").toLowerCase();
  const isFile = !!video && (/^video\/(mp4|webm|ogg)/.test(videoType) || /\.(mp4|webm|ogv|m4v)(\?|#|$)/i.test(video));
  return {
    siteName: (meta.get("og:site_name") ?? pageUrl.hostname.replace(/^www\./, "")).slice(0, 120),
    title: (meta.get("og:title") ?? meta.get("twitter:title") ?? (titleTag ? decode(titleTag) : "")).slice(0, 300),
    description: (meta.get("og:description") ?? meta.get("twitter:description") ?? meta.get("description") ?? "").slice(0, 500),
    image: httpOnly(meta.get("og:image:secure_url") ?? meta.get("og:image") ?? meta.get("twitter:image") ?? meta.get("twitter:image:src"), pageUrl),
    videoUrl: isFile ? video : null,
  };
}

/* ------------------------------ fetching ---------------------------- */

function fetchHtml(start: URL, redirects = 0): Promise<{ html: string; url: URL }> {
  return new Promise((resolve, reject) => {
    const mod = start.protocol === "https:" ? https : http;
    const req = mod.request(
      start,
      {
        method: "GET",
        lookup: safeLookup as never,
        timeout: TIMEOUT_MS,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; klique-linkbot/1.0)", Accept: "text/html,application/xhtml+xml", "Accept-Language": "en" },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirects >= MAX_REDIRECTS) return reject(new Error("Too many redirects"));
          try {
            const next = assertPublicHttpUrl(new URL(res.headers.location, start).toString()); // re-vet every hop
            return fetchHtml(next, redirects + 1).then(resolve, reject);
          } catch (e) {
            return reject(e);
          }
        }
        if (status < 200 || status >= 300) {
          res.resume();
          return reject(new Error(`HTTP ${status}`));
        }
        if (!/text\/html|application\/xhtml/i.test(String(res.headers["content-type"] ?? ""))) {
          res.resume();
          return reject(new Error("Not an HTML page"));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          chunks.push(c);
          if (size > MAX_BYTES || /<\/head>/i.test(c.toString("latin1"))) res.destroy(); // the head is all we need
        });
        const done = () => resolve({ html: Buffer.concat(chunks).toString("utf8"), url: start });
        res.on("end", done);
        res.on("close", done);
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("Timed out")));
    req.on("error", reject);
    req.end();
  });
}

/* ------------------------------ service ----------------------------- */

const toDto = (url: string, p: ILinkPreview): LinkPreviewDTO => ({ url, siteName: p.siteName, title: p.title, description: p.description, image: p.image, videoUrl: p.videoUrl });

/**
 * OpenGraph preview for a pasted link. Signed-in users only (this fetches the open internet on their
 * behalf), rate limited, cached, and restricted to public http(s) hosts. Returns null when there is nothing to show.
 */
export async function unfurl(viewer: IUser, rawUrl: string): Promise<LinkPreviewDTO | null> {
  rateLimit(`unfurl:${sid(viewer._id)}`, 40, 60_000);
  let url: URL;
  try {
    url = assertPublicHttpUrl(rawUrl);
  } catch (e) {
    throw badRequest(e instanceof UnsafeUrlError ? e.message : "That link can't be previewed.");
  }
  url.hash = "";
  const key = url.toString();
  const urlHash = createHash("sha256").update(key).digest("hex");

  const cached = await LinkPreview.findOne({ urlHash }).lean<ILinkPreview>();
  if (cached) {
    if (cached.ok) return toDto(key, cached);
    if (Date.now() - cached.fetchedAt.getTime() < FAIL_TTL_MS) return null;
  }

  try {
    const { html, url: finalUrl } = await fetchHtml(url);
    const og = parseOpenGraph(html, finalUrl);
    const useful = !!(og.title || og.description || og.image || og.videoUrl);
    const doc = { urlHash, url: key, ok: useful, ...og, fetchedAt: new Date() };
    await LinkPreview.updateOne({ urlHash }, { $set: doc }, { upsert: true });
    return useful ? { url: key, ...og } : null;
  } catch {
    await LinkPreview.updateOne({ urlHash }, { $set: { urlHash, url: key, ok: false, siteName: "", title: "", description: "", image: null, videoUrl: null, fetchedAt: new Date() } }, { upsert: true });
    return null;
  }
}
