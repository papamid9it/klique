"use client";

import { FeedService } from "@/app/services/FeedService";
import { PostCard } from "@/components/domain/feed/PostCard";
import { PostDialog, usePostOverlay } from "@/components/domain/feed/PostDialog";
import { FeedFooter, useInfiniteFeed } from "@/components/domain/feed/useInfiniteFeed";
import { useAuth } from "@/components/providers/AuthProvider";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/States";
import type { FeedPostDTO, HomeFeedItem } from "@/lib/types";

/**
 * Home's Popular tab: the posts with the most love and comments (text posts too) from today (the last 7 days when
 * today is quiet), in your communities and public ones. No filters. Comments open in the post pop-up.
 */
export function PopularFeed() {
  const { status } = useAuth();
  const { items, hasMore, error, load, setItems, sentinel } = useInfiniteFeed<HomeFeedItem>("popular", async (page, at) => (await FeedService.popular("auto", page, at)).data, (x) => x.post.id, status === "authed");
  const { opened, open, close } = usePostOverlay();
  const patch = (p: FeedPostDTO) => setItems((list) => list.map((x) => (x.post.id === p.id ? { ...x, post: p } : x)));
  const drop = (id: string) => setItems((list) => list.filter((x) => x.post.id !== id));
  if (!items) return <RowSkeleton rows={4} />;
  if (!items.length) return <EmptyState icon="heart" title="Nothing popular yet">When posts get love and comments, they show up here.</EmptyState>;
  return (
    <>
      <ul className="space-y-4">
        {items.map((it) => (
          <li key={it.post.id}>
            <PostCard post={it.post} trending={!it.post.isMember} showCommunity onChange={patch} onRemoved={() => drop(it.post.id)} onOpenComments={() => open(it.post)} />
          </li>
        ))}
      </ul>
      <FeedFooter hasMore={hasMore} error={error} onRetry={() => void load(false)} sentinel={sentinel} end={<>That&apos;s everything popular for now.</>} />
      <PostDialog post={opened} onChange={patch} onClose={close} />
    </>
  );
}
