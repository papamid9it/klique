"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { FeedService } from "@/app/services/FeedService";
import { KliquePhotoCard } from "@/components/domain/crews/parts";
import { NewPostsPill, useNewerPosts } from "@/components/domain/feed/NewPosts";
import { PostCard } from "@/components/domain/feed/PostCard";
import { PostDialog, usePostOverlay } from "@/components/domain/feed/PostDialog";
import { usePlace } from "@/components/providers/PlaceProvider";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import type { CommunityHomeItem, EventDTO, FeedPostDTO, UserBrief } from "@/lib/types";
import { EventFeedCard } from "./HomeFeed";

const keyOf = (it: CommunityHomeItem) => (it.kind === "event" ? `e${it.event.id}` : it.kind === "klique" ? `k${it.klique.id}` : `p${it.post.id}`);

/**
 * Home's Communities style, below your places: a scrolling mix the server builds (mostly events, then kliques you
 * could join, a few posts from your communities: 5 / 3 / 2 in every 10, lib/constants COMMUNITY_HOME_MIX). Pages
 * load as you near the end; "New posts" shows when your communities have posted since.
 */
export function CommunityHomeFeed() {
  const { where, ready } = usePlace();
  const [items, setItems] = useState<CommunityHomeItem[] | null>(null);
  const [page, setPage] = useState(0);
  const [at, setAt] = useState<number | undefined>();
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newer, setNewer] = useState<UserBrief[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const { opened, open, close } = usePostOverlay();

  const load = useCallback(
    async (fresh = false) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const next = fresh ? 1 : page + 1;
        const res = (await FeedService.communityHome(next, fresh ? undefined : at, where)).data;
        setItems((prev) => {
          const base = fresh ? [] : (prev ?? []);
          const seen = new Set(base.map(keyOf));
          return [...base, ...res.items.filter((x) => !seen.has(keyOf(x)))];
        });
        setPage(next);
        setAt(res.at);
        setMore(res.hasMore);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [busy, page, at, where],
  );

  // first page once the place is known, and again when it changes
  useEffect(() => {
    if (ready) void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, where]);

  // the next page as the end comes near
  useEffect(() => {
    const el = end.current;
    if (!el || !more) return;
    const io = new IntersectionObserver((entries) => entries.some((x) => x.isIntersecting) && void load(), { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [load, more]);

  const posts = (items ?? []).flatMap((x) => (x.kind === "post" ? [x.post] : []));
  useNewerPosts(items ? posts : null, async () => (await FeedService.communityHome(1, undefined, where)).data.items.flatMap((x) => (x.kind === "post" ? [x.post] : [])), setNewer);

  const patchEvent = (e: EventDTO) => setItems((list) => (list ?? []).map((x) => (x.kind === "event" && x.event.id === e.id ? { kind: "event", event: e } : x)));
  const patchPost = (p: FeedPostDTO) => setItems((list) => (list ?? []).map((x) => (x.kind === "post" && x.post.id === p.id ? { kind: "post", post: p } : x)));
  const dropPost = (id: string) => setItems((list) => (list ?? []).filter((x) => !(x.kind === "post" && x.post.id === id)));
  const dropKlique = (id: string) => setItems((list) => (list ?? []).filter((x) => !(x.kind === "klique" && x.klique.id === id)));

  return (
    <section aria-label="For you" className="mx-auto mt-8 max-w-[640px]">
      <NewPostsPill
        authors={newer}
        onClick={() => {
          setNewer([]);
          window.scrollTo({ top: 0, behavior: "smooth" });
          void load(true);
        }}
        className="sticky top-3 z-20 mx-auto mb-3"
      />
      <h2 className="mb-3 text-sm font-semibold text-ink-muted">For you</h2>
      {items === null ? (
        error ? <ErrorState message={error} onRetry={() => void load(true)} /> : <RowSkeleton rows={4} />
      ) : (
        <div className="flex flex-col gap-5">
          {items.map((x) =>
            x.kind === "event" ? (
              <EventFeedCard key={keyOf(x)} e={x.event} onChange={patchEvent} findKlique />
            ) : x.kind === "klique" ? (
              <KliquePhotoCard key={keyOf(x)} crew={x.klique} className="aspect-[4/5] max-h-[540px] w-full" onDismiss={() => dropKlique(x.klique.id)} />
            ) : (
              <PostCard key={keyOf(x)} post={x.post} showCommunity onChange={patchPost} onRemoved={() => dropPost(x.post.id)} onOpenComments={() => open(x.post)} />
            ),
          )}
          {error && items.length > 0 && <ErrorState message={error} onRetry={() => void load()} />}
          {busy && <RowSkeleton rows={2} />}
          {!more && items.length > 0 && <p className="py-6 text-center text-sm text-ink-muted">You&apos;re all caught up.</p>}
          {!busy && items.length === 0 && <p className="py-6 text-center text-sm text-ink-muted">Nothing new yet. Join a few communities and their events will show here.</p>}
          <div ref={end} aria-hidden="true" />
        </div>
      )}
      <PostDialog post={opened} onChange={patchPost} onClose={close} />
    </section>
  );
}
