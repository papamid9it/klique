"use client";

import { isDataSaver } from "@/lib/data-saver";
import { useEffect, useMemo, useRef, useState } from "react";
import { LinkService } from "@/app/services/LinkService";
import { useAuth } from "@/components/providers/AuthProvider";
import { Icon } from "@/components/ui/Icon";
import { useNearScreen } from "@/lib/hooks/useNearScreen";
import { usePauseOnLeave } from "@/lib/hooks/usePauseOnLeave";
import type { LinkPreviewDTO } from "@/lib/types";
import { classifyUrl, linksIn, previewAspect } from "@/lib/embed-links";

/* --------------------------- classification --------------------------- */

// shared with the server, which fetches link previews when a message is sent (lib/embed-links)
export { classifyUrl, linksIn } from "@/lib/embed-links";

/* ------------------------------- preview ------------------------------ */

const cache = new Map<string, Promise<LinkPreviewDTO | null>>();
function loadPreview(url: string) {
  let p = cache.get(url);
  if (!p) {
    p = LinkService.preview(url).then(
      (r) => r.data,
      () => null,
    );
    cache.set(url, p);
  }
  return p;
}

function usePreview(url: string, enabled: boolean) {
  const [data, setData] = useState<LinkPreviewDTO | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void loadPreview(url).then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [url, enabled]);
  return data;
}

/* ------------------------------ components ---------------------------- */

/** Click-to-play: nothing third-party loads until you press play (and YouTube uses its no-cookie player). */
function PlayableVideo({ provider, thumb, src, href, title }: { provider: string; thumb: string | null; src: string; href: string; title?: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="max-w-md overflow-hidden rounded-card border border-line bg-surface">
      <div className="relative aspect-video bg-black">
        {playing ? (
          <iframe
            src={src}
            title={title || `${provider} video`}
            className="absolute inset-0 size-full"
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          />
        ) : (
          <button type="button" onClick={() => setPlaying(true)} aria-label={`Play ${provider} video`} className="group absolute inset-0 flex items-center justify-center">
            {thumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" />
            )}
            <span className="relative inline-flex size-14 items-center justify-center rounded-full bg-black/70 text-white ring-1 ring-white/30 transition group-hover:scale-105 group-hover:bg-accent group-hover:text-accent-ink">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
            </span>
          </button>
        )}
      </div>
      <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc" className="flex items-center gap-1.5 px-3 py-2 text-xs text-ink-muted hover:text-ink">
        <Icon name="arrow-up-right" size={12} /> Watch on {provider}
      </a>
    </div>
  );
}

