"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore } from "react";
import { GifPlaceholder } from "@/components/domain/topics/TopicMedia";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { cdn, videoPoster, videoSrc } from "@/lib/cdn";
import { isGif } from "@/lib/data-saver";
import { useAutoplay } from "@/lib/hooks/useAutoplay";
import { useDataSaver } from "@/lib/hooks/useDataSaver";
import { useMotion } from "@/lib/hooks/useCalm";
import { useNearScreen } from "@/lib/hooks/useNearScreen";
import type { TopicMediaDTO } from "@/lib/types";

/** Shape of each picture or video once known, so a post comes back (Back, the next visit) at the same size. */
const shapes = new Map<string, number>();
const clamp = (r: number) => Math.min(1.91, Math.max(0.8, r));

/* ---------------- feed videos: one plays at a time, sound remembered for the visit ---------------- */

let playingNow: HTMLVideoElement | null = null;
let soundOn: boolean | null = null;
const soundListeners = new Set<(on: boolean) => void>();
const SOUND_KEY = "klique:feed-sound";
const FREED = "klique:video-freed";
function soundChoice(): boolean {
  if (soundOn === null) {
    try {
      soundOn = sessionStorage.getItem(SOUND_KEY) === "1";
    } catch {
      soundOn = false;
    }
  }
  return soundOn;
}
function setSoundChoice(on: boolean) {
  soundOn = on;
  try {
    sessionStorage.setItem(SOUND_KEY, on ? "1" : "0");
  } catch {}
  soundListeners.forEach((fn) => fn(on));
}

/** The page is in front of the person: the tab is showing and the window has focus. Videos never play otherwise. */
const pageListeners = new Set<() => void>();
let pageWatching = false;
const pageActive = () => document.visibilityState === "visible" && document.hasFocus();
function subscribePage(l: () => void) {
  if (!pageWatching) {
    pageWatching = true;
    const tell = () => pageListeners.forEach((fn) => fn());
    document.addEventListener("visibilitychange", tell);
    window.addEventListener("blur", tell);
    window.addEventListener("focus", tell);
  }
  pageListeners.add(l);
  return () => void pageListeners.delete(l);
}

interface VideoHandle {
  toggle: () => void;
}

/**
 * A feed video, Instagram style: no browser controls. It plays muted and on a loop while most of it (60%) is on
 * screen and it's the picture showing, and stops when it scrolls away, the tab is hidden, the window loses focus or
 * the page is left; starting one stops any other (the post viewer's stops the feed's until it closes). A tap plays
 * or pauses (with a quick icon), the corner button turns sound on or off for every video this visit, and a thin
 * line shows how far it's got. With autoplay turned off it waits for a tap; with data saver on nothing even loads.
 */
