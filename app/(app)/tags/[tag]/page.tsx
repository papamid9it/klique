"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import ApiClient from "@/app/ApiCore";
import { PostCard } from "@/components/domain/feed/PostCard";
import { Button } from "@/components/ui/Button";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { useApi } from "@/lib/hooks/useApi";
import type { Envelope, FeedPostDTO } from "@/lib/types";

const api = new ApiClient();
type TagPage = { tag: string; items: FeedPostDTO[]; hasMore: boolean; total: number };

/** /tags/<tag>: public posts with this #tag, newest first, and what else is trending. */
export default function TagPage() {
  const { tag: raw } = useParams<{ tag: string }>();
  const router = useRouter();
  const tag = decodeURIComponent(raw).replace(/^#/, "").toLowerCase();
  const [pages, setPages] = useState<FeedPostDTO[][]>([]);
  const [more, setMore] = useState<{ page: number; hasMore: boolean } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const first = useApi(() => api.get<Envelope<TagPage>>(`/api/tags/${encodeURIComponent(tag)}`), [tag], { key: `tag:${tag}` });
  const trending = useApi(() => api.get<Envelope<{ tag: string; count: number }[]>>("/api/tags/trending"), [], { key: "tags-trending" });
  const items = [...(first.data?.items ?? []), ...pages.flat()];
  const hasMore = more ? more.hasMore : !!first.data?.hasMore;
  const patch = (p: FeedPostDTO) => {
    first.setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === p.id ? p : x)) } : d));
    setPages((ps) => ps.map((list) => list.map((x) => (x.id === p.id ? p : x))));
  };

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = (more?.page ?? 1) + 1;
      const r = (await api.get<Envelope<TagPage>>(`/api/tags/${encodeURIComponent(tag)}`, { page: String(next) })).data;
      setPages((p) => [...p, r.items]);
      setMore({ page: next, hasMore: r.hasMore });
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="mx-auto max-w-[730px]">
      <header className="mb-5">
        <p className="eyebrow">Tag</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">#{tag}</h1>
        {first.data && <p className="mt-1 text-sm text-ink-muted">{first.data.total.toLocaleString("en-NG")} public {first.data.total === 1 ? "post" : "posts"}</p>}
      </header>
      {(trending.data ?? []).length > 0 && (
        <div className="no-bar -mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Trending tags">
          {trending.data!.map((t) => (
            <Link key={t.tag} href={`/tags/${t.tag}`} className={cx("shrink-0 rounded-full border px-3 py-1 text-sm transition", t.tag === tag ? "border-accent-text font-semibold text-ink" : "border-line text-ink-muted hover:text-ink")}>
              #{t.tag}
            </Link>
          ))}
        </div>
      )}
      {first.loading && !first.data ? (
        <RowSkeleton rows={3} />
      ) : first.error && !first.data ? (
        <ErrorState message={first.error} onRetry={first.reload} />
      ) : !items.length ? (
        <EmptyState icon="hash" title={`No posts with #${tag} yet`}>
          Add #{tag} to a post in one of your communities and it shows up here.
        </EmptyState>
      ) : (
        <ul className="space-y-5">
          {items.map((p) => (
            <li key={p.id}>
              <PostCard post={p} showCommunity onChange={patch} onRemoved={() => void first.reload()} onOpenComments={() => router.push(`/p/${p.id}`)} />
            </li>
          ))}
        </ul>
      )}
      {hasMore && items.length > 0 && (
        <div className="mt-6 flex justify-center">
          <Button onClick={() => void loadMore()} loading={loadingMore}>
            Show more
          </Button>
        </div>
      )}
    </div>
  );
}
