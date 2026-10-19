import "server-only";

/**
 * External cache (Redis over HTTP) with a quiet in-memory fallback.
 *
 * Why Upstash and not a normal Redis socket: its REST API works from serverless functions,
 * long-running servers and edge runtimes alike, and the free plan is plenty for now.
 * Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (Vercel KV's KV_REST_API_* names also work).
 * Without them everything still works, just per server process (fine for development).
 *
 * Used for: rate limits shared by every server instance, and short-lived copies of hot anonymous reads.
 * The cache can never make a request fail: any Redis error falls back to the real work.
 */
const url = () => (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "").trim().replace(/\/$/, "");
const token = () => (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "").trim();

export const cacheConfigured = () => !!url() && !!token();

type Cmd = (string | number)[];
const PREFIX = "klique:";
let warned = false;

/** Run commands in one round trip. Returns null when Redis is off or unreachable. */
async function pipeline(commands: Cmd[]): Promise<unknown[] | null> {
  if (!cacheConfigured()) return null;
  try {
    const res = await fetch(`${url()}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()) as { result?: unknown; error?: string }[];
    if (rows.some((r) => r.error)) throw new Error(rows.find((r) => r.error)?.error);
    return rows.map((r) => r.result);
  } catch (err) {
    if (!warned) {
      warned = true;
      console.warn("[cache] Redis unavailable, using in-memory fallback:", (err as Error)?.message);
    }
    return null;
  }
}

/* ----------------------------- in-memory fallback ----------------------------- */

const mem = new Map<string, { expires: number; value: string }>();
const MAX_MEM = 500;

function memGet(key: string): string | null {
  const hit = mem.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    mem.delete(key);
    return null;
  }
  return hit.value;
}
function memSet(key: string, value: string, ttlSec: number) {
  if (mem.size >= MAX_MEM) mem.delete(mem.keys().next().value as string);
  mem.set(key, { value, expires: Date.now() + ttlSec * 1000 });
}

/* --------------------------------- public API --------------------------------- */

export async function cacheGet<T>(key: string): Promise<T | null> {
  const k = PREFIX + key;
  const out = await pipeline([["GET", k]]);
  const raw = out ? (out[0] as string | null) : memGet(k);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSec: number): Promise<void> {
  const k = PREFIX + key;
  const raw = JSON.stringify(value);
  if (raw.length > 400_000) return; // never park huge payloads
  const out = await pipeline([["SET", k, raw, "EX", ttlSec]]);
  if (!out) memSet(k, raw, ttlSec);
}

export async function cacheDel(...keys: string[]): Promise<void> {
  const out = await pipeline(keys.map((k) => ["DEL", PREFIX + k]));
  if (!out) for (const k of keys) mem.delete(PREFIX + k);
}

/**
 * Cached result of `fn` for `ttlSec` seconds. `namespace` is a version group: calling `bump(namespace)` after a write
 * makes every entry in it miss at once (cheaper than tracking keys).
 */
export async function remember<T>(namespace: string, key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
  const v = await version(namespace);
  const full = `${namespace}:${v}:${key}`;
  const hit = await cacheGet<{ v: T }>(full);
  if (hit) return hit.v;
  const value = await fn();
  void cacheSet(full, { v: value }, ttlSec);
  return value;
}

async function version(namespace: string): Promise<string> {
  const k = `${PREFIX}ver:${namespace}`;
  const out = await pipeline([["GET", k]]);
  const raw = out ? (out[0] as string | null) : memGet(k);
  return raw ?? "0";
}

/** Invalidate everything cached under `namespace`. */
export async function bump(namespace: string): Promise<void> {
  const k = `${PREFIX}ver:${namespace}`;
  const out = await pipeline([["INCR", k], ["EXPIRE", k, 7 * 24 * 3600]]);
  if (!out) memSet(k, String(Date.now()), 7 * 24 * 3600);
}

/**
 * Fixed-window counter shared by every server instance. Returns how many hits are in the current window and
 * how long until it resets, or null when Redis is off (callers then use the in-memory limiter).
 */
export async function hitWindow(key: string, windowMs: number): Promise<{ count: number; resetMs: number } | null> {
  const k = PREFIX + "rl:" + key;
  const out = await pipeline([["INCR", k], ["PTTL", k]]);
  if (!out) return null;
  const count = Number(out[0]);
  let ttl = Number(out[1]);
  if (count === 1 || ttl < 0) {
    await pipeline([["PEXPIRE", k, windowMs]]);
    ttl = windowMs;
  }
  return { count, resetMs: ttl };
}