/** A link's card, drawn from its preview. The picture keeps its frame (its own shape, or 1.91:1) before it loads, so nothing moves. */
function PreviewCard({ url, data, near }: { url: string; data: LinkPreviewDTO; near: boolean }) {
  return (
    <div className="max-w-md overflow-hidden rounded-card border border-line border-l-[3px] border-l-accent bg-surface p-3">
      <p className="truncate text-[12px] font-semibold tracking-wide text-ink-muted uppercase">{data.siteName}</p>
      {data.title && (
        <a href={url} target="_blank" rel="noopener noreferrer nofollow ugc" className="mt-1 line-clamp-2 block text-[15px] leading-snug font-semibold text-accent-text hover:underline">
          {data.title}
        </a>
      )}
      {data.description && <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-ink-muted">{data.description}</p>}
      {data.videoUrl ? (
        <video controls preload={near && !isDataSaver() ? "metadata" : "none"} poster={data.image ?? undefined} className="mt-2 aspect-video w-full max-w-full rounded-control bg-black">
          <source src={data.videoUrl} />
        </video>
      ) : (
        data.image && (
          <a href={url} target="_blank" rel="noopener noreferrer nofollow ugc" tabIndex={-1} aria-hidden="true" className="mt-2 block w-full max-w-full overflow-hidden rounded-control bg-raised" style={{ aspectRatio: previewAspect(data.imageWidth, data.imageHeight), maxHeight: "16rem" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="size-full object-cover" />
          </a>
        )
      )}
    </div>
  );
}

/** Older messages (sent before previews were saved with them): fetched here, as before. */
function LinkCard({ url, enabled, near }: { url: string; enabled: boolean; near: boolean }) {
  const data = usePreview(url, enabled);
  return data ? <PreviewCard url={url} data={data} near={near} /> : null;
}

/** Wraps each embed so nothing is fetched (previews, video data) until the message scrolls near the screen. */
function Embed({ url, signedIn, saved }: { url: string; signedIn: boolean; saved: Saved }) {
  const box = useRef<HTMLDivElement>(null);
  const near = useNearScreen(box);
  usePauseOnLeave(box);
  return (
    <div ref={box}>
      <EmbedBody url={url} signedIn={signedIn} near={near} saved={saved} />
    </div>
  );
}

/** What the server saved with the message: its previews by link, still coming ("pending"), or nothing (an older message). */
type Saved = { kind: "saved"; byUrl: Map<string, LinkPreviewDTO> } | { kind: "pending" } | { kind: "none" };

function EmbedBody({ url, signedIn, near, saved }: { url: string; signedIn: boolean; near: boolean; saved: Saved }) {
  const kind = useMemo(() => classifyUrl(url), [url]);
  const own = saved.kind === "saved" ? (saved.byUrl.get(url) ?? null) : null;
  const fetched = usePreview(url, kind.type === "vimeo" && saved.kind === "none" && signedIn && near);
  const vimeo = own ?? fetched;
  switch (kind.type) {
    case "youtube":
      return <PlayableVideo provider="YouTube" thumb={`https://i.ytimg.com/vi/${kind.id}/hqdefault.jpg`} src={`https://www.youtube-nocookie.com/embed/${kind.id}?autoplay=1&rel=0`} href={url} />;
    case "vimeo":
      return <PlayableVideo provider="Vimeo" thumb={vimeo?.image ?? null} src={`https://player.vimeo.com/video/${kind.id}?autoplay=1`} href={url} title={vimeo?.title} />;
    case "video":
      return (
        <video controls preload={near && !isDataSaver() ? "metadata" : "none"} className="aspect-video w-full max-w-md rounded-card bg-black">
          <source src={kind.src} />
        </video>
      );
    case "image":
      return (
        // a fixed 4:3 frame (its size isn't known), the picture whole inside it: nothing moves when it loads
        <a href={url} target="_blank" rel="noopener noreferrer nofollow ugc" className="block aspect-[4/3] w-80 max-w-full overflow-hidden rounded-card border border-line bg-raised">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={kind.src} alt="Linked image" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="size-full object-contain" />
        </a>
      );
    default:
      // saved with the message: drawn straight away; still coming: nothing yet (it arrives in a moment); an older message: fetched
      if (saved.kind === "saved") return own ? <PreviewCard url={url} data={own} near={near} /> : null;
      if (saved.kind === "pending") return null;
      return <LinkCard url={url} enabled={signedIn && near} near={near} />;
  }
}

/** Rich previews under a message: video players, images and OpenGraph cards for its links. */
export function Embeds({ body, embeds, pending }: { body: string; /** previews saved with the message (community chat) */ embeds?: LinkPreviewDTO[]; pending?: boolean }) {
  const { user } = useAuth();
  const links = useMemo(() => linksIn(body), [body]);
  const saved = useMemo<Saved>(() => (embeds ? { kind: "saved", byUrl: new Map(embeds.map((e) => [e.url, e])) } : pending ? { kind: "pending" } : { kind: "none" }), [embeds, pending]);
  if (!links.length) return null;
  return (
    <div className="mt-2 space-y-2">
      {links.map((u) => (
        <Embed key={u} url={u} signedIn={!!user} saved={saved} />
      ))}
    </div>
  );
}
