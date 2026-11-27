"use client";

import { useEffect, useRef, useState } from "react";
import { preconnect } from "react-dom";
import { livePlayerUrl } from "@/app/services/LiveService";
import type { LiveDTO } from "@/lib/types";
import { Icon } from "@/components/ui/Icon";

/** Twitch's player script (its own CDN): tells us the moment video is actually playing */
const TWITCH_JS = "https://player.twitch.tv/js/embed/v1.js";
/** the cover goes after this long whatever happens (the player shows its own state from then) */
const COVER_MAX_MS = 15_000;

type TwitchPlayer = { addEventListener: (e: string, fn: () => void) => void; destroy?: () => void; setMuted?: (m: boolean) => void; setVolume?: (v: number) => void; play?: () => void };
type TwitchNS = { Player: (new (el: HTMLElement, opts: Record<string, unknown>) => TwitchPlayer) & { PLAYING: string; READY: string; PLAY: string; PAUSE: string } };

let twitchScript: Promise<TwitchNS | null> | null = null;
function loadTwitch(): Promise<TwitchNS | null> {
  const w = window as unknown as { Twitch?: TwitchNS };
  if (w.Twitch?.Player) return Promise.resolve(w.Twitch);
  return (twitchScript ??= new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = TWITCH_JS;
    s.async = true;
    s.onload = () => resolve(w.Twitch ?? null);
    s.onerror = () => {
      twitchScript = null;
      resolve(null);
    };
    document.head.appendChild(s);
  }));
}

/** Connect to Twitch or YouTube early (someone's live here), so Watch starts faster. */
export function warmLivePlayer(provider: LiveDTO["provider"]) {
  if (provider === "twitch") {
    preconnect("https://player.twitch.tv");
    preconnect("https://static.twitchcdn.net");
    preconnect("https://usher.ttvnw.net");
  } else {
    preconnect("https://www.youtube.com");
    preconnect("https://i.ytimg.com");
  }
}

/**
 * The stream itself: Twitch's player (through its script, which says when video is really playing) or YouTube's.
 * Until it plays, a black cover with "Starting the stream…" sits over it, so there's no white flash and no blank
 * black box; it fades out the moment the picture starts (or after 15 seconds, whatever happens).
 */
export function LivePlayer({ live, poster, onStarted }: { live: Pick<LiveDTO, "id" | "provider" | "channel" | "title">; poster?: string | null; /** the picture really started (not the cover's time-out): count them as watching from here */ onStarted?: () => void }) {
  const started = useRef(onStarted);
  started.current = onStarted;
  const box = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [host, setHost] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  // pressed Play (or it's catching up): a spinner over the picture until it moves again
  const [buffering, setBuffering] = useState(false);
  // browsers only start video by itself when it's muted: it starts muted, and "Tap for sound" turns it on
  const [muted, setMuted] = useState(true);
  const playerRef = useRef<TwitchPlayer | null>(null);
  // the picture is moving right now (Twitch says so); a tap into the player while it isn't shows the spinner at once
  const moving = useRef(false);
  useEffect(() => setHost(window.location.hostname), []);
  useEffect(() => {
    const t = window.setTimeout(() => setPlaying(true), COVER_MAX_MS);
    return () => window.clearTimeout(t);
  }, [live.id]);

  // Twitch: its player, built by its script; without the script, its plain embed
  useEffect(() => {
    const el = box.current;
    if (live.provider !== "twitch" || !host || fallback || !el) return;
    let player: TwitchPlayer | null = null;
    let dead = false;
    void loadTwitch().then((T) => {
      if (dead) return;
      if (!T) return setFallback(true);
      el.innerHTML = "";
      player = new T.Player(el, { channel: live.channel, parent: [host], width: "100%", height: "100%", autoplay: true, muted: true });
      playerRef.current = player;
      player.addEventListener(T.Player.PLAYING, () => {
        started.current?.();
        moving.current = true;
        setPlaying(true);
        setBuffering(false);
      });
      player.addEventListener(T.Player.PLAY, () => !moving.current && setBuffering(true));
      player.addEventListener(T.Player.PAUSE, () => {
        moving.current = false;
        setBuffering(false);
      });
    });
    return () => {
      dead = true;
      player?.destroy?.();
      playerRef.current = null;
      el.innerHTML = "";
    };
  }, [live.provider, live.channel, host, fallback]);

  // a tap into the player (its play button) while the picture isn't moving: the spinner shows straight away, before
  // Twitch says anything, and stays until the picture moves (or 12 seconds, whatever happens)
  useEffect(() => {
    if (live.provider !== "twitch") return;
    let t: number | undefined;
    const onBlur = () => {
      window.setTimeout(() => {
        const a = document.activeElement;
        if (!(a instanceof HTMLIFrameElement) || !box.current?.contains(a) || moving.current) return;
        setPlaying(true);
        setBuffering(true);
        window.clearTimeout(t);
        t = window.setTimeout(() => setBuffering(false), 12_000);
        // let the next tap count too
        window.setTimeout(() => a.blur(), 50);
      }, 0);
    };
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.clearTimeout(t);
    };
  }, [live.provider]);

  const iframe = host && (live.provider === "youtube" || fallback);
  return (
    <div className="relative size-full overflow-hidden bg-black [&_iframe]:size-full [&_iframe]:border-0 [&_iframe]:bg-black [&_iframe]:[color-scheme:dark]">
      {live.provider === "twitch" && !fallback && <div ref={box} className="size-full" />}
      {iframe && (
        <iframe
          src={livePlayerUrl(live, host)}
          title={live.title || "Live stream"}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          // YouTube's page can't tell us when it plays: a moment after it loads is close enough
          onLoad={() => window.setTimeout(() => (setPlaying(true), started.current?.()), 1500)}
        />
      )}
      {/* started muted (so it plays at once): one tap for sound */}
      {live.provider === "twitch" && !fallback && playing && muted && (
        <button
          type="button"
          onClick={() => {
            playerRef.current?.setMuted?.(false);
            playerRef.current?.setVolume?.(1);
            playerRef.current?.play?.();
            setMuted(false);
          }}
          className="absolute top-3 left-3 z-10 inline-flex h-9 items-center gap-2 rounded-full bg-black/70 px-3.5 text-[13px] font-semibold text-white backdrop-blur-sm transition hover:bg-black/85"
        >
          <Icon name="volumeoff" size={16} /> Tap for sound
        </button>
      )}
      {playing && buffering && (
        <div role="status" aria-label="Loading" className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="inline-block size-10 animate-spin rounded-full border-[3px] border-white/30 border-t-white" />
        </div>
      )}
      <div aria-hidden={playing} className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black transition-opacity duration-300 ${playing ? "opacity-0" : "opacity-100"}`}>
        {poster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt="" className="absolute inset-0 size-full object-cover opacity-25 blur-sm" />
        )}
        <span className="relative inline-block size-8 animate-spin rounded-full border-2 border-white/25 border-t-white" />
        <span className="relative text-[14px] font-semibold text-white/85">Starting the stream…</span>
      </div>
    </div>
  );
}