const FeedVideo = forwardRef<VideoHandle, { url: string; poster: string | null; active: boolean; withSound?: boolean; onShape: (w: number, h: number) => void; onReady: () => void }>(function FeedVideo({ url, poster, active, withSound, onShape, onReady }, ref) {
  const v = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const saver = useDataSaver().on;
  const autoplay = useAutoplay();
  const still = useMotion().reduce;
  const front = useSyncExternalStore(subscribePage, pageActive, () => false);
  // plays by itself: in the feed when autoplay is on and animations aren't off; in the viewer (opened on purpose)
  // always. Never on data saver.
  const allowed = !saver && (withSound || (autoplay && !still));
  const [visible, setVisible] = useState(false);
  const [paused, setPaused] = useState(true);
  // paused by a tap: stays paused until it scrolls away and back
  const [held, setHeld] = useState(false);
  // data saver or autoplay off: nothing plays until tapped
  const [asked, setAsked] = useState(false);
  const [sound, setSound] = useState(() => (withSound ? true : soundChoice()));
  const [flash, setFlash] = useState<{ icon: "play" | "pause"; n: number } | null>(null);

  useEffect(() => {
    if (withSound) return;
    const fn = (on: boolean) => setSound(on);
    soundListeners.add(fn);
    return () => void soundListeners.delete(fn);
  }, [withSound]);

  useEffect(() => {
    const el = v.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => {
        const on = e.intersectionRatio >= 0.6;
        setVisible(on);
        if (!on) setHeld(false);
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const play = useCallback(() => {
    const el = v.current;
    if (!el) return;
    el.muted = !sound;
    if (playingNow && playingNow !== el) playingNow.pause();
    playingNow = el;
    void el.play().catch(() => {
      // the browser won't play sound yet (no tap so far): play muted instead
      if (!el.muted) {
        el.muted = true;
        setSound(false);
        void el.play().catch(() => {});
      }
    });
  }, [sound]);

  const want = front && active && visible && !held && (allowed || asked);
  useEffect(() => {
    const el = v.current;
    if (!el) return;
    if (want) play();
    else if (!el.paused) el.pause();
  }, [want, play]);
  // another video stopped for good (the viewer closed): pick up again if this one is still on screen
  useEffect(() => {
    if (!want) return;
    const again = () => v.current?.paused && play();
    window.addEventListener(FREED, again);
    return () => window.removeEventListener(FREED, again);
  }, [want, play]);
  useEffect(() => {
    const el = v.current;
    return () => {
      if (el && playingNow === el) {
        playingNow = null;
        window.dispatchEvent(new Event(FREED));
      }
    };
  }, []);

  useEffect(() => {
    if (v.current) v.current.muted = !sound;
  }, [sound]);

  const toggle = () => {
    const el = v.current;
    if (!el) return;
    if (el.paused) {
      setHeld(false);
      setAsked(true);
      play();
      setFlash({ icon: "play", n: Date.now() });
    } else {
      setHeld(true);
      el.pause();
      setFlash({ icon: "pause", n: Date.now() });
    }
  };
  useImperativeHandle(ref, () => ({ toggle }));

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 650);
    return () => clearTimeout(t);
  }, [flash]);

  return (
    <>
      <video
        ref={v}
        src={videoSrc(url)}
        poster={poster ?? undefined}
        muted
        loop
        playsInline
        disablePictureInPicture
        preload={saver && !asked ? "none" : "metadata"}
        onLoadedMetadata={(e) => (onShape(e.currentTarget.videoWidth, e.currentTarget.videoHeight), onReady())}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (bar.current && el.duration) bar.current.style.transform = `scaleX(${el.currentTime / el.duration})`;
        }}
        className="pointer-events-none relative size-full object-contain"
        aria-label="Video"
      >
        Your browser can&apos;t play this video.
      </video>
      {!allowed && !asked && paused && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span className="inline-flex size-14 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur">
            <Icon name="play" size={24} />
          </span>
        </span>
      )}
      {flash && (
        <span key={flash.n} className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span className="inline-flex size-16 animate-pop items-center justify-center rounded-full bg-black/50 text-white backdrop-blur">
            <Icon name={flash.icon} size={26} />
          </span>
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          const next = !sound;
          setSound(next);
          if (!withSound) setSoundChoice(next);
        }}
        aria-label={sound ? "Mute" : "Turn sound on"}
        title={sound ? "Mute" : "Sound on"}
        className="absolute right-2.5 bottom-3 inline-flex size-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80"
      >
        <Icon name={sound ? "volume" : "volumeoff"} size={15} />
      </button>
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-white/15" aria-hidden="true">
        <span ref={bar} className="block h-full origin-left scale-x-0 bg-white/80" />
      </span>
    </>
  );
});

