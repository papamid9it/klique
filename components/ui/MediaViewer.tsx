"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { createPortal } from "react-dom";
import { cdn, videoPoster, videoSrc } from "@/lib/cdn";
import { Icon } from "./Icon";
import { cx } from "./cx";

export interface ViewerItem {
  kind: "image" | "video";
  url: string;
  poster?: string | null;
}

export interface ViewerAction {
  label: string;
  icon: "sticker" | "check";
  /** shown as done (e.g. already saved) */
  done?: boolean;
  onSelect: (item: ViewerItem) => void;
}

const MAX = 5;
const DOUBLE = 2.5;
type T = { s: number; x: number; y: number };
const ID: T = { s: 1, x: 0, y: 0 };

/** Go fullscreen with a video (iPhones only let the video element itself do that). */
export function videoFullscreen(v: HTMLVideoElement | null) {
  if (!v) return;
  const ios = v as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
  if (v.requestFullscreen) void v.requestFullscreen().catch(() => ios.webkitEnterFullscreen?.());
  else ios.webkitEnterFullscreen?.();
}

/** Save the file: a real download when the storage allows it, otherwise it opens in a new tab. */
async function download(url: string) {
  const name = (url.split("#")[0].split("?")[0].split("/").pop() || "klique").replace(/[^\w.-]/g, "_");
  try {
    const res = await fetch(url.split("#")[0], { mode: "cors" });
    if (!res.ok) throw new Error();
    const href = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement("a"), { href, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 2000);
  } catch {
    window.open(url.split("#")[0], "_blank", "noopener");
  }
}

/**
 * Fullscreen pictures and videos. Pinch, scroll or double-tap to zoom; drag to look around a zoomed picture;
 * swipe or use the arrows to move between the pictures of one post; swipe down or Esc to close.
 */
