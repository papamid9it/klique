import type { CSSProperties } from "react";

/**
 * Where a profile picture, banner or community cover is positioned in its frame. Saved on the picture's own link
 * as a fragment ("…/abc.webp#kq=50,30,1.4": centre x %, centre y %, zoom), so it travels everywhere the link
 * already goes (cards, hover cards, profiles, messages) without a separate field. Browsers never send the
 * fragment when fetching, so caching and storage are unaffected.
 */
export interface Focal {
  /** 0–100: which part of the picture stays in view, left → right */
  x: number;
  /** 0–100: top → bottom */
  y: number;
  /** 1–4: how far it's zoomed in */
  z: number;
}

export const FOCAL_CENTER: Focal = { x: 50, y: 50, z: 1 };
export const MAX_ZOOM = 4;

const RX = /#kq=(-?[\d.]+),(-?[\d.]+),([\d.]+)$/;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number, p = 1) => Math.round(n * 10 ** p) / 10 ** p;

/** The link without its position, and the position (centre when there is none). */
export function splitFocal(url: string | null | undefined): { src: string; focal: Focal } {
  if (!url) return { src: "", focal: FOCAL_CENTER };
  const m = RX.exec(url);
  if (!m) return { src: url.split("#")[0], focal: FOCAL_CENTER };
  return { src: url.slice(0, m.index), focal: { x: clamp(+m[1] || 0, 0, 100), y: clamp(+m[2] || 0, 0, 100), z: clamp(+m[3] || 1, 1, MAX_ZOOM) } };
}

/** The link with this position saved on it (a plain link again when it's centred and not zoomed). */
export function withFocal(url: string, f: Focal): string {
  const { src } = splitFocal(url);
  if (!src) return "";
  const x = round(clamp(f.x, 0, 100));
  const y = round(clamp(f.y, 0, 100));
  const z = round(clamp(f.z, 1, MAX_ZOOM), 2);
  return x === 50 && y === 50 && z === 1 ? src : `${src}#kq=${x},${y},${z}`;
}

/** Style for an `object-cover` image that fills its (overflow-hidden) frame. */
export function focalStyle(f: Focal): CSSProperties {
  const pos = `${f.x}% ${f.y}%`;
  return f.z > 1 ? { objectPosition: pos, transform: `scale(${f.z})`, transformOrigin: pos } : { objectPosition: pos };
}

/** Two links point at the same file (ignoring position). */
export const sameFile = (a: string | null | undefined, b: string | null | undefined) => splitFocal(a).src === splitFocal(b).src;
