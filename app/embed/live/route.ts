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
  // Twitch: its player script, which says the moment video is playing; the app hides its "Starting the stream…"
  // cover then (a message to the app's web view). Without the script, the plain player. YouTube: its player.
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const tell = `function tell(m){try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(m)}catch(e){}}`;
  const body =
    p === "twitch"
      ? `<div id="p"></div><div id="sp"><i></i></div><script>${tell}var c=${JSON.stringify(c)},h=${JSON.stringify(host)};function plain(){document.getElementById("p").innerHTML='<iframe src="${esc(src)}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>';setTimeout(function(){tell("playing")},2500)}var s=document.createElement("script");s.src="https://player.twitch.tv/js/embed/v1.js";s.onload=function(){try{var pl=new Twitch.Player("p",{channel:c,parent:[h],width:"100%",height:"100%",autoplay:true,muted:false});var sp=document.getElementById("sp");pl.addEventListener(Twitch.Player.PLAYING,function(){tell("playing");sp.style.display="none"});pl.addEventListener(Twitch.Player.PLAY,function(){sp.style.display="flex"});pl.addEventListener(Twitch.Player.PAUSE,function(){sp.style.display="none"})}catch(e){plain()}};s.onerror=plain;document.head.appendChild(s)</script>`
      : `<iframe src="${esc(src)}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen onload="setTimeout(function(){tell('playing')},1500)"></iframe><script>${tell}</script>`;
  const html = `<!doctype html><html style="background:#000;color-scheme:dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="strict-origin-when-cross-origin"><title>Live</title><link rel="preconnect" href="https://player.twitch.tv"><style>html,body,#p{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%;display:block;background:#000}#sp{position:fixed;inset:0;display:none;align-items:center;justify-content:center;pointer-events:none}#sp i{width:36px;height:36px;border-radius:50%;border:3px solid rgba(255,255,255,.3);border-top-color:#fff;animation:r .8s linear infinite}@keyframes r{to{transform:rotate(360deg)}}</style></head><body>${body}</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Frame-Options": "SAMEORIGIN" } });
}
