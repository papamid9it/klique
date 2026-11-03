"use client";

import { useRef, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { ProfileService } from "@/app/services/ProfileService";
import { SubscriptionService } from "@/app/services/SubscriptionService";
import { UploadService } from "@/app/services/UploadService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useMediaViewer } from "@/components/providers/MediaViewerProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Dropdown } from "@/components/ui/Dropdown";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { cdn } from "@/lib/cdn";
import { useApi } from "@/lib/hooks/useApi";
import { PLAN_NAMES } from "@/lib/plans";
import type { TopicMediaDTO, UserMe } from "@/lib/types";

/** how long a profile video may be */
export const PROFILE_VIDEO_SECONDS = 30;
const VIDEO_EXT = /\.(mp4|mov|webm|m4v)$/i;

/** A video's length in seconds, read on the device before anything is uploaded. */
function videoSeconds(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    const url = URL.createObjectURL(file);
    v.onloadedmetadata = () => (URL.revokeObjectURL(url), resolve(v.duration || 0));
    v.onerror = () => (URL.revokeObjectURL(url), resolve(0));
    v.src = url;
  });
}

/**
 * Settings → Gallery: your profile photos and videos (shown on your profile card), any mix. How many slots you have
 * comes from your plan (Free 2, Lite 4, Pro 6 by default). After a paid plan ends nothing is hidden or deleted, but
 * you can't add or replace until you're within your plan again (you can still remove and reorder). Each change
 * saves at once; the server deletes files you replaced or removed.
 */
