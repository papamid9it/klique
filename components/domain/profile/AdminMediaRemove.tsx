"use client";

import Link from "next/link";
import { useState } from "react";
import ApiClient, { errorMessage } from "@/app/ApiCore";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useMediaViewer } from "@/components/providers/MediaViewerProvider";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { cdn, videoPoster } from "@/lib/cdn";
import type { TopicMediaDTO } from "@/lib/types";
import { useConfirm } from "@/components/providers/ConfirmProvider";

const api = new ApiClient();

/**
 * Site admins only, under someone's profile gallery: remove one of their photos or videos (it's deleted from
 * storage too, and logged in the admin audit log).
 */
export function AdminMediaRemove({ userId, media, onRemoved }: { userId: string; media: TopicMediaDTO[]; onRemoved: (url: string) => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  if (!user?.isAdmin || user.id === userId || !media.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-muted">
      <span>Admin:</span>
      {media.map((m, i) => (
        <button
          key={m.url}
          type="button"
          disabled={busy !== null}
          onClick={async () => {
            if (!(await confirm({ title: `Delete ${m.kind === "video" ? "video" : "photo"} ${i + 1}?`, body: "It's removed from this profile for good, and logged." }))) return;
            setBusy(m.url);
            try {
              await api.delete(`/api/admin/users/${userId}/media?url=${encodeURIComponent(m.url)}`);
              onRemoved(m.url);
              toast("Removed", "success");
            } catch (e) {
              toast(errorMessage(e), "error");
            } finally {
              setBusy(null);
            }
          }}
          className="inline-flex items-center gap-1 rounded-full border border-danger/50 py-0.5 pr-2 pl-0.5 text-danger hover:bg-danger/10"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cdn(m.kind === "video" ? (m.poster ?? m.url) : m.url, { w: 48 })} alt="" className="size-4 rounded-full object-cover" />
          Delete {i + 1}
        </button>
      ))}
    </div>
  );
}

/** A square of the gallery: the picture, or a video's still frame with a small play mark on it. */
function GalleryThumb({ item, width, className }: { item: TopicMediaDTO; width: number; className?: string }) {
  const still = item.kind === "video" ? (item.poster ?? videoPoster(item.url)) : item.url;
  return (
    <span className={cx("relative block aspect-square overflow-hidden bg-raised", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {still && <img src={cdn(still, { w: width })} alt="" loading="lazy" className="size-full object-cover" />}
      {item.kind === "video" && (
        <span className="absolute right-1 bottom-1 inline-flex size-5 items-center justify-center rounded-full bg-black/60 text-white">
          <Icon name="play" size={11} />
        </span>
      )}
    </span>
  );
}

/**
 * The gallery on a full profile: a slim row with the first few, which opens a popup with all of them in a grid; a tap
 * there opens one bigger, to zoom in and swipe through (no Download or sticker in a gallery, not even your own). The
 * admin's Delete row is in the popup. On your own profile with nothing in it yet, the row is the way to add some.
 */
export function ProfileGallery({ userId, media, isSelf, onNavigate }: { userId: string; media: TopicMediaDTO[]; isSelf: boolean; onNavigate: () => void }) {
  const [gone, setGone] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const view = useMediaViewer();
  const shown = media.filter((m) => !gone.includes(m.url));
  const row = "flex w-full items-center gap-1.5 rounded-control py-1 text-left hover:bg-raised/60";
  if (!shown.length) {
    if (!isSelf) return null;
    return (
      <Link href="/settings#gallery" onClick={onNavigate} className={row}>
        <span className="inline-flex size-12 items-center justify-center rounded-control bg-raised text-ink-muted"><Icon name="image" size={20} /></span>
        <span className="ml-1.5 flex-1 text-sm font-semibold">Add photos</span>
        <Icon name="chevron-right" size={16} className="text-ink-muted" />
      </Link>
    );
  }
  const title = `Gallery · ${shown.length}`;
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={row}>
        {shown.slice(0, 3).map((m) => <GalleryThumb key={m.url} item={m} width={96} className="size-12 shrink-0 rounded-control" />)}
        <span className="ml-1.5 flex-1 text-sm font-semibold">{title}</span>
        <Icon name="chevron-right" size={16} className="text-ink-muted" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        <div className="grid grid-cols-3 gap-1.5">
          {shown.map((m, i) => (
            <button key={m.url} type="button" onClick={() => view(shown, i)} aria-label={`View ${m.kind === "video" ? "video" : "photo"} ${i + 1} of ${shown.length}`} className="block rounded-control transition-opacity hover:opacity-85">
              <GalleryThumb item={m} width={320} className="rounded-control" />
            </button>
          ))}
        </div>
        <AdminMediaRemove userId={userId} media={shown} onRemoved={(url) => setGone((g) => [...g, url])} />
        {isSelf && (
          <Link href="/settings#gallery" onClick={onNavigate} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-control border border-line text-sm font-semibold hover:bg-raised">
            <Icon name="edit" size={15} /> Manage gallery
          </Link>
        )}
      </Modal>
    </div>
  );
}
