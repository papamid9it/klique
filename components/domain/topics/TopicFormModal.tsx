"use client";

import { useRef, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { UploadService } from "@/app/services/UploadService";
import { useUploadStatus } from "@/lib/hooks/useUploads";
import { checkFile } from "@/lib/uploads";
import { TopicService } from "@/app/services/TopicService";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { TextArea, TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { looksLikeVideo, MOCK_IMAGES, MOCK_VIDEOS } from "./TopicMedia";
import { Icon } from "@/components/ui/Icon";
import { LIMITS } from "@/lib/constants";
import type { TopicDTO, TopicMediaDTO } from "@/lib/types";

/** Start a topic, or edit your own. */
export function TopicFormModal({ slug, communityName, board, topic, onClose, onSaved }: { slug: string; communityName: string; /** board slug the new topic goes in */ board?: string; topic?: TopicDTO; onClose: () => void; onSaved: (t: TopicDTO) => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(topic?.title ?? "");
  const [body, setBody] = useState(topic?.body ?? "");
  const [media, setMedia] = useState<TopicMediaDTO[]>(topic?.media ?? []);
  const [link, setLink] = useState("");
  const hasVideo = media.some((m) => m.kind === "video");
  const status = useUploadStatus();
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const uploading = progress !== null;

  async function upload(kind: "photo" | "video", files: FileList | null) {
    const list = Array.from(files ?? []).slice(0, kind === "video" ? 1 : LIMITS.topicMedia - media.length);
    if (!list.length) return;
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
      if (photoRef.current) photoRef.current.value = "";
      if (videoRef.current) videoRef.current.value = "";
    }
  }
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrs({});
    try {
      const input = { title: title.trim(), body: body.trim(), media };
      const res = topic ? await TopicService.update(slug, topic.id, input) : await TopicService.create(slug, { ...input, board });
      toast(topic ? "Topic updated" : "Topic posted", "success");
      onSaved(res.data);
    } catch (err) {
      setErrs((err as { errors?: Record<string, string> }).errors ?? {});
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" title={topic ? "Edit topic" : "New topic"} description={topic ? undefined : `Start a discussion in ${communityName}. Members can comment and like.`}>
      <form onSubmit={submit} className="space-y-4">
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIMITS.topicTitle} required autoFocus placeholder="What do you want to talk about?" error={errs.title} />
        <TextArea label={media.length > 0 ? "Text (optional)" : "Text"} required={media.length === 0} value={body} onChange={(e) => setBody(e.target.value)} maxLength={LIMITS.topicBody} counter={LIMITS.topicBody} placeholder="Add the details, a question, a plan…" error={errs.body} />
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Pictures or a video <span className="font-normal text-ink-muted">(or write text instead)</span></legend>
          {media.length > 0 && (
            <ul className="mb-3 flex flex-wrap gap-2">
              {media.map((m, i) => (
                <li key={`${m.url}${i}`} className="relative size-20 overflow-hidden rounded-control border border-line bg-raised">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.kind === "video" ? (m.poster ?? "") : m.url} alt="" className="size-full object-cover" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
                  {m.kind === "video" && <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white"><Icon name="video" size={20} /></span>}
                  <button type="button" onClick={() => setMedia((x) => x.filter((_, k) => k !== i))} aria-label={`Remove ${m.kind} ${i + 1}`} className="absolute top-1 right-1 inline-flex size-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black">
                    <Icon name="x" size={11} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input ref={photoRef} type="file" hidden multiple accept=".jpg,.jpeg,.png,.webp,.gif,.avif" onChange={(e) => void upload("photo", e.target.files)} aria-label="Choose pictures" />
          <input ref={videoRef} type="file" hidden accept=".mp4,.mov,.webm,.m4v" onChange={(e) => void upload("video", e.target.files)} aria-label="Choose a video" />
          <div className="flex flex-wrap items-center gap-2">
            {status?.photo ? (
              <Button size="sm" variant="secondary" disabled={hasVideo || media.length >= LIMITS.topicMedia || uploading} onClick={() => photoRef.current?.click()}>
                <Icon name="image" size={15} /> Upload pictures
              </Button>
            ) : (
              <Button size="sm" variant="secondary" disabled={hasVideo || media.length >= LIMITS.topicMedia} onClick={() => setMedia((x) => [...x, { kind: "image", url: MOCK_IMAGES[x.length % MOCK_IMAGES.length], poster: null }])}>
                <Icon name="image" size={15} /> Add sample picture
              </Button>
            )}
            {status?.video ? (
              <Button size="sm" variant="secondary" disabled={media.length > 0 || uploading} onClick={() => videoRef.current?.click()}>
                <Icon name="video" size={15} /> Upload video
              </Button>
            ) : (
              <Button size="sm" variant="secondary" disabled={media.length > 0} onClick={() => setMedia([{ kind: "video", ...MOCK_VIDEOS[Math.floor(Math.random() * MOCK_VIDEOS.length)] }])}>
                <Icon name="video" size={15} /> Add sample video
              </Button>
            )}
            {uploading && (
              <span role="status" className="font-mono text-xs text-ink-muted">
                Uploading {Math.round((progress ?? 0) * 100)}%
              </span>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Or paste a picture / video link (https://…)" aria-label="Picture or video link" className="h-9 min-w-0 flex-1 rounded-control border border-line bg-surface px-3 text-sm placeholder:text-ink-muted/70 focus:border-accent-text focus:outline-none" />
            <Button
              size="sm"
              variant="secondary"
              disabled={!/^https?:\/\//i.test(link.trim())}
              onClick={() => {
                const url = link.trim();
                const video = looksLikeVideo(url);
                if ((video && media.length > 0) || (!video && hasVideo) || media.length >= LIMITS.topicMedia) return toast(video ? "A video can't be mixed with pictures" : "Remove the video first, or the limit is reached", "error");
                setMedia((x) => [...x, { kind: video ? "video" : "image", url, poster: null }]);
                setLink("");
              }}
            >
              Add
            </Button>
          </div>
          {errs.media && <p role="alert" className="mt-1.5 text-sm text-danger">{errs.media}</p>}
          <p className="mt-1.5 text-xs text-ink-muted">{status?.photo || status?.video ? "Pictures up to 10 MB, one video up to 100 MB." : "Uploads aren't set up yet, so sample files and links stand in."}</p>
        </fieldset>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={title.trim().length < 3 || uploading || (!body.trim() && media.length === 0)}>
            {topic ? "Save changes" : "Post topic"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
