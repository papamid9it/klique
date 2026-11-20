"use client";

import { useState } from "react";
import { useMediaViewer } from "@/components/providers/MediaViewerProvider";
import { cx } from "@/components/ui/cx";
import { cdn } from "@/lib/cdn";
import { isGif } from "@/lib/data-saver";
import { useDataSaver } from "@/lib/hooks/useDataSaver";
import { GifPlaceholder } from "@/components/domain/topics/TopicMedia";
import { chatAspect, chatRows } from "@/lib/media-size";

/** A single picture's frame: its saved shape, at most 400px wide and 350px tall; without a saved size, 320×240. */
function frameOf(url: string): React.CSSProperties {
  const a = chatAspect(url);
  if (!a) return { width: 320, aspectRatio: "4 / 3" };
  return { width: Math.round(Math.min(400, 350 * a)), aspectRatio: String(a) };
}

/** Pictures attached to a chat message (up to 10): one large, or a mosaic like Discord's. Tapping one opens them fullscreen. */
export function ChatImages({ images, className, mine }: { images: string[]; className?: string; /** you sent them (you can download them) */ mine?: boolean }) {
  const view = useMediaViewer();
  const [broken, setBroken] = useState<Set<string>>(new Set());
  // data saver: GIFs wait for a tap
  const saver = useDataSaver().on;
  const [playing, setPlaying] = useState<Set<string>>(new Set());
  const shown = images.filter((u) => !broken.has(u));
  if (!shown.length) return null;
  const single = shown.length === 1;

  // one picture, or a tile of a mosaic: the space is held before it loads (like Discord)
  const item = (u: string, i: number, tileClass: string, style?: React.CSSProperties) =>
    saver && isGif(u) && !playing.has(u) ? (
      <GifPlaceholder key={u} onPlay={() => setPlaying((p) => new Set(p).add(u))} className={single ? "aspect-[4/3] w-80 max-w-full" : tileClass} />
    ) : (
      <button key={u} type="button" onClick={() => view(shown, i, { mine })} aria-label={`Open picture ${i + 1} of ${shown.length} full screen`} className={cx("group/img relative block max-w-full cursor-zoom-in overflow-hidden bg-[#0d0d0d]", tileClass)} style={style}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cdn(u, { w: single ? 720 : 360, h: single ? undefined : 360, fit: single ? undefined : "fill" })} alt="" loading="lazy" decoding="async" onError={() => setBroken((b) => new Set(b).add(u))} className={cx("size-full transition group-hover/img:brightness-110", single && !chatAspect(u) ? "object-contain" : "object-cover")} />
      </button>
    );

  // one: its own shape (or a fixed 4:3 frame for older pictures)
  if (single) return <div className={cx("mt-1 overflow-hidden rounded-control", className)}>{item(shown[0], 0, "", frameOf(shown[0]))}</div>;
  // three: one big on the left, two stacked on the right
  if (shown.length === 3)
    return (
      <div className={cx("mt-1 grid aspect-[3/2] max-w-md grid-cols-3 grid-rows-2 gap-1 overflow-hidden rounded-control", className)}>
        {item(shown[0], 0, "col-span-2 row-span-2 size-full")}
        {item(shown[1], 1, "size-full")}
        {item(shown[2], 2, "size-full")}
      </div>
    );
  // more: rows of two or three squares, a wide picture on top for 7 and 10
  let at = 0;
  return (
    <div className={cx("mt-1 flex max-w-md flex-col gap-1 overflow-hidden rounded-control", className)}>
      {chatRows(shown.length).map((k, r) => {
        const row = shown.slice(at, at + k).map((u, j) => item(u, at + j, k === 1 ? "aspect-[2/1] w-full" : "aspect-square w-full"));
        at += k;
        return (
          <div key={r} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${k}, minmax(0, 1fr))` }}>
            {row}
          </div>
        );
      })}
    </div>
  );
}
