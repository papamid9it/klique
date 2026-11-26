"use client";

import { useState } from "react";
import { FeedService } from "@/app/services/FeedService";
import { PostCard } from "@/components/domain/feed/PostCard";
import { PostDialog, usePostOverlay } from "@/components/domain/feed/PostDialog";
import { FeedFooter, useInfiniteFeed } from "@/components/domain/feed/useInfiniteFeed";
import { useAuth } from "@/components/providers/AuthProvider";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import type { FeedPostDTO, HomeFeedItem } from "@/lib/types";

/**
 * Home's Popular tab: the posts with the most love and comments (text posts too), today or this week, from your
 * communities and public ones. Comments open in the post pop-up, as everywhere.
 */
export function PopularFeed() {
  const { status } = useAuth();
  const [range, setRange] = useState<"today" | "week">("today");
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="When" className="flex gap-2">
        {(["today", "week"] as const).map((r) => (
          <button key={r} type="button" role="tab" aria-selected={range === r} onClick={() => setRange(r)} className={cx("h-9 rounded-control px-3.5 text-[14px] transition", range === r ? "bg-ink font-bold text-canvas" : "border border-line font-semibold hover:bg-raised")}>
            {r === "today" ? "Today" : "This week"}
          </button>
        ))}
      </div>
      <PopularList key={range} range={range} authed={status === "authed"} />
    </div>
  );
}

function PopularList({ range, authed }: { range: "today" | "week"; authed: boolean }) {
  const { items, hasMore, error, load, setItems, sentinel } = useInfiniteFeed<HomeFeedItem>(`popular-${range}`, async (page, at) => (await FeedService.popular(range, page, at)).data, (x) => x.post.id, authed);
  const { opened, open, close } = usePostOverlay();
  const patch = (p: FeedPostDTO) => setItems((list) => list.map((x) => (x.post.id === p.id ? { ...x, post: p } : x)));
  const drop = (id: string) => setItems((list) => list.filter((x) => x.post.id !== id));
  if (!items) return <RowSkeleton rows={4} />;
  if (!items.length) return <EmptyState icon="heart" title="Nothing popular yet">{range === "today" ? "Try This week." : "When posts get love and comments, they show up here."}</EmptyState>;
  return (
    <>
      <ul className="space-y-4">
        {items.map((it) => (
          <li key={it.post.id}>
            <PostCard post={it.post} trending={!it.post.isMember} showCommunity onChange={patch} onRemoved={() => drop(it.post.id)} onOpenComments={() => open(it.post)} />
          </li>
        ))}
      </ul>
      <FeedFooter hasMore={hasMore} error={error} onRetry={() => void load(false)} sentinel={sentinel} end={<>That&apos;s everything popular {range === "today" ? "today" : "this week"}.</>} />
      <PostDialog post={opened} onChange={patch} onClose={close} />
    </>
  );
}
