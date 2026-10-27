"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FeedService } from "@/app/services/FeedService";
import { useAuth } from "@/components/providers/AuthProvider";
import { pointsNote } from "@/lib/points";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { softNavigate } from "@/lib/nav";
import type { CommunityDTO, FeedPostDTO } from "@/lib/types";
import { PostCard } from "./PostCard";
import { PostComposer } from "./PostComposer";
import { PostDialog } from "./PostDialog";
import { FeedFooter, useInfiniteFeed } from "./useInfiniteFeed";

/**
 * A community's Posts section: pictures and videos with captions, newest first, one column, loading more as you
 * scroll (Back returns to the same spot). A post opens big (?p=<id>) with its comments.
 */
export function FeedPanel({ c }: { c: CommunityDTO }) {
  const sp = useSearchParams();
  const { user } = useAuth();
  const openId = sp.get("p");
  const [composing, setComposing] = useState(false);
  const feed = useInfiniteFeed<FeedPostDTO>(`feed:${c.slug}`, async (page, at) => (await FeedService.list(c.slug, page, at)).data, (p) => p.id);
  const items = feed.items ?? [];
  const setItems = feed.setItems;
  const [opened, setOpened] = useState<FeedPostDTO | null>(null);
  const patch = (p: FeedPostDTO) => {
    setItems((list) => list.map((x) => (x.id === p.id ? p : x)));
    setOpened((o) => (o && o.id === p.id ? p : o));
  };

  // the address says which post is open: from the list when it's there, else fetched (a shared link)
  useEffect(() => {
    if (!openId) return setOpened(null);
    const here = items.find((x) => x.id === openId);
    if (here) return setOpened(here);
    let live = true;
    FeedService.get(c.slug, openId).then(
      (r) => live && setOpened(r.data),
      () => live && setOpened(null),
    );
    return () => {
      live = false;
    };
  }, [openId, c.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (p: FeedPostDTO) => softNavigate(`/communities/${c.slug}?view=posts&p=${p.id}`);
  const close = () => softNavigate(`/communities/${c.slug}?view=posts`);

  return (
    <div ref={feed.anchor as React.RefObject<HTMLDivElement>} className="mx-auto max-w-[730px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Posts</h2>
          <p className="text-sm text-ink-muted">{c.feedPolicy === "admins" ? "Pictures and videos from the organisers." : `Pictures and videos from ${c.name}.`}</p>
        </div>
        {c.canPostToFeed ? (
          <Button variant="primary" size="sm" onClick={() => setComposing(true)}>
            <Icon name="plus" size={15} /> New post
          </Button>
        ) : c.feedPolicy === "members" && c.viewer.pointsToPost ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5 text-[12.5px] font-semibold text-ink-muted" title={pointsNote(c.viewer.pointsToPost, user?.points ?? 0)}>
            <Icon name="lock" size={13} /> Posting needs {c.viewer.pointsToPost.toLocaleString("en-NG")} points · you have {(user?.points ?? 0).toLocaleString("en-NG")}
          </span>
        ) : null}
      </div>

      {!feed.items ? (
        feed.error ? <ErrorState message={feed.error} onRetry={() => void feed.load(true)} /> : <RowSkeleton rows={3} />
      ) : !items.length ? (
        <EmptyState icon="image" title="No posts yet" action={c.canPostToFeed ? <Button variant="primary" onClick={() => setComposing(true)}>Share the first one</Button> : undefined}>
          {c.feedPolicy === "admins" ? "The organisers' pictures and videos will show up here." : "Pictures and videos from members will show up here."}
        </EmptyState>
      ) : (
        <ul className="space-y-5">
          {items.map((p) => (
            <li key={p.id}>
              <PostCard post={p} onChange={patch} onRemoved={() => setItems((list) => list.filter((x) => x.id !== p.id))} onOpenComments={() => open(p)} />
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && <FeedFooter hasMore={feed.hasMore} error={feed.error} onRetry={() => void feed.load(false)} sentinel={feed.sentinel} end={`That's every post in ${c.name}.`} />}

      {composing && (
        <PostComposer
          slug={c.slug}
          communityName={c.name}
          explicitAllowed={c.explicit}
          onClose={() => setComposing(false)}
          onPosted={(p) => {
            setComposing(false);
            setItems((list) => [p, ...list]);
          }}
        />
      )}
      <PostDialog post={opened} onChange={patch} onClose={close} />
    </div>
  );
}