export function ProfileMediaEditor({ me }: { me: UserMe }) {
  const { setUser } = useAuth();
  const view = useMediaViewer();
  const toast = useToast();
  const plan = useApi(() => SubscriptionService.mine(), [], { key: "my-plan" });
  const [items, setItems] = useState<TopicMediaDTO[]>(me.media ?? []);
  const [busy, setBusy] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const target = useRef<number>(0);

  const c = plan.data?.config;
  const p = plan.data?.plan ?? "free";
  const slots = c ? c.mediaSlots[p] : 0;
  // over your plan's slots (a paid plan ended): remove this many before adding or replacing
  const over = c ? Math.max(0, items.length - slots) : 0;
  const upgrade = p !== "pro" ? ", or upgrade" : "";

  async function save(next: TopicMediaDTO[]) {
    const prev = items;
    setItems(next);
    try {
      setUser((await ProfileService.setMedia(next)).data);
    } catch (e) {
      setItems(prev);
      toast(errorMessage(e), "error");
    }
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    const i = target.current;
    const isVideo = VIDEO_EXT.test(file.name) || file.type.startsWith("video/");
    const replacing = items[i];
    if (over || (!replacing && items.length >= slots)) {
      toast(over ? `You're on ${PLAN_NAMES[p]}: remove ${over} to add new ones${upgrade}.` : `${PLAN_NAMES[p]} has ${slots} slots${upgrade ? ". Upgrade for more" : ""}.`, "error");
      return;
    }
    if (isVideo && (await videoSeconds(file)) > PROFILE_VIDEO_SECONDS + 0.5) {
      toast(`Profile videos can be up to ${PROFILE_VIDEO_SECONDS} seconds. Trim it and try again.`, "error");
      return;
    }
    setBusy(i);
    setProgress(0);
    try {
      const up = await UploadService.upload(isVideo ? "video" : "photo", file, { onProgress: setProgress });
      const item: TopicMediaDTO = { kind: isVideo ? "video" : "image", url: up.url, poster: isVideo ? up.poster : null };
      const next = [...items];
      if (replacing) next[i] = item;
      else next.push(item);
      await save(next);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  const choose = (i: number) => {
    target.current = i;
    input.current?.click();
  };

  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
    const next = [...items];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    void save(next);
  };
  const used = items.length;

  return (
    <section aria-labelledby="pm-h">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 id="pm-h" className="text-[13px] font-medium">
          Gallery
        </h3>
        {c && (
          <span className="rounded-full border border-line px-2.5 py-0.5 text-[11.5px] text-ink-muted">
            {used} of {slots} used · {PLAN_NAMES[p]}
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-ink-muted">
        {c ? `${slots} photos or videos, any mix, videos up to ${PROFILE_VIDEO_SECONDS}s. The first one is your main photo. Drag to reorder. No explicit content.` : "Loading your plan…"}
      </p>
      {over > 0 && (
        <p role="status" className="mb-3 rounded-control border border-line bg-raised px-3 py-2 text-[13px]">
          You&apos;re on {PLAN_NAMES[p]}, which has {slots} {slots === 1 ? "slot" : "slots"}: remove {over} to add new ones
          {upgrade && (
            <>
              , or{" "}
              <a href="/pricing" className="font-medium text-accent-text underline">
                upgrade
              </a>
            </>
          )}
          . Everything stays on your profile until then.
        </p>
      )}
      <input ref={input} type="file" accept="image/*,video/mp4,video/quicktime,video/webm" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {Array.from({ length: c ? Math.max(items.length, slots) + (p !== "pro" && items.length <= slots ? 1 : 0) : 2 }).map((_, i) => {
          const m = items[i];
          const locked = !!c && !m && i >= slots;
          const loading = busy === i;
          return (
            <li
              key={m?.url ?? `empty-${i}`}
              draggable={!!m && busy === null}
              onDragStart={() => setDragFrom(i)}
              onDragOver={(e) => m && dragFrom !== null && e.preventDefault()}
              onDrop={() => (dragFrom !== null && reorder(dragFrom, i), setDragFrom(null))}
              onDragEnd={() => setDragFrom(null)}
              className={cx("group relative aspect-[4/5] overflow-hidden rounded-2xl bg-raised", m && "cursor-grab active:cursor-grabbing", dragFrom === i && "opacity-50")}
            >
              {m ? (
                <>
                  <button type="button" onClick={() => view(items, i)} aria-label={`View ${m.kind === "video" ? "video" : "photo"} ${i + 1} bigger`} className="group/zoom block size-full cursor-zoom-in">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cdn(m.kind === "video" ? (m.poster ?? m.url) : m.url, { w: 480 })} alt="" draggable={false} className="size-full object-cover" />
                    <span aria-hidden="true" className="pointer-events-none absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10.5px] font-semibold text-white opacity-0 transition group-hover/zoom:opacity-100">
                      <Icon name="zoom-in" size={11} /> Zoom
                    </span>
                  </button>
                  <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2">
                    <span className="flex gap-1">
                      {i === 0 && <span className="rounded-full bg-black/65 px-2 py-0.5 text-[10.5px] font-semibold text-white">Main</span>}
                      {m.kind === "video" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[10.5px] font-semibold text-white">
                          <Icon name="play" size={9} /> Video
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="absolute top-1.5 right-1.5">
                    <Dropdown
                      align="right"
                      width={190}
                      label="Photo options"
                      items={[
                        { label: "View bigger", icon: "zoom-in" as const, onSelect: () => view(items, i) },
                        ...(i > 0 ? [{ label: "Make main", icon: "check" as const, onSelect: () => reorder(i, 0) }] : []),
                        ...(i > 0 ? [{ label: "Move earlier", icon: "chevron-left" as const, onSelect: () => reorder(i, i - 1) }] : []),
                        ...(i < items.length - 1 ? [{ label: "Move later", icon: "chevron-right" as const, onSelect: () => reorder(i, i + 1) }] : []),
                        ...(over ? [] : [{ label: "Replace", icon: "image" as const, onSelect: () => choose(i) }]),
                        { type: "sep" as const },
                        { label: "Remove", icon: "trash" as const, danger: true, onSelect: () => void save(items.filter((_, j) => j !== i)) },
                      ]}
                      trigger={({ props }) => (
                        <button {...props} aria-label="Photo options" className="inline-flex size-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80">
                          <Icon name="more" size={16} />
                        </button>
                      )}
                    />
                  </div>
                </>
              ) : locked ? (
                <a href="/pricing" className="flex size-full flex-col items-center justify-center gap-1.5 p-3 text-center text-xs text-ink-muted hover:text-ink">
                  <Icon name="lock" size={18} />
                  <span>{p === "free" ? "More with Lite or Pro" : "More with Pro"}</span>
                </a>
              ) : (
                <button type="button" disabled={!c || busy !== null || i !== items.length} onClick={() => choose(i)} className="flex size-full flex-col items-center justify-center gap-1.5 text-xs text-ink-muted transition hover:bg-line/40 hover:text-ink disabled:pointer-events-none disabled:opacity-40">
                  <span className="inline-flex size-9 items-center justify-center rounded-full border border-line bg-surface">
                    <Icon name="plus" size={18} />
                  </span>
                  {i === 0 ? "Add your main photo" : "Add"}
                </button>
              )}
              {loading && <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-semibold text-white">{Math.round(progress * 100)}%</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
