"use client";

import { useState } from "react";
import { TopicService } from "@/app/services/TopicService";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { cx } from "@/components/ui/cx";
import { useDebounced, usePaged } from "@/lib/hooks/useApi";
import type { BoardDTO, TopicDTO, TopicSort } from "@/lib/types";
import { TopicFormModal } from "./TopicFormModal";
import { TopicRow } from "./TopicRow";
import { emitTopic, seedTopic, useTopicEvents } from "./TopicThread";
import { topicHref } from "./TopicMenu";
import { softNavigate } from "@/lib/nav";

const SORTS: { id: TopicSort; label: string }[] = [
  { id: "hot", label: "Hot" },
  { id: "new", label: "New" },
  { id: "top", label: "Top" },
];

/**
 * A community's board, like a Discord forum channel: post cards (tags, title, a taste of the text, a thumbnail,
 * upvotes, replies, last activity). Opening one (`openId`) shows the post and its chat in the right-hand panel;
 * the list stays here, scrolled where it was. Tags filter the board.
 */
export function TopicsPanel({ slug, communityName, isMember, openId, board }: { slug: string; communityName: string; isMember: boolean; openId: string | null; board: BoardDTO | null }) {
  if (!board) return <EmptyState icon="topics" title="No boards yet">Admins can add boards from the sidebar, like Updates or Projects.</EmptyState>;
  return <Board key={board.slug} slug={slug} communityName={communityName} isMember={isMember} board={board} openId={openId} />;
}

function Board({ slug, communityName, isMember, board, openId }: { slug: string; communityName: string; isMember: boolean; board: BoardDTO; openId: string | null }) {
  const { requireAuth } = useAuth();
  const [sort, setSort] = useState<TopicSort>("hot");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const dq = useDebounced(q.trim(), 350);
  const [creating, setCreating] = useState(false);
  const { items, loading, loadingMore, error, hasMore, loadMore, reload, setItems } = usePaged<TopicDTO>((page) => TopicService.list(slug, { board: board.slug, sort, q: dq || undefined, tag: tag ?? undefined, page }), [slug, board.slug, sort, dq, tag], {
    keepPrevious: true,
    key: `topics:${slug}:${board.slug}:${sort}:${dq}:${tag ?? ""}`,
  });
  // likes, comments and edits made in the open topic show here too
  useTopicEvents((e) => {
    if (e.type === "changed") setItems((prev) => (prev.some((x) => x.id === e.topic.id && x !== e.topic) ? prev.map((x) => (x.id === e.topic.id ? e.topic : x)) : prev));
    else setItems((prev) => (prev.some((x) => x.id === e.id) ? prev.filter((x) => x.id !== e.id) : prev));
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-ink">{board.name}</h2>
        {board.description && <p className="text-sm text-ink-muted">{board.description}</p>}
        {board.postPolicy === "admins" && <p className="eyebrow mt-1">Only owners and admins post here</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Sort posts" className="inline-flex rounded-full border border-line bg-surface p-0.5">
          {SORTS.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={sort === s.id} onClick={() => setSort(s.id)} className={cx("h-8 rounded-full px-3.5 text-[13px] font-semibold transition", sort === s.id ? "bg-accent text-accent-ink" : "text-ink-muted hover:text-ink")}>
              {s.label}
            </button>
          ))}
        </div>
        <label className="relative min-w-40 flex-1">
          <span className="sr-only">Search posts</span>
          <Icon name="search" size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search posts" className="h-9 w-full rounded-full border border-line bg-surface pr-3 pl-9 text-sm text-ink placeholder:text-ink-muted/70 focus:border-accent-text focus:outline-none" />
        </label>
        {board.canPost ? (
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Icon name="plus" size={15} /> New post
          </Button>
        ) : isMember ? null : (
          <Button variant="secondary" size="sm" onClick={() => requireAuth()}>
            Join to post
          </Button>
        )}
      </div>

      {tag && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          Tagged
          <button type="button" onClick={() => setTag(null)} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-0.5 text-[12.5px] font-semibold text-accent-ink" aria-label={`Clear the tag filter ${tag}`}>
            {tag} <Icon name="x" size={11} />
          </button>
        </p>
      )}
      {loading && items.length === 0 ? (
        <RowSkeleton rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : items.length === 0 ? (
        <EmptyState icon="topics" title={dq || tag ? "No posts match" : `Nothing in ${board.name} yet`} action={board.canPost && !dq && !tag ? <Button variant="primary" onClick={() => setCreating(true)}>Write the first post</Button> : undefined}>
          {dq || tag ? "Try different words, or another tag." : `Posts are for longer conversations in ${communityName}: each one gets its own chat for replies.`}
        </EmptyState>
      ) : (
        <ul className={cx("space-y-3 transition-opacity", loading && "opacity-60")} aria-busy={loading || undefined}>
          {items.map((t) => (
            <li key={t.id}>
              <TopicRow topic={t} active={t.id === openId} onTag={setTag} onChange={(n) => emitTopic({ type: "changed", topic: n })} onRemoved={() => emitTopic({ type: "removed", id: t.id })} />
            </li>
          ))}
        </ul>
      )}

      {hasMore && !loading && (
        <div className="flex justify-center pt-1">
          <Button variant="secondary" onClick={() => void loadMore()} loading={loadingMore}>
            Load more
          </Button>
        </div>
      )}

      {creating && (
        <TopicFormModal
          slug={slug}
          communityName={communityName}
          board={board.slug}
          onClose={() => setCreating(false)}
          onSaved={(t) => {
            setCreating(false);
            // straight to the top of the list, and open beside it
            setItems((prev) => {
              const rest = prev.filter((x) => x.id !== t.id);
              const at = rest.findIndex((x) => !x.pinned);
              return at < 0 ? [...rest, t] : [...rest.slice(0, at), t, ...rest.slice(at)];
            });
            seedTopic(t);
            softNavigate(topicHref(t));
          }}
        />
      )}
    </div>
  );
}

