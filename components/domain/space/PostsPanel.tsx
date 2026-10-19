"use client";

import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { SpaceService } from "@/app/services/SpaceService";
import { ReportDialog } from "@/components/domain/ReportDialog";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { TextArea, TextField } from "@/components/ui/Field";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { LIMITS } from "@/lib/constants";
import { formatDateShort } from "@/lib/format";
import { usePaged } from "@/lib/hooks/useApi";
import type { PostDTO } from "@/lib/types";
import { ConfirmModal } from "./parts";
import { UserName } from "@/components/ui/UserName";

/** Updates feed for a community or group, with a composer for people who can post. */
export function PostsPanel({ slug, subSlug, canPost }: { slug: string; subSlug?: string; canPost: boolean }) {
  const { user } = useAuth();
  const toast = useToast();
  const { items, loading, loadingMore, error, hasMore, loadMore, reload, setItems } = usePaged<PostDTO>((p) => SpaceService.posts(slug, subSlug, p), [slug, subSlug]);
  const [body, setBody] = useState("");
  const [image, setImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<PostDTO | null>(null);
  const [reporting, setReporting] = useState<PostDTO | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setFieldErr({});
    try {
      const res = await SpaceService.createPost(slug, { body: body.trim(), imageUrl: image.trim() || null }, subSlug);
      setItems((prev) => [res.data, ...prev]);
      setBody("");
      setImage("");
      toast("Posted", "success");
    } catch (err) {
      const errors = (err as { errors?: Record<string, string> }).errors;
      if (errors) setFieldErr(errors);
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {canPost ? (
        <form onSubmit={submit} className="space-y-3 rounded-card border border-line bg-surface p-4">
          <TextArea label="Post an update" value={body} onChange={(e) => setBody(e.target.value)} maxLength={LIMITS.postBody} counter={LIMITS.postBody} placeholder="Share news, a plan, a photo link…" error={fieldErr.body} />
          <TextField label="Image URL (optional)" type="url" value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://…" error={fieldErr.imageUrl} />
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={busy} disabled={!body.trim()}>
              Post
            </Button>
          </div>
        </form>
      ) : (
        <p className="rounded-card border border-line bg-surface px-4 py-3 text-sm text-ink-muted">Join to post updates here.</p>
      )}

      {loading ? (
        <RowSkeleton rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <EmptyState icon="message" title="No updates yet" compact>
          {canPost ? "Be the first to post something." : "Nothing has been posted here yet."}
        </EmptyState>
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((p) => (
              <li key={p.id}>
                <article className="rounded-card border border-line bg-surface p-4">
                  <header className="flex items-center gap-3">
                    <Avatar name={p.author.displayName} src={p.author.avatarUrl} frame={p.author.avatarFrame} size={36} />
                    <div className="min-w-0 flex-1">
                      <ProfileTrigger handle={p.author.handle} className="block truncate text-sm font-semibold hover:underline text-left">
                        <UserName name={p.author.displayName} effect={p.author.nameEffect} />
                      </ProfileTrigger>
                      <p className="font-mono text-[11px] text-ink-muted">
                        @{p.author.handle} · {formatDateShort(p.createdAt)}
                        {p.pinned && " · Pinned"}
                      </p>
                    </div>
                  </header>
                  <p className="mt-3 text-[15px] leading-relaxed break-words whitespace-pre-wrap">{p.body}</p>
                  {p.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt="" loading="lazy" className="mt-3 max-h-96 w-full rounded-control object-cover" />
                  )}
                  <footer className="mt-3 flex justify-end gap-1">
                    {user && p.author.id !== user.id && (
                      <Button size="sm" variant="ghost" onClick={() => setReporting(p)}>
                        Report
                      </Button>
                    )}
                    {p.canDelete && (
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(p)} className="text-danger">
                        Delete
                      </Button>
                    )}
                  </footer>
                </article>
              </li>
            ))}
          </ul>
          {hasMore && (
            <div className="flex justify-center">
              <Button onClick={loadMore} loading={loadingMore}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete this post?"
        description="This can't be undone."
        confirmLabel="Delete post"
        onConfirm={async () => {
          if (!deleting) return;
          await SpaceService.deletePost(slug, deleting.id, subSlug);
          setItems((prev) => prev.filter((x) => x.id !== deleting.id));
          toast("Post deleted", "success");
        }}
      />
      {reporting && <ReportDialog open onClose={() => setReporting(null)} targetType="post" targetId={reporting.id} subject="this post" />}
    </div>
  );
}
