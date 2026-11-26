"use client";

import { useEffect, useRef, useState } from "react";
import { CommunityService } from "@/app/services/CommunityService";
import { postTagColor } from "@/lib/postTags";
import { cx } from "@/components/ui/cx";
import { errorMessage } from "@/app/ApiCore";
import { UploadService } from "@/app/services/UploadService";
import { useUploadStatus } from "@/lib/hooks/useUploads";
import { checkFile } from "@/lib/uploads";
import { TopicService } from "@/app/services/TopicService";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { FormatButton } from "@/components/ui/FormatButton";
import { TextArea, TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { MOCK_IMAGES, MOCK_VIDEOS, looksLikeVideo } from "./TopicMedia";
import { Icon } from "@/components/ui/Icon";
import { LIMITS } from "@/lib/constants";
import { cdn } from "@/lib/cdn";
import type { PostTagDTO, TopicDTO, TopicMediaDTO } from "@/lib/types";

/** Write a post, or edit your own: a title, some text, and if you like a few pictures or one video, plus one of the community's tags. */
export function TopicFormModal({ slug, communityName, board, topic, postTags: given, onClose, onSaved }: { slug: string; communityName: string; /** board slug the new post goes in */ board?: string; topic?: TopicDTO; /** the community's tags (fetched when left out) */ postTags?: PostTagDTO[]; onClose: () => void; onSaved: (t: TopicDTO) => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(topic?.title ?? "");
  const [body, setBody] = useState(topic?.body ?? "");
  const bodyArea = useRef<HTMLTextAreaElement>(null);
  // up to a few pictures, or one video on its own (the same rule as community posts)
  const [media, setMedia] = useState<TopicMediaDTO[]>(() => topic?.media.slice(0, LIMITS.topicMedia) ?? []);
  // the community's tags (lib/postTags), like on its posts; older posts' typed tags are kept as they are
  const [tagId, setTagId] = useState<string | null>(topic?.postTag?.id ?? null);
  const [fetched, setFetched] = useState<PostTagDTO[] | null>(null);
  useEffect(() => {
    if (given) return;
    let on = true;
    CommunityService.get(slug).then((r) => on && setFetched(r.data.postTags ?? []), () => {});
    return () => void (on = false);
  }, [given, slug]);
  const postTags = given ?? fetched ?? [];
  const [link, setLink] = useState("");
  const status = useUploadStatus();
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const uploading = progress !== null;
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const hasVideo = media.some((m) => m.kind === "video");
  const full = hasVideo || media.length >= LIMITS.topicMedia;

  async function upload(kind: "photo" | "video", files: FileList | null) {
    const list = Array.from(files ?? []).slice(0, kind === "video" ? 1 : LIMITS.topicMedia - media.length);
    for (const f of list) {
      const problem = checkFile(kind, f);
      if (problem) return toast(`${f.name}: ${problem}`, "error");
    }
    try {
      for (const f of list) {
        setProgress(0);
        const up = await UploadService.upload(kind, f, { onProgress: setProgress });
        setMedia((x) => [...x, { kind: kind === "video" ? "video" : "image", url: up.url, poster: up.poster ?? null }]);
      }
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setProgress(null);
      if (photoRef.current) photoRef.current.value = "";
      if (videoRef.current) videoRef.current.value = "";
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrs({});
    try {
      const input = { title: title.trim(), body: body.trim(), media: media.map((m) => ({ kind: m.kind, url: m.url, poster: m.poster ?? null })) };
      const res = topic ? await TopicService.update(slug, topic.id, { ...input, tagId }) : await TopicService.create(slug, { ...input, board, ...(tagId ? { tagId } : {}) });
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
        <FormatButton area={bodyArea} value={body} onChange={setBody} />
        <TextArea ref={bodyArea} label={media.length ? "Text (optional)" : "Text"} required={!media.length} value={body} onChange={(e) => setBody(e.target.value)} maxLength={LIMITS.topicBody} counter={LIMITS.topicBody} placeholder="Add the details, a question, a plan…" error={errs.body} />

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">
            Pictures or a video <span className="font-normal text-ink-muted">(optional: up to {LIMITS.topicMedia} pictures, or one video)</span>
          </legend>
          {media.length > 0 && (
            <ul className="mb-3 flex flex-wrap gap-2">
              {media.map((m, i) => (
                <li key={`${m.url}${i}`} className="relative size-24 overflow-hidden rounded-control border border-line bg-raised">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img loading="lazy" src={m.kind === "video" ? (m.poster ? cdn(m.poster, { w: 200 }) : "") : cdn(m.url, { w: 200 })} alt="" className="size-full object-cover" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
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
          <input ref={photoRef} type="file" hidden multiple accept=".jpg,.jpeg,.png,.webp,.gif,.avif,.heic,.heif" onChange={(e) => void upload("photo", e.target.files)} aria-label="Choose pictures" />
          <input ref={videoRef} type="file" hidden accept=".mp4,.mov,.webm,.m4v" onChange={(e) => void upload("video", e.target.files)} aria-label="Choose a video" />
          <div className="flex flex-wrap items-center gap-2">
            {status?.photo ? (
              <Button size="sm" variant="secondary" disabled={full || uploading} onClick={() => photoRef.current?.click()}>
                <Icon name="image" size={15} /> Upload pictures
              </Button>
            ) : (
              <Button size="sm" variant="secondary" disabled={full} onClick={() => setMedia((x) => [...x, { kind: "image", url: MOCK_IMAGES[x.length % MOCK_IMAGES.length], poster: null }])}>
                <Icon name="image" size={15} /> Add a sample picture
              </Button>
            )}
            {status?.video ? (
              <Button size="sm" variant="secondary" disabled={media.length > 0 || uploading} onClick={() => videoRef.current?.click()}>
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
          {!full && (
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
                  setMedia((x) => [...x, { kind: isVideo ? "video" : "image", url, poster: null }]);
                  setLink("");
                }}
              >
                Add
              </Button>
            </div>
          )}
          {errs.media && <p role="alert" className="mt-1.5 text-sm text-danger">{errs.media}</p>}
        </fieldset>

        {/* the community's tags (as on its posts): pick one, or none */}
        {postTags.length > 0 && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Tag</legend>
            <div role="radiogroup" aria-label="Tag" className="flex flex-wrap gap-2">
              {postTags.map((g) => {
                const on = tagId === g.id;
                const col = postTagColor(g.color);
                return (
                  <button key={g.id} type="button" role="radio" aria-checked={on} onClick={() => setTagId(on ? null : g.id)} className={cx("inline-flex h-7 items-center rounded-[6px] border px-2.5 text-[12.5px] font-bold transition", on ? "border-transparent" : "border-line text-ink hover:bg-raised")} style={on ? { background: col.bg, color: col.ink } : undefined}>
                    {!on && <span aria-hidden="true" className="mr-1.5 size-2.5 rounded-[3px]" style={{ background: col.bg }} />}
                    {g.name}
                  </button>
                );
              })}
            </div>
            {errs.tagId && <p role="alert" className="mt-1.5 text-sm text-danger">{errs.tagId}</p>}
          </fieldset>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={title.trim().length < 3 || uploading || (!body.trim() && !media.length)}>
            {topic ? "Save changes" : "Post"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
