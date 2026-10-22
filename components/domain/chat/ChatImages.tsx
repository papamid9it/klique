"use client";

import { useState } from "react";
import { useMediaViewer } from "@/components/providers/MediaViewerProvider";
import { cx } from "@/components/ui/cx";
import { cdn } from "@/lib/cdn";
import { isGif } from "@/lib/data-saver";
import { useDataSaver } from "@/lib/hooks/useDataSaver";
import { GifPlaceholder } from "@/components/domain/topics/TopicMedia";

/** Pictures attached to a chat message: one large, or a tidy grid. Tapping one opens them fullscreen. */
export function ChatImages({ images, className }: { images: string[]; className?: string }) {
  const view = useMediaViewer();
  const [broken, setBroken] = useState<Set<string>>(new Set());
  // data saver: GIFs wait for a tap
  const saver = useDataSaver().on;
  const [playing, setPlaying] = useState<Set<string>>(new Set());
  const shown = images.filter((u) => !broken.has(u));
  if (!shown.length) return null;
  const single = shown.length === 1;

  return (
    <div className={cx("mt-1 grid max-w-md gap-1 overflow-hidden rounded-control", single ? "grid-cols-1" : "grid-cols-2", className)}>
      {shown.map((u, i) =>
        saver && isGif(u) && !playing.has(u) ? (
          <GifPlaceholder key={u} onPlay={() => setPlaying((p) => new Set(p).add(u))} className={single ? "h-40" : "aspect-square h-auto"} />
        ) : (
        <button key={u} type="button" onClick={() => view(shown, i)} aria-label={`Open picture ${i + 1} of ${shown.length} full screen`} className={cx("group/img relative block cursor-zoom-in overflow-hidden bg-raised", single ? "max-h-80" : "aspect-square")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cdn(u, { w: single ? 720 : 360, h: single ? undefined : 360, fit: single ? undefined : "fill" })} alt="" loading="lazy" decoding="async" onError={() => setBroken((b) => new Set(b).add(u))} className={cx("transition group-hover/img:brightness-110", single ? "max-h-80 w-auto max-w-full object-contain" : "size-full object-cover")} />
        </button>
        ),
      )}
    </div>
  );
}
