"use client";

import { useState } from "react";
import ApiClient, { errorMessage } from "@/app/ApiCore";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { FeedMedia } from "@/components/domain/feed/FeedMedia";
import { useMediaViewer } from "@/components/providers/MediaViewerProvider";
import { cdn } from "@/lib/cdn";
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

/** Someone's profile photos and videos to swipe through, with the admin's Delete row under it. */
export function ProfileGallery({ userId, media, className }: { userId: string; media: TopicMediaDTO[]; className?: string }) {
  const [gone, setGone] = useState<string[]>([]);
  const view = useMediaViewer();
  const shown = media.filter((m) => !gone.includes(m.url));
  if (!shown.length) return null;
  return (
    <div>
      {/* a tap opens it bigger, to zoom in and swipe through (no Download or sticker in a gallery, not even your own) */}
      <FeedMedia key={shown.length} media={shown} className={className} openLabel="View bigger" zoomHint onOpen={(i) => view(shown, i)} />
      <AdminMediaRemove userId={userId} media={shown} onRemoved={(url) => setGone((g) => [...g, url])} />
    </div>
  );
}
