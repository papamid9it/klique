"use client";

import { useRef, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { FeedService } from "@/app/services/FeedService";
import { UploadService } from "@/app/services/UploadService";
import { MOCK_IMAGES, MOCK_VIDEOS, looksLikeVideo } from "@/components/domain/topics/TopicMedia";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { TextArea, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { cx } from "@/components/ui/cx";
import { FEED_TITLE_MAX, TEXT_BACKGROUNDS, TEXT_CARD_MAX, textStyleOf, type TextBackgroundId } from "@/lib/feedText";
import { LongPost, TextCard } from "./TextPost";
import { cdn } from "@/lib/cdn";
import { LIMITS } from "@/lib/constants";
import { useUploadStatus } from "@/lib/hooks/useUploads";
import { checkFile } from "@/lib/uploads";
import type { FeedPostDTO, TopicMediaDTO } from "@/lib/types";

/**
 * Share a post: pictures (up to ten) or one video with a caption, or (the Text tab) text on its own: short text shows
 * as a coloured card, longer text as a title and body (lib/feedText). The preview shows which it'll be.
 */
export function PostComposer({ slug, communityName, explicitAllowed, onClose, onPosted }: { slug: string; communityName: string; explicitAllowed?: boolean; onClose: () => void; onPosted: (p: FeedPostDTO) => void }) {
  const toast = useToast();
  const status = useUploadStatus();
  const [mode, setMode] = useState<"media" | "text">("media");
  const [caption, setCaption] = useState("");
  const [title, setTitle] = useState("");
  const [textBg, setTextBg] = useState<TextBackgroundId>("sunset");
  const [explicit, setExplicit] = useState(false);
  const [media, setMedia] = useState<TopicMediaDTO[]>([]);
  const [link, setLink] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const photos = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLInputElement>(null);
  const hasVideo = media.some((m) => m.kind === "video");
  const uploading = progress !== null;
  const full = hasVideo || media.length >= LIMITS.feedMedia;

  async function upload(kind: "photo" | "video", files: FileList | null) {
    const list = Array.from(files ?? []).slice(0, kind === "video" ? 1 : LIMITS.feedMedia - media.length);
    for (const f of list) {
      const problem = checkFile(kind, f);
      if (problem) return toast(`${f.name}: ${problem}`, "error");
    }
    try {
      for (const f of list) {
        setProgress(0);
        const up = await UploadService.upload(kind, f, { onProgress: setProgress });
        setMedia((x) => [...x, { kind: kind === "video" ? "video" : "image", url: up.url, poster: up.poster }]);
      }
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setProgress(null);
      if (photos.current) photos.current.value = "";
      if (video.current) video.current.value = "";
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await FeedService.create(slug, { ...(mode === "media" ? { caption: caption.trim(), media } : { caption: caption.trim(), title: title.trim(), textBg, media: [] }), ...(explicitAllowed ? { explicit } : {}) });
      toast("Posted", "success");
      onPosted(res.data);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" title="New post" description={`Share pictures, a video or some text with ${communityName}.`}>
      <form onSubmit={submit} className="space-y-4">
        <div role="tablist" aria-label="What to post" className="inline-flex gap-1 rounded-control bg-raised p-1">
          {(
            [
              ["media", "image", "Pictures or video"],
              ["text", "edit", "Text"],
            ] as const
          ).map(([id, icon, label]) => (
            <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)} className={cx("inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3.5 text-[13px] font-semibold transition", mode === id ? "bg-ink text-canvas" : "text-ink-muted hover:text-ink")}>
              <Icon name={icon} size={14} /> {label}
            </button>
          ))}
        </div>
        {mode === "text" ? (
          <TextFields title={title} setTitle={setTitle} caption={caption} setCaption={setCaption} textBg={textBg} setTextBg={setTextBg} />
        ) : (
        <>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">
            Pictures or a video <span className="font-normal text-ink-muted">(up to {LIMITS.feedMedia} pictures, or one video)</span>
          </legend>
          {media.length > 0 && (
            <ul className="mb-3 flex flex-wrap gap-2">
              {media.map((m, i) => (
                <li key={`${m.url}${i}`} className="relative size-24 overflow-hidden rounded-control border border-line bg-raised">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.kind === "video" ? (m.poster ?? "") : cdn(m.url, { w: 200 })} alt="" className="size-full object-cover" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
                  {m.kind === "video" && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
                      <Icon name="video" size={22} />
                    </span>
                  )}
                  <button type="button" onClick={() => setMedia((x) => x.filter((_, k) => k !== i))} aria-label={`Remove ${m.kind === "video" ? "the video" : `picture ${i + 1}`}`} className="absolute top-1 right-1 inline-flex size-6 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black">
                    <Icon name="x" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input ref={photos} type="file" hidden multiple accept=".jpg,.jpeg,.png,.webp,.gif,.avif,.heic,.heif" onChange={(e) => void upload("photo", e.target.files)} aria-label="Choose pictures" />
          <input ref={video} type="file" hidden accept=".mp4,.mov,.webm,.m4v" onChange={(e) => void upload("video", e.target.files)} aria-label="Choose a video" />
          <div className="flex flex-wrap items-center gap-2">
            {status?.photo ? (
              <Button size="sm" variant="secondary" disabled={full || uploading} onClick={() => photos.current?.click()}>
                <Icon name="image" size={15} /> Upload pictures
              </Button>
            ) : (
              <Button size="sm" variant="secondary" disabled={full} onClick={() => setMedia((x) => [...x, { kind: "image", url: MOCK_IMAGES[x.length % MOCK_IMAGES.length], poster: null }])}>
                <Icon name="image" size={15} /> Add a sample picture
              </Button>
            )}
            {status?.video ? (
              <Button size="sm" variant="secondary" disabled={media.length > 0 || uploading} onClick={() => video.current?.click()}>
                <Icon name="video" size={15} /> Upload a video
              </Button>
            ) : (
              <Button size="sm" variant="secondary" disabled={media.length > 0} onClick={() => setMedia([{ kind: "video", ...MOCK_VIDEOS[Math.floor(Math.random() * MOCK_VIDEOS.length)] }])}>
                <Icon name="video" size={15} /> Add a sample video
              </Button>
            )}
            {uploading && (
              <span role="status" className="font-mono text-xs text-ink-muted">
                Uploading {Math.round((progress ?? 0) * 100)}%
              </span>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Or paste a picture or video link (https://…)" aria-label="Picture or video link" className="h-9 min-w-0 flex-1 rounded-control border border-line bg-surface px-3 text-sm placeholder:text-ink-muted/70 focus:border-accent-text focus:outline-none" />
            <Button
              size="sm"
              variant="secondary"
              disabled={!/^https?:\/\//i.test(link.trim())}
              onClick={() => {
                const url = link.trim();
                const isVideo = looksLikeVideo(url);
                if ((isVideo && media.length > 0) || (!isVideo && hasVideo)) return toast("A video goes on its own, without pictures.", "error");
                if (media.length >= LIMITS.feedMedia) return toast(`Up to ${LIMITS.feedMedia} pictures.`, "error");
                setMedia((x) => [...x, { kind: isVideo ? "video" : "image", url, poster: null }]);
                setLink("");
              }}
            >
              Add
            </Button>
          </div>
        </fieldset>
        <TextArea label="Caption (optional)" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={LIMITS.feedCaption} counter={LIMITS.feedCaption} placeholder="Say something about it…" />
        </>
        )}
        {/* a community that allows explicit content: the poster says whether this post is (it's blurred until tapped) */}
        {explicitAllowed && (
          <label className="flex items-start gap-2.5 rounded-control border border-line bg-raised/40 p-3 text-sm">
            <input type="checkbox" checked={explicit} onChange={(e) => setExplicit(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent-text)]" />
            <span>
              <span className="block font-semibold">Mark as explicit</span>
              <span className="block text-xs text-ink-muted">It shows blurred until someone taps to view it.</span>
            </span>
          </label>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={mode === "media" ? !media.length || uploading : !caption.trim() || (caption.trim().length > TEXT_CARD_MAX && !title.trim())}>
            Share
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** The Text tab: a title (needed past the card limit), the text, and for a card its colour, with a live preview. */
function TextFields({ title, setTitle, caption, setCaption, textBg, setTextBg }: { title: string; setTitle: (v: string) => void; caption: string; setCaption: (v: string) => void; textBg: TextBackgroundId; setTextBg: (v: TextBackgroundId) => void }) {
  const text = caption.trim();
  const style = textStyleOf({ media: [], title, caption });
  const needsTitle = text.length > TEXT_CARD_MAX && !title.trim();
  return (
    <div className="space-y-4">
      <TextField label={text.length > TEXT_CARD_MAX ? "Title" : "Title (optional)"} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={FEED_TITLE_MAX} placeholder="What's it about?" error={needsTitle ? "Longer posts need a title." : undefined} hint={text.length > TEXT_CARD_MAX ? undefined : `Short text with no title shows as a colour card. Add a title, or go past ${TEXT_CARD_MAX} characters, for a text post.`} />
      <TextArea label="Text" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={LIMITS.feedCaption} counter={LIMITS.feedCaption} placeholder="Ask something, share a tip, start a conversation…" />
      <div className="flex flex-wrap items-start gap-4 rounded-card border border-line bg-raised/40 p-3">
        <div className="w-36 shrink-0">
          {style === "card" ? (
            <TextCard post={{ caption: text || "Your text here", textBg }} className="[&_p]:text-[12px]" />
          ) : (
            <div className="max-h-44 overflow-hidden rounded-control border border-line bg-surface p-2.5 [&_h3]:text-[12px] [&_p]:text-[10.5px]">
              <LongPost post={{ title: title.trim() || "Your title", caption: text }} clamp />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-mono text-[11.5px] text-ink-muted">
            {text.length}/{TEXT_CARD_MAX} · {style === "card" ? "shows as a colour card" : "shows as a text post with a title"}
          </p>
          {style === "card" && (
            <div role="radiogroup" aria-label="Card colour" className="flex flex-wrap gap-2">
              {TEXT_BACKGROUNDS.map((b) => (
                <button key={b.id} type="button" role="radio" aria-checked={textBg === b.id} aria-label={b.name} title={b.name} onClick={() => setTextBg(b.id)} className={cx("size-8 rounded-full border-2 transition", textBg === b.id ? "border-ink" : "border-line")} style={{ background: b.css }} />
              ))}
            </div>
          )}
          <p className="text-xs text-ink-muted">{style === "card" ? "It goes where a picture would, and opens like one." : "People see the title and the first lines, and open it to read the rest and comment."}</p>
        </div>
      </div>
    </div>
  );
}

