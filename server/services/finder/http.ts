import "server-only";
import http from "node:http";
import https from "node:https";
import { appUrl } from "../../env";
import { assertPublicHttpUrl, safeLookup } from "../../net-guard";

/**
 * How the event finder reads other sites, politely:
 *  - it says who it is (a User-Agent with a link back to us),
 *  - it obeys robots.txt (for our name and for "*"),
 *  - it waits at least a second between requests to the same host,
 *  - it remembers what it fetched for a while, so re-running a search doesn't hit the same pages again,
 *  - it only reaches public hosts (the same SSRF guard as link previews; every redirect is re-checked).
 * No logins, cookies, paywalls or captchas: a page that needs any of that is simply skipped.
 */

export const BOT_NAME = "klique-eventbot";
export const userAgent = () => `Mozilla/5.0 (compatible; ${BOT_NAME}/1.1; +${appUrl()}/about/bot)`;

const TIMEOUT_MS = 8000;
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const HOST_GAP_MS = 1100;
const CACHE_MS = 30 * 60_000;
const ROBOTS_MS = 6 * 60 * 60_000;

export class FetchRefused extends Error {}

export interface Fetched {
  body: string;
  type: string;
  url: URL;
}

/* ------------------------- one request per host ------------------------- */

const nextSlot = new Map<string, number>();

/** Wait for this host's turn (requests to one host are at least HOST_GAP_MS apart). */
async function turn(host: string) {
  const now = Date.now();
  const at = Math.max(now, nextSlot.get(host) ?? 0);
  nextSlot.set(host, at + HOST_GAP_MS);
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

/* ------------------------------- caching ------------------------------- */

const cache = new Map<string, { at: number; value: Fetched }>();
function remember(key: string, value: Fetched) {
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), value });
}

/* ------------------------------ robots.txt ------------------------------ */

type Rules = { allow: string[]; disallow: string[] };
const robots = new Map<string, { at: number; rules: Rules | null }>();

/** The rules that apply to us: our own group if there is one, otherwise "*". */
export function parseRobots(txt: string): Rules {
  const groups: { agents: string[]; rules: Rules }[] = [];
  let cur: { agents: string[]; rules: Rules } | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: { allow: [], disallow: [] } };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === "disallow" && val) cur.rules.disallow.push(val);
    if (key === "allow" && val) cur.rules.allow.push(val);
  }
  const mine = groups.find((g) => g.agents.some((a) => a !== "*" && BOT_NAME.includes(a)));
  return (mine ?? groups.find((g) => g.agents.includes("*")))?.rules ?? { allow: [], disallow: [] };
}

const toRegex = (rule: string) => new RegExp(`^${rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$")}`);

/** The longest matching rule wins; Allow wins a tie (as Google reads it). */
export function robotsAllows(rules: Rules, path: string): boolean {
  let best = { len: -1, allow: true };
  for (const [list, allow] of [
    [rules.disallow, false],
    [rules.allow, true],
  ] as const) {
    for (const r of list) {
      if (toRegex(r).test(path) && (r.length > best.len || (r.length === best.len && allow))) best = { len: r.length, allow };
    }
  }
  return best.allow;
}

async function rulesFor(origin: URL): Promise<Rules | null> {
  const key = origin.origin;
  const hit = robots.get(key);
  if (hit && Date.now() - hit.at < ROBOTS_MS) return hit.rules;
  let rules: Rules | null = null;
  try {
    const r = await request(new URL("/robots.txt", origin), "text/plain,*/*", /./);
    rules = parseRobots(r.body);
  } catch (e) {
    // no robots.txt (404) means everything is allowed; a site that's down is retried next time
    rules = /answered 4\d\d/.test((e as Error).message) ? { allow: [], disallow: [] } : null;
  }
  robots.set(key, { at: Date.now(), rules });
  return rules;
}

/* ------------------------------- request ------------------------------- */

