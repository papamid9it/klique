"use client";

import { useRouter } from "next/navigation";
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
import { TopicThread } from "./TopicThread";
import { topicHref } from "./TopicMenu";

const SORTS: { id: TopicSort; label: string }[] = [
  { id: "hot", label: "Hot" },
  { id: "new", label: "New" },
  { id: "top", label: "Top" },
];

/** A community's Reddit-style board. With `topicId` it shows that topic's thread instead of the list. */
export function TopicsPanel({ slug, communityName, isMember, topicId, board }: { slug: string; communityName: string; isMember: boolean; topicId: string | null; board: BoardDTO | null }) {
  const router = useRouter();
  const back = `/communities/${slug}?view=topics${board ? `&b=${board.slug}` : ""}`;
  if (topicId) return <TopicThread backHref={back} onGone={() => router.replace(back, { scroll: false })} />;
  if (!board) return <EmptyState icon="topics" title="No boards yet">Admins can add boards from the sidebar, like Updates or Projects.</EmptyState>;
  return <Board key={board.slug} slug={slug} communityName={communityName} isMember={isMember} board={board} />;
}

function Board({ slug, communityName, isMember, board }: { slug: string; communityName: string; isMember: boolean; board: BoardDTO }) {
  const { requireAuth } = useAuth();
  const router = useRouter();
  const [sort, setSort] = useState<TopicSort>("hot");
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 350);
  const [creating, setCreating] = useState(false);
  const { items, loading, loadingMore, error, hasMore, loadMore, reload, setItems } = usePaged<TopicDTO>((page) => TopicService.list(slug, { board: board.slug, sort, q: dq || undefined, page }), [slug, board.slug, sort, dq]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-ink">{board.name}</h2>
        {board.description && <p className="text-sm text-ink-muted">{board.description}</p>}
        {board.postPolicy === "admins" && <p className="eyebrow mt-1">Only owners and admins post here</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Sort topics" className="inline-flex rounded-full border border-line bg-surface p-0.5">
          {SORTS.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={sort === s.id} onClick={() => setSort(s.id)} className={cx("h-8 rounded-full px-3.5 text-[13px] font-semibold transition", sort === s.id ? "bg-accent text-accent-ink" : "text-ink-muted hover:text-ink")}>
              {s.label}
            </button>
          ))}
        </div>
        <label className="relative min-w-40 flex-1">
          <span className="sr-only">Search topics</span>
          <Icon name="search" size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search topics" className="h-9 w-full rounded-full border border-line bg-surface pr-3 pl-9 text-sm text-ink placeholder:text-ink-muted/70 focus:border-accent-text focus:outline-none" />
        </label>
        {board.canPost ? (
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Icon name="plus" size={15} /> New topic
          </Button>
        ) : isMember ? null : (
          <Button variant="secondary" size="sm" onClick={() => requireAuth()}>
            Join to post
          </Button>
        )}
      </div>

      {loading ? (
        <RowSkeleton rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : items.length === 0 ? (
        <EmptyState icon="topics" title={dq ? "No topics match" : `Nothing in ${board.name} yet`} action={board.canPost && !dq ? <Button variant="primary" onClick={() => setCreating(true)}>Start the first topic</Button> : undefined}>
          {dq ? "Try different words." : `Topics are for longer conversations in ${communityName} that people can comment on, like a forum.`}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {items.map((t) => (
            <li key={t.id}>
              <TopicRow topic={t} scroll={false} onChange={(n) => setItems((prev) => prev.map((x) => (x.id === n.id ? n : x)))} onRemoved={() => setItems((prev) => prev.filter((x) => x.id !== t.id))} />
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
            router.push(topicHref(t), { scroll: false });
          }}
        />
      )}
    </div>
  );
}

