"use client";

import { useRef, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { FeedService } from "@/app/services/FeedService";
import { UploadService } from "@/app/services/UploadService";
import { MOCK_IMAGES, MOCK_VIDEOS, looksLikeVideo } from "@/components/domain/topics/TopicMedia";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { cdn } from "@/lib/cdn";
import { LIMITS } from "@/lib/constants";
import { useUploadStatus } from "@/lib/hooks/useUploads";
import { checkFile } from "@/lib/uploads";
import type { FeedPostDTO, TopicMediaDTO } from "@/lib/types";

/** Share a post: pictures (up to ten) or one video, with a caption. */
export function PostComposer({ slug, communityName, onClose, onPosted }: { slug: string; communityName: string; onClose: () => void; onPosted: (p: FeedPostDTO) => void }) {
  const toast = useToast();
  const status = useUploadStatus();
  const [caption, setCaption] = useState("");
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
      const res = await FeedService.create(slug, { caption: caption.trim(), media });
      toast("Posted", "success");
      onPosted(res.data);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" title="New post" description={`Share pictures or a video with ${communityName}.`}>
      <form onSubmit={submit} className="space-y-4">
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
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!media.length || uploading}>
            Share
          </Button>
        </div>
      </form>
    </Modal>
  );
}
