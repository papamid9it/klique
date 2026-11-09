"use client";

import { cx } from "@/components/ui/cx";
import { cdn, videoPoster } from "@/lib/cdn";
import { MEDIA_FITS, type MediaFit } from "@/lib/constants";
import type { TopicMediaDTO } from "@/lib/types";

/**
 * How a post's picture or video sits in its frame: Cover (fills it, cropped), Black background (whole, black bars) or
 * Backdrop (whole, over a blurred, darkened copy). Each choice is a small preview of the post's own first picture.
 */
export function MediaFitPicker({ media, value, onChange }: { media: TopicMediaDTO[]; value: MediaFit; onChange: (f: MediaFit) => void }) {
  const first = media[0];
  const still = first ? (first.kind === "video" ? (first.poster ?? videoPoster(first.url)) : first.url) : null;
  const src = still ? cdn(still, { w: 240 }) : null;
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">How it shows in the post</p>
      <div role="radiogroup" aria-label="How the picture shows in the post" className="grid grid-cols-3 gap-2">
        {MEDIA_FITS.map((f) => {
          const on = value === f.id;
          return (
            <button key={f.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(f.id)} title={f.hint} className={cx("rounded-control border p-1.5 text-left transition", on ? "border-accent-text ring-2 ring-accent/30" : "border-line hover:border-ink-muted/50")}>
              {/* a square frame, so a wide or tall picture shows the difference */}
              <span className="relative block aspect-square overflow-hidden rounded-[6px] bg-black">
                {src && f.id === "backdrop" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt="" aria-hidden="true" className="absolute inset-0 size-full scale-125 object-cover opacity-70 blur-md brightness-50" />
                )}
                {src && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt="" aria-hidden="true" className={cx("relative size-full", f.id === "cover" ? "object-cover" : "object-contain")} />
                )}
              </span>
              <span className="mt-1 block text-[12.5px] font-semibold">{f.label}</span>
              <span className="block text-[11px] leading-tight text-ink-muted">{f.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
