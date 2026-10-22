import "server-only";
import { AwsClient } from "aws4fetch";
import { r2Config } from "../env";

/**
 * Cloudflare R2 through its S3-compatible API. Only this file talks to it: signed upload links for the
 * browser, deletes, and listing for the nightly clean-up. The secret key never leaves the server.
 */

type Config = NonNullable<ReturnType<typeof r2Config>>;
let cached: { key: string; client: AwsClient } | null = null;

function client(cfg: Config) {
  const key = `${cfg.accessKeyId}:${cfg.secretAccessKey}`;
  if (!cached || cached.key !== key) cached = { key, client: new AwsClient({ accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, service: "s3", region: "auto" }) };
  return cached.client;
}

const objectUrl = (cfg: Config, key: string) => `${cfg.endpoint}/${cfg.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

export const publicUrlFor = (cfg: Config, key: string) => `${cfg.publicUrl}/${key}`;

/** The object key for one of our public URLs (null for anything that isn't ours). */
export function keyFromUrl(url: string): string | null {
  const cfg = r2Config();
  if (!cfg) return null;
  const clean = url.split(/[?#]/)[0];
  if (!clean.startsWith(`${cfg.publicUrl}/`)) return null;
  const key = decodeURIComponent(clean.slice(cfg.publicUrl.length + 1));
  return key.startsWith("klique/") ? key : null;
}

export const CACHE_FOREVER = "public, max-age=31536000, immutable";

/**
 * A link the device can PUT exactly one file to, for 10 minutes. The type, the exact size and the cache header are
 * part of the signature, so the device can't send something bigger or different from what was approved.
 */
export async function presignPut(key: string, contentType: string, size: number): Promise<{ url: string; headers: Record<string, string> }> {
  const cfg = r2Config();
  if (!cfg) throw new Error("R2 isn't configured");
  const u = new URL(objectUrl(cfg, key));
  u.searchParams.set("X-Amz-Expires", "600");
  const headers = { "Content-Type": contentType, "Content-Length": String(size), "Cache-Control": CACHE_FOREVER };
  const signed = await client(cfg).sign(new Request(u, { method: "PUT", headers }), { aws: { signQuery: true, allHeaders: true } });
  // browsers set Content-Length themselves from the body; it still has to match the signed value
  return { url: signed.url, headers: { "Content-Type": contentType, "Cache-Control": CACHE_FOREVER } };
}

export async function deleteObject(key: string): Promise<void> {
  const cfg = r2Config();
  if (!cfg) return;
  const res = await client(cfg).fetch(objectUrl(cfg, key), { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`R2 delete ${key} failed (${res.status})`);
}

/** Every object under a prefix, with when it was written. */
export async function listObjects(prefix: string): Promise<{ key: string; lastModified: number; size: number }[]> {
  const cfg = r2Config();
  if (!cfg) return [];
  const out: { key: string; lastModified: number; size: number }[] = [];
  let token: string | null = null;
  do {
    const u = new URL(`${cfg.endpoint}/${cfg.bucket}`);
    u.searchParams.set("list-type", "2");
    u.searchParams.set("prefix", prefix);
    u.searchParams.set("max-keys", "1000");
    if (token) u.searchParams.set("continuation-token", token);
    const res = await client(cfg).fetch(u.toString());
    if (!res.ok) throw new Error(`R2 listing failed (${res.status})`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const block = m[1];
      const key = /<Key>([\s\S]*?)<\/Key>/.exec(block)?.[1];
      const lm = /<LastModified>([\s\S]*?)<\/LastModified>/.exec(block)?.[1];
      const size = Number(/<Size>(\d+)<\/Size>/.exec(block)?.[1] ?? 0);
      if (key) out.push({ key: key.replace(/&amp;/g, "&"), lastModified: lm ? Date.parse(lm) : 0, size });
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? (/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1] ?? null) : null;
  } while (token);
  return out;
}
