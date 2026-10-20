"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LinkService } from "@/app/services/LinkService";
import { useAuth } from "@/components/providers/AuthProvider";
import { Icon } from "@/components/ui/Icon";
import { useNearScreen } from "@/lib/hooks/useNearScreen";
import type { LinkPreviewDTO } from "@/lib/types";

/* --------------------------- classification --------------------------- */

type Kind =
  | { type: "youtube"; id: string }
  | { type: "vimeo"; id: string }
  | { type: "video"; src: string }
  | { type: "image"; src: string }
  | { type: "link" };

const YT_ID = /^[\w-]{11}$/;

export function classifyUrl(raw: string): Kind {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { type: "link" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { type: "link" };
  const host = u.hostname.replace(/^(www|m|music)\./, "").toLowerCase();
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const v = u.searchParams.get("v");
    if (v && YT_ID.test(v)) return { type: "youtube", id: v };
    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
    if (m) return { type: "youtube", id: m[1] };
  }
  if (host === "youtu.be") {
    const id = u.pathname.slice(1, 12);
    if (YT_ID.test(id)) return { type: "youtube", id };
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = u.pathname.match(/\/(\d{5,12})(?:\/|$)/);
    if (m) return { type: "vimeo", id: m[1] };
  }
  if (/\.(mp4|webm|m4v|mov|ogv)$/i.test(u.pathname)) return { type: "video", src: u.toString() };
  if (/\.(png|jpe?g|gif|webp|avif)$/i.test(u.pathname)) return { type: "image", src: u.toString() };
  return { type: "link" };
}

const URL_RX = /https?:\/\/[^\s<]+/g;

/** Up to `max` distinct links in a message (trailing punctuation trimmed). */
export function linksIn(body: string, max = 3): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(URL_RX)) {
    const url = m[0].replace(/[.,!?;:)\]]+$/, "");
    if (!out.includes(url)) out.push(url);
    if (out.length >= max) break;
  }
  return out;
}

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

function LinkCard({ url, enabled, near }: { url: string; enabled: boolean; near: boolean }) {
  const data = usePreview(url, enabled);
  if (!data) return null;
  return (
    <div className="max-w-md overflow-hidden rounded-card border border-line border-l-[3px] border-l-accent bg-surface p-3">
      <p className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">{data.siteName}</p>
      {data.title && (
        <a href={url} target="_blank" rel="noopener noreferrer nofollow ugc" className="mt-1 block text-[15px] leading-snug font-semibold text-accent-text hover:underline">
          {data.title}
        </a>
      )}
      {data.description && <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-ink-muted">{data.description}</p>}
      {data.videoUrl ? (
        <video controls preload={near ? "metadata" : "none"} poster={data.image ?? undefined} className="mt-2 max-h-72 w-full rounded-control bg-black">
          <source src={data.videoUrl} />
        </video>
      ) : (
        data.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="mt-2 max-h-64 w-full rounded-control object-cover" />
        )
      )}
    </div>
  );
}

/** Wraps each embed so nothing is fetched (previews, video data) until the message scrolls near the screen. */
function Embed({ url, signedIn }: { url: string; signedIn: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const near = useNearScreen(box);
  return (
    <div ref={box}>
      <EmbedBody url={url} signedIn={signedIn} near={near} />
    </div>
  );
}

function EmbedBody({ url, signedIn, near }: { url: string; signedIn: boolean; near: boolean }) {
  const kind = useMemo(() => classifyUrl(url), [url]);
  const vimeo = usePreview(url, kind.type === "vimeo" && signedIn && near);
  switch (kind.type) {
    case "youtube":
      return <PlayableVideo provider="YouTube" thumb={`https://i.ytimg.com/vi/${kind.id}/hqdefault.jpg`} src={`https://www.youtube-nocookie.com/embed/${kind.id}?autoplay=1&rel=0`} href={url} />;
    case "vimeo":
      return <PlayableVideo provider="Vimeo" thumb={vimeo?.image ?? null} src={`https://player.vimeo.com/video/${kind.id}?autoplay=1`} href={url} title={vimeo?.title} />;
    case "video":
      return (
        <video controls preload={near ? "metadata" : "none"} className="max-h-80 max-w-full rounded-card bg-black">
          <source src={kind.src} />
        </video>
      );
    case "image":
      return (
        <a href={url} target="_blank" rel="noopener noreferrer nofollow ugc" className="inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={kind.src} alt="Linked image" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="max-h-80 max-w-full rounded-card border border-line object-contain" />
        </a>
      );
    default:
      return <LinkCard url={url} enabled={signedIn && near} near={near} />;
  }
}

/** Rich previews under a message: video players, images and OpenGraph cards for its links. */
export function Embeds({ body }: { body: string }) {
  const { user } = useAuth();
  const links = useMemo(() => linksIn(body), [body]);
  if (!links.length) return null;
  return (
    <div className="mt-2 space-y-2">
      {links.map((u) => (
        <Embed key={u} url={u} signedIn={!!user} />
      ))}
    </div>
  );
}
