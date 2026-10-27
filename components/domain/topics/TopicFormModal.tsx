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
import { MOCK_IMAGES, looksLikeVideo } from "./TopicMedia";
import { Icon } from "@/components/ui/Icon";
import { LIMITS } from "@/lib/constants";
import { cdn } from "@/lib/cdn";
import type { TopicDTO, TopicMediaDTO } from "@/lib/types";

/** Write a post, or edit your own: a title, some text, and if you like one picture (no video), plus a few tags. */
export function TopicFormModal({ slug, communityName, board, topic, onClose, onSaved }: { slug: string; communityName: string; /** board slug the new post goes in */ board?: string; topic?: TopicDTO; onClose: () => void; onSaved: (t: TopicDTO) => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(topic?.title ?? "");
  const [body, setBody] = useState(topic?.body ?? "");
  // one picture: an older post with a video or several pictures keeps its first picture
  const [image, setImage] = useState<TopicMediaDTO | null>(() => topic?.media.find((m) => m.kind === "image") ?? null);
  const [tags, setTags] = useState<string[]>(topic?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [link, setLink] = useState("");
  const status = useUploadStatus();
  const photoRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const uploading = progress !== null;
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});

  async function upload(file: File | undefined) {
    if (!file) return;
    const problem = checkFile("photo", file);
    if (problem) return toast(problem, "error");
    try {
      setProgress(0);
      const up = await UploadService.upload("photo", file, { onProgress: setProgress });
      setImage({ kind: "image", url: up.url, poster: null });
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setProgress(null);
      if (photoRef.current) photoRef.current.value = "";
    }
  }

  function addTag(raw: string) {
    const t = raw.trim().toLowerCase().replace(/\s+/g, " ").slice(0, LIMITS.topicTag);
    if (!t || tags.includes(t) || tags.length >= LIMITS.topicTags) return;
    setTags((x) => [...x, t]);
    setTagDraft("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrs({});
    try {
      const pending = tagDraft.trim() ? [...tags, tagDraft.trim().toLowerCase()].slice(0, LIMITS.topicTags) : tags;
      const input = { title: title.trim(), body: body.trim(), media: image ? [image] : [], tags: pending };
      const res = topic ? await TopicService.update(slug, topic.id, input) : await TopicService.create(slug, { ...input, board });
      toast(topic ? "Post updated" : "Posted", "success");
      onSaved(res.data);
    } catch (err) {
      setErrs((err as { errors?: Record<string, string> }).errors ?? {});
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" title={topic ? "Edit post" : "New post"} description={topic ? undefined : `Start a conversation in ${communityName}. It gets its own chat for replies.`}>
      <form onSubmit={submit} className="space-y-4">
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIMITS.topicTitle} required autoFocus placeholder="What's it about?" error={errs.title} />
        <TextArea label={image ? "Text (optional)" : "Text"} required={!image} value={body} onChange={(e) => setBody(e.target.value)} maxLength={LIMITS.topicBody} counter={LIMITS.topicBody} placeholder="Add the details, a question, a plan…" error={errs.body} />

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">
            Picture <span className="font-normal text-ink-muted">(optional, one)</span>
          </legend>
          {image ? (
            <div className="relative w-fit overflow-hidden rounded-control border border-line bg-raised">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cdn(image.url, { w: 480 })} alt="The post's picture" className="max-h-48 w-auto object-contain" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
              <button type="button" onClick={() => setImage(null)} aria-label="Remove the picture" className="absolute top-1.5 right-1.5 inline-flex size-6 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black">
                <Icon name="x" size={12} />
              </button>
            </div>
          ) : (
            <>
              <input ref={photoRef} type="file" hidden accept=".jpg,.jpeg,.png,.webp,.gif,.avif,.heic,.heif" onChange={(e) => void upload(e.target.files?.[0])} aria-label="Choose a picture" />
              <div className="flex flex-wrap items-center gap-2">
                {status?.photo ? (
                  <Button size="sm" variant="secondary" disabled={uploading} onClick={() => photoRef.current?.click()}>
                    <Icon name="image" size={15} /> Upload a picture
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setImage({ kind: "image", url: MOCK_IMAGES[Math.floor(Math.random() * MOCK_IMAGES.length)], poster: null })}>
                    <Icon name="image" size={15} /> Add a sample picture
                  </Button>
                )}
                {uploading && (
                  <span role="status" className="font-mono text-xs text-ink-muted">
                    Uploading {Math.round((progress ?? 0) * 100)}%
                  </span>
                )}
              </div>
              <div className="mt-2 flex gap-2">
                <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Or paste a picture link (https://…)" aria-label="Picture link" className="h-9 min-w-0 flex-1 rounded-control border border-line bg-surface px-3 text-sm placeholder:text-ink-muted/70 focus:border-accent-text focus:outline-none" />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!/^https?:\/\//i.test(link.trim())}
                  onClick={() => {
                    const url = link.trim();
                    if (looksLikeVideo(url)) return toast("Posts take a picture, not a video.", "error");
                    setImage({ kind: "image", url, poster: null });
                    setLink("");
                  }}
                >
                  Add
                </Button>
              </div>
            </>
          )}
          {errs.media && <p role="alert" className="mt-1.5 text-sm text-danger">{errs.media}</p>}
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">
            Tags <span className="font-normal text-ink-muted">(up to {LIMITS.topicTags}, helps people find it)</span>
          </legend>
          <div className="flex flex-wrap items-center gap-1.5 rounded-control border border-line bg-surface p-1.5 focus-within:border-accent-text">
            {tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-raised py-0.5 pr-1 pl-2.5 text-[13px] font-medium">
                {t}
                <button type="button" onClick={() => setTags((x) => x.filter((y) => y !== t))} aria-label={`Remove the tag ${t}`} className="inline-flex size-5 items-center justify-center rounded-full text-ink-muted hover:bg-line hover:text-ink">
                  <Icon name="x" size={10} />
                </button>
              </span>
            ))}
            {tags.length < LIMITS.topicTags && (
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag(tagDraft);
                  } else if (e.key === "Backspace" && !tagDraft && tags.length) setTags((x) => x.slice(0, -1));
                }}
                onBlur={() => addTag(tagDraft)}
                maxLength={LIMITS.topicTag}
                placeholder={tags.length ? "Add another" : "e.g. question, gear, meetup"}
                aria-label="Add a tag"
                className="h-7 min-w-32 flex-1 bg-transparent px-1.5 text-sm placeholder:text-ink-muted/70 focus:outline-none"
              />
            )}
          </div>
          {errs.tags && <p role="alert" className="mt-1.5 text-sm text-danger">{errs.tags}</p>}
          <p className="mt-1.5 text-xs text-ink-muted">Press Enter or a comma after each tag.</p>
        </fieldset>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={title.trim().length < 3 || uploading || (!body.trim() && !image)}>
            {topic ? "Save changes" : "Post"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
