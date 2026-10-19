"use client";

import { Icon } from "@/components/ui/Icon";
import { cdn } from "@/lib/cdn";

/** Thumbnails of pictures waiting to be sent, with a remove button each and upload progress. */
export function AttachmentStrip({ urls, progress, error, onRemove }: { urls: string[]; progress: number | null; error: string | null; onRemove: (u: string) => void }) {
  if (!urls.length && progress === null && !error) return null;
  return (
    <div className="mb-2">
      <ul className="flex flex-wrap gap-2">
        {urls.map((u, i) => (
          <li key={u} className="relative size-16 overflow-hidden rounded-control border border-line bg-raised">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cdn(u, { w: 128, h: 128, fit: "fill" })} alt={`Attached picture ${i + 1}`} className="size-full object-cover" />
            <button type="button" onClick={() => onRemove(u)} aria-label={`Remove picture ${i + 1}`} className="absolute top-0.5 right-0.5 inline-flex size-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black">
              <Icon name="x" size={11} />
            </button>
          </li>
        ))}
        {progress !== null && (
          <li role="status" className="flex size-16 items-center justify-center rounded-control border border-dashed border-line font-mono text-xs text-ink-muted">
            {Math.round(progress * 100)}%
          </li>
        )}
      </ul>
      {error && (
        <p role="alert" className="mt-1.5 text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
