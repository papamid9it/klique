"use client";

import { FormatButton } from "@/components/ui/FormatButton";
import { useRef, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { FeedService, newClientKey } from "@/app/services/FeedService";
import { useApi } from "@/lib/hooks/useApi";
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
import { cdn, videoPoster } from "@/lib/cdn";
import { LIMITS, POST_FRAMES, postFrame } from "@/lib/constants";
import { useUploadStatus } from "@/lib/hooks/useUploads";
import { checkFile } from "@/lib/uploads";
import type { FeedPostDTO, TopicMediaDTO } from "@/lib/types";
import { useTagSuggest } from "./TagSuggest";

/**
 * Share a post, in two pages: first choose pictures (up to ten) or one video, then see how it looks in reels and on
 * Home and add the caption. The Text tab is one page: short text shows as a coloured card, longer text as a title and
 * body (lib/feedText), and its preview shows which it'll be.
 */
export function PostComposer({ slug, communityName, explicitAllowed, onClose, onPosted }: { slug: string; communityName: string; explicitAllowed?: boolean; onClose: () => void; onPosted: (p: FeedPostDTO) => void }) {
  const toast = useToast();
  const status = useUploadStatus();
  const [mode, setMode] = useState<"media" | "text">("media");
  const [caption, setCaption] = useState("");
  // @people, @communities and #tags as you type the caption
  const captionRef = useRef<HTMLTextAreaElement | null>(null);
  const suggest = useTagSuggest(captionRef, caption, setCaption);
  const [title, setTitle] = useState("");
  const [textBg, setTextBg] = useState<TextBackgroundId>("sunset");
  const [explicit, setExplicit] = useState(false);
  const [media, setMedia] = useState<TopicMediaDTO[]>([]);
  // pictures or a video: first choose them, then a second page to see how it looks and finish it
  const [step, setStep] = useState<1 | 2>(1);
  const [previewAt, setPreviewAt] = useState(0);
  const [previewIn, setPreviewIn] = useState<"reels" | "home">("home");
  // the frame they pick for the post; Original follows its first picture
  const [frame, setFrame] = useState<number | null>(null);
  // reels switched off (or not known yet): nothing here mentions them
  const reelsOn = useApi(() => FeedService.reelsReady(), []).data?.on === true;
  const [plainBackdrop, setPlainBackdrop] = useState(false);
  const [link, setLink] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // one id for this "New post" box: sending it twice (double click, slow network) still makes one post
  const [clientKey] = useState(newClientKey);
  const sending = useRef(false);
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
        setMedia((x) => [...x, { kind: kind === "video" ? "video" : "image", url: up.url, poster: up.poster, aspect: up.width && up.height ? up.width / up.height : null }]);
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
    // only the second page shares
    if (mode === "media" && step === 1) return;
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      const res = await FeedService.create(slug, { ...(mode === "media" ? { caption: caption.trim(), media: media.map((m, i) => (i === 0 && frame ? { ...m, frame } : m)), plainBackdrop } : { caption: caption.trim(), title: title.trim(), textBg, media: [] }), ...(explicitAllowed ? { explicit } : {}), clientKey });
      toast("Posted", "success");
      onPosted(res.data);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" title={mode === "media" && step === 2 ? "Preview and finish" : "New post"} description={mode === "media" ? `Step ${step} of 2 · ${step === 1 ? "choose your pictures or video" : `sharing with ${communityName}`}` : `Share some text with ${communityName}.`}>
      <form onSubmit={submit} onKeyDown={(e) => { if (e.key === "Enter" && mode === "media" && step === 1 && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault(); }} className="space-y-4">
        {step === 1 && (
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
        )}
        {mode === "text" ? (
          <TextFields title={title} setTitle={setTitle} caption={caption} setCaption={setCaption} textBg={textBg} setTextBg={setTextBg} captionRef={captionRef} suggest={suggest} />
        ) : step === 1 ? (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">
            Pictures or a video <span className="font-normal text-ink-muted">(up to {LIMITS.feedMedia} pictures, or one video)</span>
          </legend>
          {media.length > 0 && (
            <ul className="mb-3 flex flex-wrap gap-2">
              {media.map((m, i) => (
                <li key={`${m.url}${i}`} className="relative size-24 overflow-hidden rounded-control border border-line bg-raised">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img loading="lazy" src={m.kind === "video" ? (m.poster ?? "") : cdn(m.url, { w: 200 })} alt="" className="size-full object-cover" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
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
        ) : (
        <div className="grid gap-5 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
          <PostPreview media={media} at={Math.min(previewAt, media.length - 1)} onAt={setPreviewAt} caption={caption} plain={plainBackdrop} where={reelsOn ? previewIn : "home"} onWhere={setPreviewIn} reelsOn={reelsOn} frame={frame} onFrame={setFrame} />
          <div className="min-w-0 space-y-4">
            <FormatButton area={captionRef} value={caption} onChange={setCaption} />
            <TextArea ref={captionRef} label="Caption (optional)" value={caption} onChange={(e) => setCaption(e.target.value)} onKeyDown={(e) => suggest.onKeyDown(e)} maxLength={LIMITS.feedCaption} counter={LIMITS.feedCaption} placeholder="Say something about it… @someone #tag" />
            {suggest.panel}
            {reelsOn && <div>
              <p className="mb-1.5 text-sm font-medium">Background in reels</p>
              <div role="radiogroup" aria-label="Background in reels" className="grid grid-cols-2 gap-2">
                <Button size="sm" variant={plainBackdrop ? "secondary" : "primary"} role="radio" aria-checked={!plainBackdrop} onClick={() => setPlainBackdrop(false)}>Blurred</Button>
                <Button size="sm" variant={plainBackdrop ? "primary" : "secondary"} role="radio" aria-checked={plainBackdrop} onClick={() => setPlainBackdrop(true)}>Plain</Button>
              </div>
              <p className="mt-1.5 text-xs text-ink-muted">Tall ones fill the screen. Wider ones show whole, with nothing cut off.</p>
            </div>}
          </div>
        </div>
        )}
        {/* a community that allows explicit content: the poster says whether this post is (it's blurred until tapped) */}
        {explicitAllowed && (mode === "text" || step === 2) && (
          <label className="flex items-start gap-2.5 rounded-control border border-line bg-raised/40 p-3 text-sm">
            <input type="checkbox" checked={explicit} onChange={(e) => setExplicit(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent-text)]" />
            <span>
              <span className="block font-semibold">Mark as explicit</span>
              <span className="block text-xs text-ink-muted">It shows blurred until someone taps to view it.</span>
            </span>
          </label>
        )}
        <div className="flex justify-end gap-2 pt-1">
          {mode === "media" && step === 2 ? (
            <Button variant="ghost" onClick={() => setStep(1)}>
              <Icon name="chevron-left" size={15} /> Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          )}
          {mode === "media" && step === 1 ? (
            // its own key: Share takes its place, and reusing this button would send the post on this same click
            <Button key="next" variant="primary" disabled={!media.length || uploading} onClick={() => setStep(2)}>
              Next <Icon name="chevron-right" size={15} />
            </Button>
          ) : (
            <Button key="share" type="submit" variant="primary" loading={busy} disabled={mode === "media" ? !media.length || uploading : !caption.trim() || (caption.trim().length > TEXT_CARD_MAX && !title.trim())}>
              Share
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

/** The Text tab: a title (needed past the card limit), the text, and for a card its colour, with a live preview. */
function TextFields({ title, setTitle, caption, setCaption, textBg, setTextBg, captionRef, suggest }: { title: string; setTitle: (v: string) => void; caption: string; setCaption: (v: string) => void; textBg: TextBackgroundId; setTextBg: (v: TextBackgroundId) => void; captionRef: React.RefObject<HTMLTextAreaElement | null>; suggest: ReturnType<typeof useTagSuggest> }) {
  const text = caption.trim();
  const style = textStyleOf({ media: [], title, caption });
  const needsTitle = text.length > TEXT_CARD_MAX && !title.trim();
  return (
    <div className="space-y-4">
      <TextField label={text.length > TEXT_CARD_MAX ? "Title" : "Title (optional)"} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={FEED_TITLE_MAX} placeholder="What's it about?" error={needsTitle ? "Longer posts need a title." : undefined} hint={text.length > TEXT_CARD_MAX ? undefined : `Short text with no title shows as a colour card. Add a title, or go past ${TEXT_CARD_MAX} characters, for a text post.`} />
      <FormatButton area={captionRef} value={caption} onChange={setCaption} />
      <TextArea ref={captionRef} label="Text" value={caption} onChange={(e) => setCaption(e.target.value)} onKeyDown={(e) => suggest.onKeyDown(e)} maxLength={LIMITS.feedCaption} counter={LIMITS.feedCaption} placeholder="Ask something, share a tip, start a conversation… @someone #tag" />
      {suggest.panel}
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


/** The second page's preview: how it will look in reels and on Home, updating as you type. */
function PostPreview({ media, at, onAt, caption, plain, where, onWhere, reelsOn, frame, onFrame }: { frame: number | null; onFrame: (f: number | null) => void; reelsOn: boolean; media: TopicMediaDTO[]; at: number; onAt: (i: number) => void; caption: string; plain: boolean; where: "reels" | "home"; onWhere: (w: "reels" | "home") => void }) {
  const item = media[at];
  // the post's height comes from its first picture, as it will on Home; a GIF's shape is known once it's loaded
  const [measured, setMeasured] = useState<number | null>(null);
  const first = media[0];
  const shape = postFrame({ aspect: first.aspect ?? measured, frame });
  const measure = (w: number, h: number) => {
    if (item === first && w && h) setMeasured(w / h);
  };
  const still = item.kind === "video" ? (item.poster ?? videoPoster(item.url)) : item.url;
  const reels = where === "reels";
  const shown = item.kind === "video" ? (
    <video key={item.url} src={item.url} poster={still ?? undefined} muted loop autoPlay playsInline onLoadedMetadata={(e) => measure(e.currentTarget.videoWidth, e.currentTarget.videoHeight)} className={cx("relative", reels ? "max-h-full max-w-full object-contain" : "size-full object-contain")} />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.url} alt="" onLoad={(e) => measure(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)} className={cx("relative", reels ? "max-h-full max-w-full object-contain" : "size-full object-contain")} />
  );
  return (
    <div className="space-y-2">
      {reelsOn && <div role="tablist" aria-label="Preview" className="grid grid-cols-2 gap-1 rounded-control bg-raised p-1">
        {(["reels", "home"] as const).map((w) => (
          <button key={w} type="button" role="tab" aria-selected={where === w} onClick={() => onWhere(w)} className={cx("h-8 rounded-[9px] text-[13px] font-semibold transition", where === w ? "bg-ink text-canvas" : "text-ink-muted hover:text-ink")}>
            {w === "reels" ? "Reels" : "Home"}
          </button>
        ))}
      </div>}
      {reels ? (
        <div className="relative mx-auto flex aspect-[9/16] max-h-[52dvh] items-center justify-center overflow-hidden rounded-card bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {still && !plain && <img src={still} alt="" aria-hidden="true" className="absolute inset-0 size-full scale-110 object-cover opacity-30 blur-xl" />}
          {shown}
          <div className="absolute right-2 bottom-16 flex flex-col gap-4 text-white drop-shadow">
            <Icon name="heart" size={21} /><Icon name="message" size={21} /><Icon name="send" size={21} />
          </div>
          {caption.trim() && <p className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/75 to-transparent p-3 pt-8 pr-10 text-[13px] text-white">{caption}</p>}
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <div style={{ aspectRatio: String(shape) }} className="relative max-h-[540px] w-full overflow-hidden bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {still && <img src={still} alt="" aria-hidden="true" className="absolute inset-0 size-full scale-125 object-cover opacity-70 blur-3xl" />}
            {shown}
          </div>
          {caption.trim() && <p className="line-clamp-2 p-2.5 text-[13px]">{caption}</p>}
        </div>
      )}
      {!reels && (
        <div role="radiogroup" aria-label="Post frame" className="grid grid-cols-4 gap-1 rounded-control bg-raised p-1">
          {POST_FRAMES.map((f) => (
            <button key={f.label} type="button" role="radio" aria-checked={frame === f.ratio} onClick={() => onFrame(f.ratio)} className={cx("h-8 rounded-[9px] text-[13px] font-semibold transition", frame === f.ratio ? "bg-ink text-canvas" : "text-ink-muted hover:text-ink")}>
              {f.label}
            </button>
          ))}
        </div>
      )}
      {media.length > 1 && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {media.map((m, i) => (
            <button key={`${m.url}${i}`} type="button" aria-label={`See picture ${i + 1}`} aria-current={i === at} onClick={() => onAt(i)} className={cx("size-9 overflow-hidden rounded-control border-2", i === at ? "border-ink" : "border-transparent opacity-70")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cdn(m.url, { w: 100 })} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
