"use client";

import Link from "next/link";
import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { EventService } from "@/app/services/EventService";
import { TopicService } from "@/app/services/TopicService";
import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { UserName } from "@/components/ui/UserName";
import { LIMITS } from "@/lib/constants";
import { formatDateShort, formatTime } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import { softNavigate } from "@/lib/nav";
import type { BoardDTO } from "@/lib/types";
import { useTopicEvents } from "./TopicThread";

/**
 * Reddit-style sidebar beside a board on wide screens, while no topic is open: what the board is, its rules,
 * what's trending and who's been most active this week, and the community's next events. Opening a topic swaps
 * it for that topic's comments; closing the topic brings it back. Refreshes live as people post and comment.
 */
export function BoardSidebar({ slug, communityId, board, onBoardChanged }: { slug: string; communityId: string; board: BoardDTO; onBoardChanged: () => void }) {
  const side = useApi(() => TopicService.boardSidebar(slug, board.id), [slug, board.id], { key: `board-side:${slug}:${board.id}` });
  const events = useApi(() => EventService.list({ community: slug, page: 1 }), [slug], { key: `board-side-events:${slug}` });
  // someone posted, liked or commented somewhere in this community: refresh (and the board's counts and rules)
  useRealtimeEvent(
    () => {
      void side.reload();
      onBoardChanged();
    },
    { filter: (e) => e.type === "topic" && e.communityId === communityId, debounceMs: 1500 },
  );
  // likes and comments made on this screen
  useTopicEvents(() => void side.reload());

  const open = (id: string) => softNavigate(`/communities/${slug}?view=topics&b=${board.slug}&t=${id}`);
  const upcoming = (events.data?.items ?? []).slice(0, 3);
  const d = side.data;

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      <section aria-label={`About ${board.name}`} className="rounded-card border border-line bg-surface p-4">
        <p className="eyebrow">Board</p>
        <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em]">{board.name}</h2>
        {board.description && <p className="mt-1 text-sm text-ink-muted">{board.description}</p>}
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
          <div className="rounded-control bg-raised px-3 py-2">
            <dt className="text-[11px] text-ink-muted">Topics</dt>
            <dd className="font-mono text-base font-semibold">{board.topicCount}</dd>
          </div>
          <div className="rounded-control bg-raised px-3 py-2">
            <dt className="text-[11px] text-ink-muted">Who can post</dt>
            <dd className="font-semibold">{board.postPolicy === "admins" ? "Admins" : "Members"}</dd>
          </div>
        </dl>
      </section>

      <Rules slug={slug} board={board} canEdit={!!d?.canEdit} onSaved={onBoardChanged} />

      <section aria-label="Trending this week" className="rounded-card border border-line bg-surface p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon name="heart" size={15} className="text-accent-text" /> Trending this week
        </h3>
        {!d ? (
          <Rows />
        ) : d.trending.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-muted">Nothing yet. Topics people like and comment on this week show up here.</p>
        ) : (
          <ol className="mt-2 space-y-0.5">
            {d.trending.map((t, i) => (
              <li key={t.id}>
                <button type="button" onClick={() => open(t.id)} className="flex w-full items-start gap-2.5 rounded-control px-2 py-1.5 text-left transition hover:bg-raised">
                  <span className="mt-px w-4 shrink-0 font-mono text-[12px] font-semibold text-ink-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[13.5px] font-medium">{t.title}</span>
                    <span className="mt-0.5 flex gap-3 font-mono text-[11px] text-ink-muted">
                      <span>♥ {t.likeCount}</span>
                      <span>💬 {t.commentCount}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-label="Top contributors this week" className="rounded-card border border-line bg-surface p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon name="users" size={15} className="text-accent-text" /> Top contributors this week
        </h3>
        {!d ? (
          <Rows />
        ) : d.contributors.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-muted">No one yet. Start a topic or join a conversation.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {d.contributors.map((c) => (
              <li key={c.user.id}>
                <ProfileTrigger handle={c.user.handle} className="flex w-full items-center gap-2.5 rounded-control px-2 py-1.5 text-left transition hover:bg-raised">
                  <Avatar name={c.user.displayName} src={c.user.avatarUrl} frame={c.user.avatarFrame} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold">
                      <UserName name={c.user.displayName} effect={c.user.nameEffect} />
                    </span>
                    <span className="block font-mono text-[11px] text-ink-muted">
                      {[c.topics ? `${c.topics} ${c.topics === 1 ? "topic" : "topics"}` : "", c.comments ? `${c.comments} ${c.comments === 1 ? "comment" : "comments"}` : ""].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </ProfileTrigger>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Coming up" className="rounded-card border border-line bg-surface p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon name="calendar" size={15} className="text-accent-text" /> Coming up
        </h3>
        {events.loading && !events.data ? (
          <Rows />
        ) : upcoming.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-muted">No events planned yet.</p>
        ) : (
          <ul className="mt-2 space-y-0.5">
            {upcoming.map((e) => (
              <li key={e.id}>
                <Link href={`/events/${e.id}`} className="flex items-center gap-3 rounded-control px-2 py-1.5 transition hover:bg-raised">
                  <span className="flex w-11 shrink-0 flex-col items-center rounded-control bg-raised py-1 leading-none">
                    <span className="text-[10px] font-semibold text-accent-text uppercase">{formatDateShort(e.startsAt).split(" ")[2]}</span>
                    <span className="text-base font-semibold">{formatDateShort(e.startsAt).split(" ")[1]}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{e.title}</span>
                    <span className="block truncate text-[11.5px] text-ink-muted">
                      {formatTime(e.startsAt)} · {e.online ? "Online" : e.venue}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Rows() {
  return (
    <div className="mt-3 space-y-2" aria-busy="true">
      <Skeleton className="h-8" />
      <Skeleton className="h-8" />
    </div>
  );
}

/** The board's rules, one per line. Owners and admins edit them in place. */
function Rules({ slug, board, canEdit, onSaved }: { slug: string; board: BoardDTO; canEdit: boolean; onSaved: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(board.rules);
  const [busy, setBusy] = useState(false);
  const lines = board.rules
    .split("\n")
    .map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, "").trim())
    .filter(Boolean);
  if (!lines.length && !canEdit) return null;

  async function save() {
    setBusy(true);
    try {
      await TopicService.updateBoard(slug, board.id, { rules: text.trim() });
      setEditing(false);
      onSaved();
      toast("Rules saved", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Board rules" className="rounded-card border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <h3 className="flex flex-1 items-center gap-2 text-sm font-semibold">
          <Icon name="shield" size={15} className="text-accent-text" /> Rules
        </h3>
        {canEdit && !editing && (
          <button type="button" onClick={() => (setText(board.rules), setEditing(true))} className="rounded-full px-2.5 py-1 text-[12px] font-semibold text-accent-text hover:bg-raised">
            {lines.length ? "Edit" : "Add rules"}
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-2">
          <label htmlFor={`rules-${board.id}`} className="sr-only">
            Rules for {board.name}, one per line
          </label>
          <textarea
            id={`rules-${board.id}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            maxLength={LIMITS.boardRules}
            placeholder={"One rule per line, e.g.\nBe kind\nNo spam or self-promo\nCredit the original creator"}
            className="w-full resize-y rounded-control border border-line bg-raised px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-muted/70 focus:border-accent-text focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-ink-muted">
              {text.length}/{LIMITS.boardRules}
            </span>
            <span className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" onClick={() => void save()} loading={busy}>
                Save
              </Button>
            </span>
          </div>
        </div>
      ) : lines.length ? (
        <ol className="mt-2 space-y-1.5">
          {lines.map((l, i) => (
            <li key={i} className="flex gap-2.5 text-[13.5px]">
              <span className="w-4 shrink-0 font-mono text-[12px] font-semibold text-ink-muted">{i + 1}</span>
              <span className="min-w-0 break-words">{l}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-[13px] text-ink-muted">No rules yet. Add a few so people know what belongs here.</p>
      )}
    </section>
  );
}
