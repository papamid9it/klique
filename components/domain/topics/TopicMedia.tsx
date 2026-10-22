"use client";

import { useRef, useState } from "react";
import { useNearScreen } from "@/lib/hooks/useNearScreen";
import { cdn, videoPoster, videoSrc } from "@/lib/cdn";
import { isGif } from "@/lib/data-saver";
import { useDataSaver } from "@/lib/hooks/useDataSaver";
import { Icon } from "@/components/ui/Icon";
import { videoFullscreen } from "@/components/ui/MediaViewer";
import { useMediaViewer } from "@/components/providers/MediaViewerProvider";
import { cx } from "@/components/ui/cx";
import type { TopicMediaDTO } from "@/lib/types";

/** Bundled sample files (public/mock) so media works before real uploads exist. */
export const MOCK_IMAGES = [1, 2, 3, 4, 5, 6].map((i) => `/mock/img-${i}.jpg`);
export const MOCK_VIDEOS = [1, 2].map((i) => ({ url: `/mock/clip-${i}.mp4`, poster: `/mock/clip-${i}.jpg` }));

export const looksLikeVideo = (url: string) => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);

/**
 * Reddit-style media block: one picture, a swipeable gallery, or a video player.
 * `tall` allows more height on the full topic page than in lists.
 */
export function TopicMedia({ media, tall, className }: { media: TopicMediaDTO[]; tall?: boolean; className?: string }) {
  const [i, setI] = useState(0);
  const [broken, setBroken] = useState<Set<number>>(new Set());
  // a long board of videos only asks for each one's data as it comes near the screen
  const box = useRef<HTMLDivElement>(null);
  const near = useNearScreen(box);
  const view = useMediaViewer();
  const vid = useRef<HTMLVideoElement>(null);
  // data saver: videos load nothing until played, GIFs wait for a tap
  const saver = useDataSaver().on;
  const [playing, setPlaying] = useState<Set<number>>(new Set());
  if (!media.length) return null;
  const cur = media[Math.min(i, media.length - 1)];
  const max = tall ? "max-h-[34rem]" : "max-h-[26rem]";
  const many = media.length > 1;

  return (
    <div ref={box} className={cx("relative overflow-hidden rounded-control border border-line bg-black/60", className)}>
      {cur.kind === "video" ? (
        <video key={cur.url} ref={vid} src={videoSrc(cur.url)} poster={cur.poster ?? videoPoster(cur.url) ?? undefined} controls playsInline preload={near && !saver ? "metadata" : "none"} className={cx("mx-auto block w-full bg-black object-contain", max)} aria-label="Video">
          Your browser can&apos;t play this video.
        </video>
      ) : saver && isGif(cur.url) && !playing.has(i) ? (
        <GifPlaceholder onPlay={() => setPlaying((p) => new Set(p).add(i))} />
      ) : broken.has(i) ? (
        <div className="flex h-40 items-center justify-center gap-2 text-sm text-ink-muted">
          <Icon name="x" size={14} /> Picture unavailable
        </div>
      ) : (
        <>
          {/* blurred copy fills the sides of tall or narrow pictures */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cdn(cur.url, { w: 200 })} alt="" aria-hidden="true" loading="lazy" decoding="async" className="absolute inset-0 size-full scale-110 object-cover opacity-40 blur-2xl" />
          <button type="button" onClick={() => view(media, i)} aria-label={`Open picture ${i + 1} of ${media.length} full screen`} className="relative block w-full cursor-zoom-in">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cdn(cur.url, { w: 1280 })} alt={`Picture ${i + 1} of ${media.length}`} loading="lazy" decoding="async" onError={() => setBroken((b) => new Set(b).add(i))} className={cx("relative mx-auto block w-full object-contain", max)} />
          </button>
        </>
      )}

      {cur.kind === "video" && (
        <button type="button" onClick={() => videoFullscreen(vid.current)} aria-label="Play full screen" title="Full screen" className="absolute top-2 left-2 inline-flex size-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80">
          <Icon name="expand" size={16} />
        </button>
      )}
      {many && (
        <>
          <button type="button" onClick={() => setI((i - 1 + media.length) % media.length)} aria-label="Previous picture" className="absolute top-1/2 left-2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80">
            <Icon name="chevron-left" size={18} />
          </button>
          <button type="button" onClick={() => setI((i + 1) % media.length)} aria-label="Next picture" className="absolute top-1/2 right-2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80">
            <Icon name="chevron-right" size={18} />
          </button>
          <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[11px] font-semibold text-white backdrop-blur">
            {i + 1}/{media.length}
          </span>
          <span className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5" aria-hidden="true">
            {media.map((_, k) => (
              <span key={k} className={cx("size-1.5 rounded-full", k === i ? "bg-white" : "bg-white/40")} />
            ))}
          </span>
        </>
      )}
    </div>
  );
}

/** Data saver: a GIF (often several MB) shows this until you ask for it. */
export function GifPlaceholder({ onPlay, className }: { onPlay: () => void; className?: string }) {
  return (
    <button type="button" onClick={onPlay} className={cx("flex h-40 w-full flex-col items-center justify-center gap-1.5 bg-raised text-ink-muted hover:text-ink", className)}>
      <span className="inline-flex size-11 items-center justify-center rounded-full bg-black/50 text-white">
        <Icon name="play" size={18} />
      </span>
      <span className="text-[13px] font-semibold">GIF · tap to play</span>
      <span className="text-[11px]">Data saver is on</span>
    </button>
  );
}
