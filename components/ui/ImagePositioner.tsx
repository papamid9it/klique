"use client";

import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { cdn } from "@/lib/cdn";
import { FOCAL_CENTER, MAX_ZOOM, focalStyle, splitFocal, withFocal, type Focal } from "@/lib/focal";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { cx } from "./cx";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Choose which part of a picture shows in its frame, like other apps do: drag the picture, and pinch, scroll or use
 * the slider to zoom. The frame has the shape the picture is shown in (a circle for profile pictures, a wide strip
 * for banners), and what you see here is exactly what everyone sees. Saves the position on the link (lib/focal).
 */
export function ImagePositioner({ open, url, aspect, round, title = "Position your picture", onClose, onSave }: { open: boolean; url: string; aspect: number; round?: boolean; title?: string; onClose: () => void; onSave: (url: string) => void }) {
  const { src, focal: initial } = splitFocal(url);
  const [f, setF] = useState<Focal>(initial);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef<{ f0: Focal; start: { x: number; y: number }; d0: number } | null>(null);
  const fRef = useRef(f);
  useEffect(() => {
    fRef.current = f;
  });

  // reopening with another picture (or the same one moved elsewhere) starts from where that one is
  const [shown, setShown] = useState(url);
  if (open && shown !== url) {
    setShown(url);
    setF(initial);
    setNatural(null);
  }

  /** how far (in screen pixels) the zoomed picture overhangs the frame on each axis */
  function slack(z: number) {
    const el = frame.current;
    if (!el || !natural) return { x: 0, y: 0 };
    const fw = el.clientWidth;
    const fh = el.clientHeight;
    const c = Math.max(fw / natural.w, fh / natural.h);
    return { x: natural.w * c * z - fw, y: natural.h * c * z - fh };
  }

  function down(e: RPointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const list = [...pts.current.values()];
    g.current = { f0: fRef.current, start: list[0], d0: list.length === 2 ? Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y) || 1 : 0 };
  }
  function move(e: RPointerEvent) {
    if (!pts.current.has(e.pointerId) || !g.current) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const { f0, start, d0 } = g.current;
    const list = [...pts.current.values()];
    if (list.length >= 2 && d0) {
      const z = clamp((f0.z * Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y)) / d0, 1, MAX_ZOOM);
      setF({ ...f0, z });
      return;
    }
    // dragging the picture right shows more of its left side
    const s = slack(f0.z);
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    setF({ z: f0.z, x: s.x > 0 ? clamp(f0.x - (100 * dx) / s.x, 0, 100) : f0.x, y: s.y > 0 ? clamp(f0.y - (100 * dy) / s.y, 0, 100) : f0.y });
  }
  function up(e: RPointerEvent) {
    pts.current.delete(e.pointerId);
    const [rest] = [...pts.current.values()];
    g.current = rest ? { f0: fRef.current, start: rest, d0: 0 } : null;
  }

  useEffect(() => {
    const el = frame.current;
    if (!el || !open) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setF((p) => ({ ...p, z: clamp(p.z * Math.exp(-e.deltaY * 0.002), 1, MAX_ZOOM) }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open, natural]);

  const nudge = (dx: number, dy: number) => setF((p) => ({ ...p, x: clamp(p.x + dx, 0, 100), y: clamp(p.y + dy, 0, 100) }));

  return (
    <Modal open={open} onClose={onClose} title={title} description="Drag to choose what shows. Pinch, scroll or use the slider to zoom." size="md">
      <div className={cx("mx-auto", round ? "w-64 max-w-full" : "w-full")}>
        <div
          ref={frame}
          tabIndex={0}
          role="application"
          aria-label="Picture position. Use the arrow keys to move it, + and - to zoom."
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onKeyDown={(e) => {
            const k: Record<string, [number, number]> = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] };
            if (k[e.key]) {
              e.preventDefault();
              nudge(...k[e.key]);
            } else if (e.key === "+" || e.key === "=") setF((p) => ({ ...p, z: clamp(p.z + 0.1, 1, MAX_ZOOM) }));
            else if (e.key === "-") setF((p) => ({ ...p, z: clamp(p.z - 0.1, 1, MAX_ZOOM) }));
          }}
          style={{ aspectRatio: String(aspect) }}
          className={cx("relative cursor-grab touch-none overflow-hidden border border-line bg-raised select-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-accent-text focus-visible:outline-none", round ? "rounded-full" : "rounded-control")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cdn(src, { w: 1200 })} alt="" draggable={false} onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} style={focalStyle(f)} className="pointer-events-none size-full object-cover" />
          {/* rule-of-thirds guide while positioning */}
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,transparent_33.2%,rgb(255_255_255/0.35)_33.3%,transparent_33.5%,transparent_66.5%,rgb(255_255_255/0.35)_66.6%,transparent_66.8%),linear-gradient(to_bottom,transparent_33.2%,rgb(255_255_255/0.35)_33.3%,transparent_33.5%,transparent_66.5%,rgb(255_255_255/0.35)_66.6%,transparent_66.8%)]" />
        </div>
      </div>

      <label className="mt-4 flex items-center gap-3 text-sm">
        <Icon name="image" size={14} className="text-ink-muted" />
        <span className="sr-only">Zoom</span>
        <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={f.z} onChange={(e) => setF((p) => ({ ...p, z: +e.target.value }))} className="flex-1 accent-[var(--accent)]" />
        <Icon name="image" size={20} className="text-ink-muted" />
      </label>

      <div className="mt-5 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => setF(FOCAL_CENTER)}>
          Reset
        </Button>
        <div className="flex gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => onSave(withFocal(src, f))}>
            Save position
          </Button>
        </div>
      </div>
    </Modal>
  );
}