function request(start: URL, accept: string, okType: RegExp, redirects = 0, headers: Record<string, string> = {}): Promise<Fetched> {
  return new Promise((resolve, reject) => {
    const mod = start.protocol === "https:" ? https : http;
    const req = mod.request(start, { method: "GET", lookup: safeLookup as never, timeout: TIMEOUT_MS, headers: { "User-Agent": userAgent(), Accept: accept, "Accept-Language": "en", ...headers } }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (redirects >= MAX_REDIRECTS) return reject(new Error("Too many redirects"));
        try {
          return request(assertPublicHttpUrl(new URL(res.headers.location, start).toString()), accept, okType, redirects + 1, headers).then(resolve, reject);
        } catch (e) {
          return reject(e);
        }
      }
      if (status === 401 || status === 403) {
        res.resume();
        return reject(new FetchRefused(`The site wants a login or blocked us (${status}), so we skip it`));
      }
      if (status < 200 || status >= 300) {
        res.resume();
        return reject(new Error(`The page answered ${status}`));
      }
      const type = String(res.headers["content-type"] ?? "");
      if (!okType.test(type)) {
        res.resume();
        return reject(new Error(`Not something we can read (${type || "unknown type"})`));
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_BYTES) return res.destroy(new Error("The page is too big"));
        chunks.push(c);
      });
      res.on("end", () => resolve({ body: Buffer.concat(chunks).toString("utf8"), type, url: start }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("The site took too long to answer")));
    req.on("error", reject);
    req.end();
  });
}

/** Pages, feeds and calendars we know how to read. */
const READABLE = /text\/html|application\/xhtml|text\/calendar|application\/(rss\+|atom\+)?xml|text\/xml|application\/(ld\+)?json|text\/plain/i;

/**
 * Fetch a public page politely (robots.txt, one request per second per host, cached for half an hour).
 * `api`: an official API we have a key for (robots.txt is for crawlers, not APIs; still rate-limited).
 */
export async function politeFetch(rawUrl: string, opts: { accept?: string; api?: boolean; headers?: Record<string, string>; fresh?: boolean } = {}): Promise<Fetched> {
  const fixture = await fromFixtures(rawUrl);
  if (fixture) return fixture;
  const url = assertPublicHttpUrl(rawUrl);
  const key = url.toString();
  const hit = cache.get(key);
  if (hit && !opts.fresh && Date.now() - hit.at < CACHE_MS) return hit.value;
  if (!opts.api) {
    const rules = await rulesFor(url);
    if (rules === null) throw new Error("Couldn't read the site's robots.txt, so we didn't look");
    if (!robotsAllows(rules, url.pathname + url.search)) throw new FetchRefused("The site's robots.txt asks bots not to read this page");
  }
  await turn(url.host);
  const value = await request(url, opts.accept ?? "text/html,application/xhtml+xml,text/calendar,application/rss+xml,application/atom+xml;q=0.9,*/*;q=0.5", READABLE, 0, opts.headers);
  remember(key, value);
  return value;
}

/**
 * Tests only: with FINDER_FIXTURES_DIR set (never in production), https://fixtures.test/<path> is read from
 * that folder instead of the network, robots.txt included, so the finder can be tested without touching
 * real sites. Any other host is fetched normally.
 */
async function fromFixtures(rawUrl: string): Promise<Fetched | null> {
  const dir = process.env.FINDER_FIXTURES_DIR;
  if (!dir || process.env.NODE_ENV === "production") return null;
  const url = new URL(rawUrl);
  if (url.hostname !== "fixtures.test") return null;
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const read = async (p: string) => readFile(path.join(dir, path.normalize(p).replace(/^(\.\.[/\\])+/, "")), "utf8");
  const robotsTxt = await read("robots.txt").catch(() => "");
  if (url.pathname !== "/robots.txt" && !robotsAllows(parseRobots(robotsTxt), url.pathname)) throw new FetchRefused("The site's robots.txt asks bots not to read this page");
  const body = await read(url.pathname === "/" ? "index.html" : url.pathname).catch(() => {
    throw new Error("The page answered 404");
  });
  const type = /\.ics$/.test(url.pathname) ? "text/calendar" : /\.(xml|rss)$/.test(url.pathname) ? "application/rss+xml" : /\.json$/.test(url.pathname) ? "application/json" : "text/html; charset=utf-8";
  return { body, type, url };
}

/** Hosts we never scrape: their terms forbid it and the content sits behind logins. */
const NEVER = /(^|\.)(instagram\.com|facebook\.com|fb\.com|fb\.me|threads\.net|tiktok\.com|x\.com|twitter\.com|linkedin\.com|whatsapp\.com)$/i;
export function assertScrapable(url: URL) {
  if (NEVER.test(url.hostname)) throw new FetchRefused(`We don't read ${url.hostname.replace(/^www\./, "")}: its terms don't allow it. Add the organiser's own site or ticket page instead.`);
}
