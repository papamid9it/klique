"use client";

import { useEffect, useRef } from "react";
import { EffectService } from "@/app/services/EffectService";
import { useApi } from "@/lib/hooks/useApi";
import { useMotion } from "@/lib/hooks/useCalm";
import { useDataSaver } from "@/lib/hooks/useDataSaver";
import type { ProfileEffectDTO } from "@/lib/types";

/** The effects people can pick (and profiles show), fetched once and kept. */
export function useEffectsCatalog() {
  return useApi(() => EffectService.list(), [], { key: "profile-effects" });
}

type Anim = {
  totalFrames: number;
  isLoaded: boolean;
  isPaused: boolean;
  play: () => void;
  goToAndStop: (value: number, isFrame?: boolean) => void;
  goToAndPlay: (value: number, isFrame?: boolean) => void;
  setLoop: (loop: boolean) => void;
  addEventListener: (name: "DOMLoaded" | "complete", fn: () => void) => void;
  destroy: () => void;
};
type LottiePlayer = { loadAnimation: (o: { container: Element; renderer: "svg"; loop: boolean; autoplay: boolean; path?: string; animationData?: object }) => Anim };
let lottie: Promise<LottiePlayer> | null = null;
/**
 * The Lottie player, loaded the first time a Lottie effect shows (it isn't needed anywhere else). The full build:
 * the light one skips expressions, so an effect that uses them stands still after its first frames.
 */
function loadLottie(): Promise<LottiePlayer> {
  lottie ??= new Promise((resolve, reject) => {
    const w = window as unknown as { lottie?: LottiePlayer };
    if (w.lottie) return resolve(w.lottie);
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js";
    s.async = true;
    s.onload = () => (w.lottie ? resolve(w.lottie) : reject(new Error("lottie")));
    s.onerror = () => {
      lottie = null;
      reject(new Error("lottie"));
    };
    document.head.appendChild(s);
  });
  return lottie;
}

type LottieJson = { assets?: { u?: string; p?: string; e?: number }[] };
const dotLotties = new Map<string, Promise<LottieJson>>();

const base64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/**
 * A dotLottie (.lottie: a zip, much smaller over the network), unpacked once per link: its first animation, with its
 * pictures put inline so the player needs nothing else. The unzipper loads only when a .lottie shows.
 */
function loadDotLottie(url: string): Promise<LottieJson> {
  let p = dotLotties.get(url);
  if (!p) {
    p = (async () => {
      const [{ unzipSync, strFromU8 }, buf] = await Promise.all([
        import("fflate"),
        fetch(url).then((r) => {
          if (!r.ok) throw new Error(`effect ${r.status}`);
          return r.arrayBuffer();
        }),
      ]);
      const files = unzipSync(new Uint8Array(buf));
      const manifest = files["manifest.json"] ? (JSON.parse(strFromU8(files["manifest.json"])) as { animations?: { id?: string }[] }) : {};
      const first = manifest.animations?.[0]?.id;
      const name = first && files[`animations/${first}.json`] ? `animations/${first}.json` : Object.keys(files).find((n) => /^animations\/[^/]+\.json$/.test(n));
      if (!name) throw new Error("no animation in the .lottie");
      const data = JSON.parse(strFromU8(files[name])) as LottieJson;
      for (const a of data.assets ?? []) {
        const img = a.p && a.e !== 1 ? files[`images/${a.p}`] : undefined;
        if (!img) continue;
        const ext = a.p!.split(".").pop()!.toLowerCase();
        a.p = `data:${ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`};base64,${base64(img)}`;
        a.u = "";
        a.e = 1;
      }
      return data;
    })();
    p.catch(() => dotLotties.delete(url)); // try again next time
    dotLotties.set(url, p);
  }
  return p;
}

/** A Lottie (.json, or .lottie), made once per file: `play` loops it from the start; otherwise it waits on `frame` (0 to 1 of the way). */
function LottieLayer({ path, play, frame, className }: { path: string; play: boolean; frame: number; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const anim = useRef<Anim | null>(null);
  const want = useRef({ play, frame });
  want.current = { play, frame };

  // play (on from where it is, never restarting) or wait on the chosen frame
  const apply = () => {
    const a = anim.current;
    if (!a?.isLoaded) return;
    if (!want.current.play) a.goToAndStop(Math.round(Math.max(0, a.totalFrames - 1) * want.current.frame), true);
    else if (a.isPaused) a.play();
  };

  useEffect(() => {
    let live = true;
    const dot = /\.lottie($|[?#])/i.test(path);
    Promise.all([loadLottie(), dot ? loadDotLottie(path) : null])
      .then(([l, data]) => {
        if (!live || !box.current) return;
        // the player changes the data it's given: each one gets its own copy
        const a = l.loadAnimation({ container: box.current, renderer: "svg", loop: true, autoplay: false, ...(data ? { animationData: structuredClone(data) } : { path }) });
        a.setLoop(true);
        a.addEventListener("DOMLoaded", apply);
        // belt and braces: an export whose loop flag doesn't stick starts over instead of freezing on its last frame
        a.addEventListener("complete", () => want.current.play && a.goToAndPlay(0, true));
        anim.current = a;
      })
      .catch(() => {});
    return () => {
      live = false;
      anim.current?.destroy();
      anim.current = null;
    };
  }, [path]);

  useEffect(apply, [play, frame]);
  return <span ref={box} className={className} />;
}

/** An animated WebP / APNG held on its first frame (for effects with no still picture). */
function FirstFrame({ src, className }: { src: string; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const img = new Image();
    let live = true;
    img.onload = () => {
      const c = canvas.current;
      if (!live || !c) return;
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d")?.drawImage(img, 0, 0);
    };
    img.src = src;
    return () => {
      live = false;
    };
  }, [src]);
  return <canvas ref={canvas} className={className} />;
}

/**
 * A profile effect over a profile card, Discord style: a Lottie covering the card, starting when it opens and
 * looping. Purely decorative (no pointer events, hidden from screen readers). `paused` (a picker tile not pointed at),
 * Animations off or data saver switched on hold it on its chosen frame. `spec` skips the lookup (a preview of an effect that isn't
 * worn yet). Effects added as animated WebP/APNG before effects became Lottie only still play (first frame when still).
 */
export function ProfileEffect({ id, spec, paused, className }: { id?: string | null; spec?: ProfileEffectDTO | null; paused?: boolean; className?: string }) {
  const { data } = useEffectsCatalog();
  // still when animations are off, or data saver is switched on by hand (not "automatic": that follows the
  // connection, which can flip it back and forth mid-animation)
  const { reduce } = useMotion();
  const saver = useDataSaver().pref === "on";
  const calm = reduce || saver;
  const e = spec ?? (id ? (data ?? []).find((x) => x.id === id) : null);
  if (!e) return null;
  const still = paused || calm;
  const cover = "absolute inset-0 size-full";
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute inset-0 z-10 overflow-hidden ${className ?? ""}`}>
      {e.kind === "lottie" ? (
        <LottieLayer path={e.fileUrl} play={!still} frame={e.posterFrame ?? 0.5} className={`${cover} [&>svg]:!size-full`} />
      ) : still ? (
        <FirstFrame src={e.fileUrl} className={`${cover} object-cover`} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.fileUrl} alt="" className={`${cover} object-cover`} />
      )}
    </span>
  );
}
