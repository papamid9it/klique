import type { NextRequest } from "next/server";

/**
 * The live player alone, for the phone app's web view. Neither shows its own controls: for YouTube the app draws its
 * own (play/pause, Go to live, sound), calling window.__play, __pause, __live, __mute and __unmute, and the page says
 * "yt:<playing|paused>:<behind 0|1>:<muted 0|1>" whenever that changes. Twitch's never stays paused. Nothing in the page scrolls. When the phone won't start a video with sound it plays
 * muted instead (telling the app "blocked", which shows Tap for sound, and
 * calls window.__unmute when tapped).
 * Twitch's player only plays inside a page on a site it's told
 * about (parent=), so the app shows this page instead of Twitch's player directly. YouTube's plays here too.
 * ?p=twitch&c=<channel login> or ?p=youtube&c=<video id>. Nothing else is accepted. The app adds the class "fill" to the
 * body in its full-screen layout: an upright stream then fills the whole card (trimming a sliver off the sides) instead
 * of leaving black strips above and below.
 */
export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const p = q.get("p");
  const c = q.get("c") ?? "";
  const host = req.nextUrl.hostname;
  let src: string | null = null;
  if (p === "twitch" && /^[A-Za-z0-9_]{2,25}$/.test(c)) src = `https://player.twitch.tv/?${new URLSearchParams({ channel: c, parent: host, autoplay: "true", muted: "false" })}`;
  // YouTube without its own controls, "more videos", info cards or full-screen button (the app draws its own controls)
  else if (p === "youtube" && /^[A-Za-z0-9_-]{11}$/.test(c)) src = `https://www.youtube.com/embed/${c}?autoplay=1&playsinline=1&controls=0&rel=0&iv_load_policy=3&disablekb=1&fs=0`;
  if (!src) return new Response("Not found", { status: 404 });
  // Twitch: its player script, which says the moment video is playing; the app hides its "Starting the stream…"
  // cover then (a message to the app's web view). Without the script, the plain player. YouTube: its player.
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const tell = `function tell(m){try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(m)}catch(e){}}`;
  const body =
    p === "twitch"
      ? `<div id="p"></div><div id="sp"><i></i></div><script>${tell}var c=${JSON.stringify(c)},h=${JSON.stringify(host)};function plain(){document.getElementById("p").innerHTML='<iframe src="${esc(src)}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>';setTimeout(function(){tell("playing")},2500)}var s=document.createElement("script");s.src="https://player.twitch.tv/js/embed/v1.js";s.onload=function(){try{var pl=new Twitch.Player("p",{channel:c,parent:[h],width:"100%",height:"100%",autoplay:true,muted:false,controls:false});window.__unmute=function(){try{pl.setMuted(false);pl.setVolume(1);pl.play()}catch(x){}};if(Twitch.Player.PLAYBACK_BLOCKED)pl.addEventListener(Twitch.Player.PLAYBACK_BLOCKED,function(){try{pl.setMuted(true);pl.play()}catch(x){}tell("blocked")});var sp=document.getElementById("sp"),mv=false,st;function spin(){if(mv)return;sp.style.display="flex";clearTimeout(st);st=setTimeout(function(){sp.style.display="none"},12000)}pl.addEventListener(Twitch.Player.PLAYING,function(){mv=true;tell("playing");sp.style.display="none"});pl.addEventListener(Twitch.Player.PLAY,spin);pl.addEventListener(Twitch.Player.PAUSE,function(){mv=false;sp.style.display="none";setTimeout(function(){try{pl.play()}catch(x){}},300)});window.addEventListener("blur",function(){setTimeout(function(){var a=document.activeElement;if(a&&a.tagName==="IFRAME"){spin();setTimeout(function(){a.blur()},50)}},0)})}catch(e){plain()}};s.onerror=plain;document.head.appendChild(s)</script>`
      : // YouTube's player script says when the picture really starts (the app counts you as watching from then);
        // without it, the plain player and a guess a moment after it loads
        `<div id="p"></div><script>${tell}var v=${JSON.stringify(c)},done=false;function playing(){if(!done){done=true;tell("playing")}}function plain(){document.getElementById("p").innerHTML='<iframe src="${esc(src)}" allow="autoplay; encrypted-media" onload="setTimeout(function(){tell(&quot;playing&quot;)},1500)"></iframe>'}window.onYouTubeIframeAPIReady=function(){try{var yp=new YT.Player("p",{videoId:v,width:"100%",height:"100%",playerVars:{autoplay:1,playsinline:1,controls:0,rel:0,iv_load_policy:3,disablekb:1,fs:0},events:{onAutoplayBlocked:function(e){try{e.target.mute();e.target.playVideo()}catch(x){}tell("blocked")},onReady:function(e){var t=e.target;window.__unmute=function(){try{t.unMute();t.setVolume(100);t.playVideo()}catch(x){}};window.__mute=function(){try{t.mute()}catch(x){}};window.__play=function(){try{t.playVideo()}catch(x){}};window.__pause=function(){try{t.pauseVideo()}catch(x){}};window.__live=function(){try{t.seekTo(t.getDuration(),true);t.playVideo()}catch(x){}};var last="";setInterval(function(){try{var st=t.getPlayerState(),behind=t.getDuration()-t.getCurrentTime()>20?1:0,m=t.isMuted()?1:0,k="yt:"+(st===2?"paused":"playing")+":"+behind+":"+m;if(k!==last){last=k;tell(k)}}catch(x){}},1000);try{t.playVideo()}catch(x){}},onStateChange:function(e){if(e.data===1)playing()}}})}catch(x){plain()}};var s=document.createElement("script");s.src="https://www.youtube.com/iframe_api";s.onerror=plain;document.head.appendChild(s);setTimeout(function(){if(!window.YT||!window.YT.Player)plain()},8000)</script>`;
  const html = `<!doctype html><html style="background:#000;color-scheme:dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="strict-origin-when-cross-origin"><title>Live</title><link rel="preconnect" href="https://player.twitch.tv"><style>html,body,#p{margin:0;height:100%;background:#000;overflow:hidden}::-webkit-scrollbar{display:none}iframe{border:0;width:100%;height:100%;display:block;background:#000}body.fill{position:relative;overflow:hidden}body.fill iframe{position:absolute;left:50%;top:50%;width:max(100vw,calc(100vh*9/16));height:max(100vh,calc(100vw*16/9));transform:translate(-50%,-50%)}#sp{position:fixed;inset:0;display:none;align-items:center;justify-content:center;pointer-events:none}#sp i{width:36px;height:36px;border-radius:50%;border:3px solid rgba(255,255,255,.3);border-top-color:#fff;animation:r .8s linear infinite}@keyframes r{to{transform:rotate(360deg)}}</style></head><body>${body}</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Frame-Options": "SAMEORIGIN" } });
}