export function MediaViewer({ items, start, onClose, actions }: { items: ViewerItem[]; start: number; onClose: () => void; actions?: (item: ViewerItem) => ViewerAction[] }) {
  const [i, setI] = useState(Math.min(Math.max(0, start), items.length - 1));
  const [t, setT] = useState<T>(ID);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [animate, setAnimate] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ kind: "pinch" | "pan" | "swipe"; t0: T; d0: number; mid: { x: number; y: number }; start: { x: number; y: number }; at: number; moved: boolean } | null>(null);
  const lastTap = useRef(0);
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  });
  const img = useRef<HTMLImageElement>(null);
  const many = items.length > 1;
  const cur = items[i];

  const go = useCallback(
    (d: number) => {
      if (!many) return;
      setT(ID);
      setDrag({ x: 0, y: 0 });
      setI((n) => (n + d + items.length) % items.length);
    },
    [many, items.length],
  );

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "+" || e.key === "=") setT((p) => zoomAt(p, { x: 0, y: 0 }, Math.min(MAX, p.s * 1.4)));
      else if (e.key === "-") setT((p) => zoomAt(p, { x: 0, y: 0 }, Math.max(1, p.s / 1.4)));
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, go]);

  /** keep a zoomed picture from being dragged off screen */
  const clamp = useCallback((p: T): T => {
    const el = stage.current;
    if (!el || p.s <= 1) return ID;
    // the picture's own size on screen (before zooming), so its edges never come away from the screen's
    const w = img.current?.offsetWidth || el.clientWidth;
    const h = img.current?.offsetHeight || el.clientHeight;
    const mx = Math.max(0, (w * p.s - el.clientWidth) / 2);
    const my = Math.max(0, (h * p.s - el.clientHeight) / 2);
    return { s: p.s, x: Math.max(-mx, Math.min(mx, p.x)), y: Math.max(-my, Math.min(my, p.y)) };
  }, []);

  /** a point on screen, relative to the middle of the stage */
  const local = (x: number, y: number) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: x - r.left - r.width / 2, y: y - r.top - r.height / 2 };
  };
  function zoomAt(p: T, at: { x: number; y: number }, s: number): T {
    const k = s / p.s;
    return { s, x: at.x - (at.x - p.x) * k, y: at.y - (at.y - p.y) * k };
  }

  // wheel zoom needs a non-passive listener to stop the page from scrolling
  useEffect(() => {
    const el = stage.current;
    if (!el || cur.kind !== "image") return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = tRef.current;
      const s = Math.min(MAX, Math.max(1, p.s * Math.exp(-e.deltaY * 0.0022)));
      setAnimate(false);
      setT(clamp(zoomAt(p, local(e.clientX, e.clientY), s)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [cur.kind, clamp]);

  function down(e: RPointerEvent) {
    if (cur.kind !== "image" || (e.target as HTMLElement).closest("button,video,a")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setAnimate(false);
    const list = [...pts.current.values()];
    if (list.length === 2) {
      const [a, b] = list;
      gesture.current = { kind: "pinch", t0: tRef.current, d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: local((a.x + b.x) / 2, (a.y + b.y) / 2), start: a, at: Date.now(), moved: true };
    } else if (list.length === 1) {
      gesture.current = { kind: tRef.current.s > 1 ? "pan" : "swipe", t0: tRef.current, d0: 0, mid: { x: 0, y: 0 }, start: { x: e.clientX, y: e.clientY }, at: Date.now(), moved: false };
    }
  }

  function move(e: RPointerEvent) {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch") {
      const [a, b] = [...pts.current.values()];
      if (!b) return;
      const s = Math.min(MAX, Math.max(1, (g.t0.s * Math.hypot(a.x - b.x, a.y - b.y)) / g.d0));
      setT(clamp(zoomAt(g.t0, g.mid, s)));
      return;
    }
    const dx = e.clientX - g.start.x;
    const dy = e.clientY - g.start.y;
    if (Math.abs(dx) + Math.abs(dy) > 8) g.moved = true;
    if (g.kind === "pan") setT(clamp({ s: g.t0.s, x: g.t0.x + dx, y: g.t0.y + dy }));
    else setDrag({ x: Math.abs(dx) > Math.abs(dy) && many ? dx : 0, y: Math.abs(dy) >= Math.abs(dx) ? Math.max(0, dy) : 0 });
  }

  function up(e: RPointerEvent) {
    if (!pts.current.delete(e.pointerId)) return;
    const g = gesture.current;
    if (pts.current.size === 1 && g?.kind === "pinch") {
      // one finger lifted mid-pinch: carry on as a pan
      const [p] = [...pts.current.values()];
      gesture.current = { kind: "pan", t0: tRef.current, d0: 0, mid: { x: 0, y: 0 }, start: p, at: Date.now(), moved: true };
      return;
    }
    if (pts.current.size) return;
    gesture.current = null;
    setAnimate(true);
    if (!g) return;
    if (g.kind === "swipe") {
      const dx = e.clientX - g.start.x;
      const dy = e.clientY - g.start.y;
      setDrag({ x: 0, y: 0 });
      if (dy > 110 && dy > Math.abs(dx)) return onClose();
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy)) return go(dx < 0 ? 1 : -1);
    }
    if (!g.moved && Date.now() - g.at < 300) {
      // double tap / double click: zoom in on that spot, or back out
      if (Date.now() - lastTap.current < 320) {
        lastTap.current = 0;
        const p = tRef.current;
        setT(p.s > 1 ? ID : clamp(zoomAt(p, local(e.clientX, e.clientY), DOUBLE)));
      } else lastTap.current = Date.now();
    }
  }

  const fade = Math.max(0.35, 1 - drag.y / 400);
  const extra = actions?.(cur) ?? [];
  const btn = "inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20";

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={cur.kind === "video" ? "Video" : "Picture"} className="fixed inset-0 z-[400] flex flex-col text-white select-none" style={{ background: `rgba(0,0,0,${fade})` }}>
      <div className="relative z-10 flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <span className="min-w-0 flex-1 font-mono text-[12px] text-white/70">{many ? `${i + 1} / ${items.length}` : ""}</span>
        {extra.map((a) => (
          <button key={a.label} type="button" onClick={() => a.onSelect(cur)} disabled={a.done} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-[13px] font-semibold backdrop-blur transition hover:bg-white/20 disabled:opacity-70">
            <Icon name={a.done ? "check" : a.icon} size={16} /> {a.label}
          </button>
        ))}
        {cur.kind === "image" && (
          <button type="button" onClick={() => setT((p) => (p.s > 1 ? ID : { s: DOUBLE, x: 0, y: 0 }))} aria-label={t.s > 1 ? "Zoom out" : "Zoom in"} title={t.s > 1 ? "Zoom out" : "Zoom in"} className={cx(btn, "max-sm:hidden")}>
            <Icon name="zoom-in" size={18} />
          </button>
        )}
        {cur.kind === "video" && (
          <button type="button" onClick={() => videoFullscreen(video.current)} aria-label="Full screen" title="Full screen" className={btn}>
            <Icon name="expand" size={17} />
          </button>
        )}
        <button type="button" onClick={() => void download(cur.url)} aria-label="Download" title="Download" className={btn}>
          <Icon name="download" size={18} />
        </button>
        <button type="button" onClick={onClose} aria-label="Close" title="Close (Esc)" className={btn}>
          <Icon name="x" size={18} />
        </button>
      </div>

      <div
        ref={stage}
        className="relative min-h-0 flex-1 touch-none overflow-hidden"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClick={(e) => {
          // a tap beside the picture closes it (on the picture it's a zoom tap)
          if (e.target !== e.currentTarget || tRef.current.s > 1) return;
          const r = (img.current ?? video.current)?.getBoundingClientRect();
          if (!r || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
        }}
      >
        {cur.kind === "video" ? (
          <video key={cur.url} ref={video} src={videoSrc(cur.url)} poster={cur.poster ?? videoPoster(cur.url) ?? undefined} controls autoPlay playsInline className="absolute inset-0 m-auto max-h-full max-w-full" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={cur.url}
            ref={img}
            src={cdn(cur.url, { w: 1920, full: true })}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 m-auto max-h-full max-w-full object-contain will-change-transform"
            style={{ transform: `translate(${t.x + drag.x}px, ${t.y + drag.y}px) scale(${t.s})`, transition: animate ? "transform 180ms ease-out" : undefined, cursor: t.s > 1 ? "grab" : "zoom-in" }}
          />
        )}
        {many && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Previous" className={cx(btn, "absolute top-1/2 left-3 size-11 -translate-y-1/2 max-sm:hidden")}>
              <Icon name="chevron-left" size={20} />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Next" className={cx(btn, "absolute top-1/2 right-3 size-11 -translate-y-1/2 max-sm:hidden")}>
              <Icon name="chevron-right" size={20} />
            </button>
          </>
        )}
      </div>

      {many && (
        <div className="flex justify-center gap-1.5 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]" aria-hidden="true">
          {items.map((_, k) => (
            <span key={k} className={cx("size-1.5 rounded-full", k === i ? "bg-white" : "bg-white/35")} />
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
