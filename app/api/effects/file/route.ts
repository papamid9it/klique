import { r2Config } from "@/server/env";
import { CACHE_FOREVER, keyFromUrl } from "@/server/services/r2";

/**
 * A profile effect's file (Lottie .json or .lottie) from our R2 bucket, served from our own address. The player
 * reads it with fetch, which a browser only allows across sites when the bucket sends CORS headers, so this way it
 * works whatever the bucket's settings. Only our uploaded effect files: nothing else can be fetched through it.
 */
export async function GET(req: Request) {
  const src = new URL(req.url).searchParams.get("src") ?? "";
  const key = keyFromUrl(src);
  const cfg = r2Config();
  if (!cfg || !key || !/^klique\/effects\/[^?#]+\.(json|lottie)$/.test(key)) return new Response("Not found", { status: 404 });
  const res = await fetch(`${cfg.publicUrl}/${key.split("/").map(encodeURIComponent).join("/")}`, { cache: "no-store" });
  if (!res.ok || !res.body) return new Response("Not found", { status: res.status === 404 ? 404 : 502 });
  // each upload has its own random name and never changes, so browsers and the CDN may keep it for good
  return new Response(res.body, { headers: { "content-type": key.endsWith(".json") ? "application/json" : "application/zip", "cache-control": CACHE_FOREVER } });
}
