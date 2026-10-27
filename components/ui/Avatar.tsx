"use client";

import { useState } from "react";
import { cdn } from "@/lib/cdn";
import { focalStyle, splitFocal } from "@/lib/focal";
import { initials } from "@/lib/format";
import { isAnimatedPicture } from "@/lib/cosmetics";
import { useCalm } from "@/lib/hooks/useCalm";
import { AvatarFrame } from "./AvatarFrame";
import { StillImage } from "./StillImage";
import { cx } from "./cx";

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Mood-aware tints: every avatar colour is mixed from the active accent tokens. */
const TINTS = [
  "bg-[color-mix(in_oklab,var(--accent)_28%,var(--raised))] text-ink",
  "bg-[color-mix(in_oklab,var(--accent2)_30%,var(--raised))] text-ink",
  "bg-[color-mix(in_oklab,var(--accent)_14%,var(--accent2)_14%,var(--raised))] text-ink",
  "bg-[color-mix(in_oklab,var(--ink)_14%,var(--raised))] text-ink",
];

export function Avatar({ name, src, size = 40, className, frame }: { name: string; src?: string | null; size?: number; className?: string; frame?: string | null }) {
  if (frame) return <AvatarFrame frame={frame} size={size} render={(inner) => <AvatarPic name={name} src={src} size={inner} className={className} />} />;
  return <AvatarPic name={name} src={src} size={size} className={className} />;
}

function AvatarPic({ name, src, size, className }: { name: string; src?: string | null; size: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  // an animated (GIF) picture holds still for people who turn motion down or use data saver
  const calm = useCalm();
  const style = { width: size, height: size, fontSize: Math.max(11, size * 0.36) };
  if (src && !failed) {
    // the person may have moved or zoomed their picture in its circle (lib/focal)
    const { src: file, focal } = splitFocal(src);
    const animated = isAnimatedPicture(file);
    const still = (extra?: string) => (
      <StillImage
        src={cdn(file, { w: size * 2, h: size * 2, fit: "face" })}
        onError={() => setFailed(true)}
        style={focal.z > 1 ? { ...focalStyle(focal), width: "100%", height: "100%" } : { ...style, ...focalStyle(focal) }}
        className={cx("shrink-0 rounded-full object-cover", focal.z <= 1 && className, extra)}
      />
    );
    // a GIF also waits on its first frame in crowded places, and plays where it's the focus or its row is pointed at
    // (globals.css: kq-gif / kq-gif-still)
    const img = calm && animated ? (
      still()
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={cdn(file, { w: size * 2, h: size * 2, fit: "face" })}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        style={focal.z > 1 ? { ...focalStyle(focal), width: "100%", height: "100%" } : { ...style, ...focalStyle(focal) }}
        className={cx("shrink-0 rounded-full object-cover", focal.z <= 1 && className, animated && "kq-gif")}
      />
    );
    const shown = animated && !calm ? (
      <>
        {still("kq-gif-still")}
        {img}
      </>
    ) : (
      img
    );
    // zoomed in: clip to the circle so the enlarged picture doesn't spill out
    return focal.z > 1 ? (
      <span style={style} className={cx("inline-block shrink-0 overflow-hidden rounded-full", className)}>
        {shown}
      </span>
    ) : (
      shown
    );
  }
  return (
    <span
      aria-hidden="true"
      style={style}
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", TINTS[hash(name) % TINTS.length], className)}
    >
      {initials(name)}
    </span>
  );
}
