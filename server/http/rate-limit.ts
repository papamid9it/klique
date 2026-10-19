import { hitWindow } from "../cache";
import { ApiError } from "./errors";

/**
 * Small in-memory sliding-window limiter, used for per-person action limits inside services and as the
 * fallback when no shared cache is configured.
 */
const hits = new Map<string, number[]>();
let lastSweep = Date.now();

const tooMany = (seconds: number) =>
  new ApiError(429, `Too many attempts. Please wait ${Math.max(1, seconds)}s and try again.`, { code: "rate_limited" });

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();

  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, v] of hits) {
      if (!v.length || now - v[v.length - 1] > 10 * 60_000) hits.delete(k);
    }
  }

  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) throw tooMany(Math.ceil((windowMs - (now - recent[0])) / 1000));
  recent.push(now);
  hits.set(key, recent);
}

/**
 * Same rule, but counted in the shared cache (Redis) so every server instance sees the same numbers.
 * Falls back to the in-memory limiter when the cache isn't configured or is unreachable.
 */
export async function rateLimitShared(key: string, limit: number, windowMs: number) {
  const shared = await hitWindow(key, windowMs);
  if (!shared) return rateLimit(key, limit, windowMs);
  if (shared.count > limit) throw tooMany(Math.ceil(shared.resetMs / 1000));
}