/**
 * A post's pictures or video, Reddit style. The box takes its shape from the first picture (between 4:5 and
 * 1.91:1, at most 540px tall) and keeps it for the whole post, so going to the next picture never resizes anything.
 * Every picture sits inside it whole, over a blurred copy of itself. Pictures slide, the ones next to the current
 * one are already loaded (all of them once the post is near the screen), and one still loading shimmers until it
 * fades in. In the feed (`onOpen`) one tap opens the post and a double tap calls `onDoubleTap` (an upvote) with a
 * burst where you tapped, every time; in the viewer a tap plays or pauses a video and a double tap upvotes too.
 * `fill` fills its parent instead (the post viewer, on wide screens), and `withSound` starts videos with sound.
 */
export function FeedMedia({ media, className, onOpen, onDoubleTap, fill, withSound }: { media: TopicMediaDTO[]; className?: string; onOpen?: () => void; onDoubleTap?: () => void; fill?: boolean; withSound?: boolean }) {
  const first = media[0];
  const firstKey = first ? (first.kind === "video" ? (first.poster ?? videoPoster(first.url) ?? first.url) : first.url) : "";
  const [ratio, setRatio] = useState<number | null>(() => shapes.get(firstKey) ?? null);
  const [i, setI] = useState(0);
  const [loaded, setLoaded] = useState<Set<number>>(new Set());
  const [broken, setBroken] = useState<Set<number>>(new Set());
  const [playing, setPlaying] = useState<Set<number>>(new Set());
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number }[]>([]);
  const burstId = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const near = useNearScreen(box);
  const videos = useRef<(VideoHandle | null)[]>([]);
  const touch = useRef<number | null>(null);
  const lastTap = useRef(0);
  const single = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saver = useDataSaver().on;
  const many = media.length > 1;

  useEffect(() => () => void (single.current && clearTimeout(single.current)), []);

  // the shape comes from the first one only, once
  const shape = (k: number, w: number, h: number) => {
    if (k !== 0 || !w || !h || ratio !== null) return;
    const r = clamp(w / h);
    shapes.set(firstKey, r);
    setRatio(r);
  };
  const done = (k: number) => setLoaded((s) => (s.has(k) ? s : new Set(s).add(k)));

  if (!media.length) return null;
  const go = (k: number) => setI((k + media.length) % media.length);
  // the current one and its neighbours load right away; the rest once the post is near the screen
  const wanted = (k: number) => near || Math.abs(k - i) <= 1 || (i === 0 && k === media.length - 1);

  // one tap: open the post (feed), or play/pause a video and open a picture big (viewer). Two quick taps: upvote,
  // with a burst at the spot each time (the single tap waits a moment to tell them apart)
  const tap = (k: number, e: React.MouseEvent) => {
    // in the viewer a picture is already as big as it gets: a tap there does nothing
    const act = () => (onOpen ? onOpen() : media[k].kind === "video" ? videos.current[k]?.toggle() : undefined);
    if (!onDoubleTap) return act();
    const now = e.timeStamp;
    if (now - lastTap.current < 250) {
      lastTap.current = now;
      if (single.current) clearTimeout(single.current);
      single.current = null;
      onDoubleTap();
      const r = box.current?.getBoundingClientRect();
      const id = ++burstId.current;
      setBursts((b) => [...b, { id, x: r ? e.clientX - r.left : 0, y: r ? e.clientY - r.top : 0 }]);
      setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 800);
      return;
    }
    lastTap.current = now;
    single.current = setTimeout(() => {
      single.current = null;
      act();
    }, 250);
  };

  return (
    <div
      ref={box}
      className={cx("relative w-full overflow-hidden bg-black", fill ? "aspect-(--ratio) max-h-[60dvh] md:aspect-auto md:h-full md:max-h-none" : "aspect-(--ratio) max-h-[540px] rounded-2xl", className)}
      style={{ "--ratio": String(ratio ?? 4 / 3) } as React.CSSProperties}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const from = touch.current;
        touch.current = null;
        if (from === null || !many) return;
        const dx = e.changedTouches[0].clientX - from;
        if (Math.abs(dx) > 40) go(dx < 0 ? i + 1 : i - 1);
      }}
    >
      <div className="flex h-full transition-transform duration-300 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${i * 100}%)` }}>
        {media.map((m, k) => {
          const poster = m.kind === "video" ? (m.poster ?? videoPoster(m.url)) : null;
          const back = m.kind === "video" ? poster : m.url;
          const ready = loaded.has(k);
          return (
            <div key={`${m.url}-${k}`} className="relative h-full w-full shrink-0 overflow-hidden" aria-hidden={k !== i} inert={k !== i}>
              {!ready && !broken.has(k) && <div aria-hidden="true" className="skeleton absolute inset-0 rounded-none" />}
              {back && wanted(k) && (
                // blurred copy fills the box around a picture that doesn't match its shape
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cdn(back, { w: 200 })} alt="" aria-hidden="true" decoding="async" className="absolute inset-0 size-full scale-125 object-cover opacity-70 blur-3xl" />
              )}
              {m.kind === "video" ? (
                // a div, not a button: the sound button sits inside it
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => tap(k, e)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (onOpen) onOpen();
                      else videos.current[k]?.toggle();
                    }
                  }}
                  aria-label={onOpen ? "Open the post" : "Play or pause the video"}
                  className="relative block size-full cursor-pointer"
                >
                  <FeedVideo
                    ref={(h) => {
                      videos.current[k] = h;
                    }}
                    url={m.url}
                    poster={poster}
                    active={k === i}
                    withSound={withSound}
                    onShape={(w, h) => shape(k, w, h)}
                    onReady={() => done(k)}
                  />
                </div>
              ) : saver && isGif(m.url) && !playing.has(k) ? (
                <GifPlaceholder onPlay={() => setPlaying((p) => new Set(p).add(k))} className="relative h-full" />
              ) : broken.has(k) ? (
                <div className="relative flex h-full items-center justify-center gap-2 text-sm text-white/70">
                  <Icon name="x" size={14} /> Picture unavailable
                </div>
              ) : (
                wanted(k) && (
                  <button type="button" onClick={(e) => tap(k, e)} aria-label={onOpen ? `Open the post (picture ${k + 1} of ${media.length})` : `Picture ${k + 1} of ${media.length}`} className={cx("relative block size-full", onOpen ? "cursor-pointer" : "cursor-default")}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={cdn(m.url, { w: 1280 })}
                      alt={`Picture ${k + 1} of ${media.length}`}
                      decoding="async"
                      onLoad={(e) => (shape(k, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight), done(k))}
                      onError={() => setBroken((b) => new Set(b).add(k))}
                      className={cx("size-full object-contain transition-opacity duration-300 motion-reduce:transition-none", ready ? "opacity-100" : "opacity-0")}
                    />
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>

      {bursts.map((b) => (
        // Instagram's heart (it counts as an upvote)
        <span key={b.id} className="vote-burst pointer-events-none absolute inline-flex size-24 items-center justify-center text-[#ff3040] drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]" style={{ left: b.x - 48, top: b.y - 48 }} aria-hidden="true">
          <Icon name="heart" size={88} className="fill-current" />
        </span>
      ))}

      {many && (
        <>
          <button type="button" onClick={() => go(i - 1)} aria-label="Previous picture" className="absolute top-1/2 left-2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80">
            <Icon name="chevron-left" size={18} />
          </button>
          <button type="button" onClick={() => go(i + 1)} aria-label="Next picture" className="absolute top-1/2 right-2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80">
            <Icon name="chevron-right" size={18} />
          </button>
          <span className="pointer-events-none absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[11px] font-semibold text-white backdrop-blur">
            {i + 1}/{media.length}
          </span>
          <span className="pointer-events-none absolute bottom-2.5 left-1/2 flex -translate-x-1/2 gap-1.5" aria-hidden="true">
            {media.map((_, k) => (
              <span key={k} className={cx("size-1.5 rounded-full transition-colors", k === i ? "bg-white" : "bg-white/40")} />
            ))}
          </span>
        </>
      )}
    </div>
  );
}
