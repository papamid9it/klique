"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { cdn } from "@/lib/cdn";

/** Pictures attached to a chat message: one large, or a tidy grid. Click opens them full size. */
export function ChatImages({ images, className }: { images: string[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const shown = images.filter((u) => !broken.has(u));
  if (!shown.length) return null;
  const single = shown.length === 1;

  return (
    <>
      <div className={cx("mt-1 grid max-w-md gap-1 overflow-hidden rounded-control", single ? "grid-cols-1" : "grid-cols-2", className)}>
        {shown.map((u, i) => (
          <button key={u} type="button" onClick={() => setOpen(i)} aria-label={`Open picture ${i + 1} of ${shown.length}`} className={cx("group/img relative block overflow-hidden bg-raised", single ? "max-h-80" : "aspect-square")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cdn(u, { w: single ? 720 : 360, h: single ? undefined : 360, fit: single ? undefined : "fill" })} alt="" loading="lazy" decoding="async" onError={() => setBroken((b) => new Set(b).add(u))} className={cx("transition group-hover/img:brightness-110", single ? "max-h-80 w-auto max-w-full object-contain" : "size-full object-cover")} />
          </button>
        ))}
      </div>
      {open !== null && <Lightbox images={shown} start={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function Lightbox({ images, start, onClose }: { images: string[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const many = images.length > 1;
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && many) setI((n) => (n + 1) % images.length);
      else if (e.key === "ArrowLeft" && many) setI((n) => (n - 1 + images.length) % images.length);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, many, images.length]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Picture" className="fixed inset-0 z-[400] flex items-center justify-center bg-black/85 p-4" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cdn(images[i], { w: 1800 })} alt="" className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
      <button type="button" onClick={onClose} aria-label="Close" className="absolute top-4 right-4 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
        <Icon name="x" size={18} />
      </button>
      {many && (
        <>
          <button type="button" onClick={(e) => (e.stopPropagation(), setI((i - 1 + images.length) % images.length))} aria-label="Previous" className="absolute left-4 inline-flex size-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <Icon name="chevron-left" size={20} />
          </button>
          <button type="button" onClick={(e) => (e.stopPropagation(), setI((i + 1) % images.length))} aria-label="Next" className="absolute right-4 inline-flex size-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <Icon name="chevron-right" size={20} />
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
