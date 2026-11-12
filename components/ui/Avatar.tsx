"use client";

import { useState } from "react";
import { cdn } from "@/lib/cdn";
import { focalStyle, splitFocal } from "@/lib/focal";
import { initials } from "@/lib/format";
import { isAnimatedPicture } from "@/lib/cosmetics";
import { PROFILE_DESIGNS_ENABLED } from "@/lib/constants";
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

export function Avatar({
  name,
  src,
  size = 40,
  className,
  frame,
  badge,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
  frame?: string | null;
  /** a community role's emoji, on the picture's bottom-right edge (inside that community only) */
  badge?: { icon: string; label: string } | null;
}) {
  // frames are a profile design: off for now (lib/constants PROFILE_DESIGNS_ENABLED)
  const pic = frame && PROFILE_DESIGNS_ENABLED ? <AvatarFrame frame={frame} size={size} render={(inner) => <AvatarPic name={name} src={src} size={inner} className={className} />} /> : <AvatarPic name={name} src={src} size={size} className={className} />;
  if (!badge?.icon) return pic;
  return (
    <span data-avatar="" className="relative inline-block shrink-0 align-top leading-none">
      {pic}
      <RoleDot icon={badge.icon} label={badge.label} avatar={size} />
    </span>
  );
}

/**
 * The role emoji on an avatar, Discord-style: a little disc on the bottom-right edge, half over the picture's rim,
 * with a ring in the page colour so it stands apart. About 40% of the picture (never under 14px).
 */
function RoleDot({ icon, label, avatar }: { icon: string; label: string; avatar: number }) {
  const d = Math.max(14, Math.round(avatar * 0.4));
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      style={{ width: d, height: d, fontSize: Math.round(d * 0.66), right: -Math.round(d * 0.2), bottom: -Math.round(d * 0.2) }}
      className="absolute z-10 inline-flex items-center justify-center rounded-full bg-surface leading-none ring-2 ring-canvas select-none"
    >
      {icon}
    </span>
  );
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
    const still = () => (
      <StillImage
        src={cdn(file, { w: size * 2, h: size * 2, fit: "face" })}
        onError={() => setFailed(true)}
        style={focal.z > 1 ? { ...focalStyle(focal), width: "100%", height: "100%" } : { ...style, ...focalStyle(focal) }}
        className={cx("shrink-0 rounded-full object-cover", focal.z <= 1 && className)}
      />
    );
    // a GIF plays everywhere; it holds on its first frame only for people who turn motion down or use data saver
    const img = calm && animated ? (
      still()
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        data-avatar=""
        src={cdn(file, { w: size * 2, h: size * 2, fit: "face" })}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        style={focal.z > 1 ? { ...focalStyle(focal), width: "100%", height: "100%" } : { ...style, ...focalStyle(focal) }}
        className={cx("shrink-0 rounded-full object-cover", focal.z <= 1 && className)}
      />
    );
    // zoomed in: clip to the circle so the enlarged picture doesn't spill out
    return focal.z > 1 ? (
      <span data-avatar="" style={style} className={cx("inline-block shrink-0 overflow-hidden rounded-full", className)}>
        {img}
      </span>
    ) : (
      img
    );
  }
  return (
    <span
      data-avatar=""
      aria-hidden="true"
      style={style}
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", TINTS[hash(name) % TINTS.length], className)}
    >
      {initials(name)}
    </span>
  );
}
