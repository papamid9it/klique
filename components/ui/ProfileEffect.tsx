"use client";

import { useEffect, useRef } from "react";
import { EffectService } from "@/app/services/EffectService";
import { useApi } from "@/lib/hooks/useApi";
import { useCalm } from "@/lib/hooks/useCalm";
import type { ProfileEffectDTO } from "@/lib/types";

/** The effects people can pick (and profiles show), fetched once and kept. */
export function useEffectsCatalog() {
  return useApi(() => EffectService.list(), [], { key: "profile-effects" });
}

type LottiePlayer = { loadAnimation: (o: { container: Element; renderer: "svg"; loop: boolean; autoplay: boolean; path: string }) => { destroy: () => void } };
let lottie: Promise<LottiePlayer> | null = null;
/** The Lottie player, loaded the first time a Lottie effect shows (it isn't needed anywhere else). */
function loadLottie(): Promise<LottiePlayer> {
  lottie ??= new Promise((resolve, reject) => {
    const w = window as unknown as { lottie?: LottiePlayer };
    if (w.lottie) return resolve(w.lottie);
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie_light.min.js";
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

function LottieLayer({ path, className }: { path: string; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let anim: { destroy: () => void } | null = null;
    let live = true;
    loadLottie()
      .then((l) => {
        if (live && box.current) anim = l.loadAnimation({ container: box.current, renderer: "svg", loop: true, autoplay: true, path });
      })
      .catch(() => {});
    return () => {
      live = false;
      anim?.destroy();
    };
  }, [path]);
  return <span ref={box} className={className} />;
}

/**
 * A profile effect playing over a profile card, Discord style: an uploaded animation (animated WebP/APNG, or Lottie)
 * covering the card, starting when it opens and looping. Purely decorative (no pointer events, hidden from screen
 * readers). With reduced motion or data saver it shows the effect's still picture instead. `spec` skips the lookup
 * (a preview of an effect that isn't worn yet).
 */
export function ProfileEffect({ id, spec, className }: { id?: string | null; spec?: ProfileEffectDTO | null; className?: string }) {
  const { data } = useEffectsCatalog();
  const calm = useCalm();
  const e = spec ?? (id ? (data ?? []).find((x) => x.id === id) : null);
  if (!e) return null;
  const cover = "absolute inset-0 size-full";
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute inset-0 z-10 overflow-hidden ${className ?? ""}`}>
      {calm ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.previewUrl} alt="" className={`${cover} object-cover`} />
      ) : e.kind === "lottie" ? (
        <LottieLayer path={e.fileUrl} className={`${cover} [&>svg]:!size-full`} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.fileUrl} alt="" className={`${cover} object-cover`} />
      )}
    </span>
  );
}
