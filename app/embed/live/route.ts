import type { NextRequest } from "next/server";

/**
 * The live player alone, for the phone app's web view: Twitch's player only plays inside a page on a site it's told
 * about (parent=), so the app shows this page instead of Twitch's player directly. YouTube's plays here too.
 * ?p=twitch&c=<channel login> or ?p=youtube&c=<video id>. Nothing else is accepted.
 */
export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const p = q.get("p");
  const c = q.get("c") ?? "";
  const host = req.nextUrl.hostname;
  let src: string | null = null;
  if (p === "twitch" && /^[A-Za-z0-9_]{2,25}$/.test(c)) src = `https://player.twitch.tv/?${new URLSearchParams({ channel: c, parent: host, autoplay: "true", muted: "false" })}`;
  else if (p === "youtube" && /^[A-Za-z0-9_-]{11}$/.test(c)) src = `https://www.youtube.com/embed/${c}?autoplay=1&playsinline=1`;
  if (!src) return new Response("Not found", { status: 404 });
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="strict-origin-when-cross-origin"><title>Live</title><style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%;display:block}</style></head><body><iframe src="${src.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Frame-Options": "SAMEORIGIN" } });
}
