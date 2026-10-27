"use client";

import { useMemo, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { FeedService } from "@/app/services/FeedService";
import { ReactButton, ReactionBar } from "@/components/domain/chat/Reactions";
import { Linkified } from "@/components/domain/topics/parts";
import { useAuth } from "@/components/providers/AuthProvider";
import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { UserName } from "@/components/ui/UserName";
import { cx } from "@/components/ui/cx";
import { LIMITS } from "@/lib/constants";
import { relativeStamp } from "@/lib/format";
import { useApi, useNow } from "@/lib/hooks/useApi";
import { applyReaction, type ReactionKind } from "@/lib/reactions";
import type { FeedCommentDTO, FeedPostDTO, ReactionDTO } from "@/lib/types";
import { sendReaction } from "@/lib/reactQueue";

/** Deepest level drawn indented; replies below it line up under the last level. */
const MAX_DEPTH = 5;

type Tree = { c: FeedCommentDTO; kids: Tree[] };

function nest(list: FeedCommentDTO[]): Tree[] {
  const nodes = new Map(list.map((c) => [c.id, { c, kids: [] as Tree[] }]));
  const roots: Tree[] = [];
  for (const n of nodes.values()) {
    const parent = n.c.parentId ? nodes.get(n.c.parentId) : undefined;
    (parent ?? { kids: roots }).kids.push(n); // a reply whose parent is hidden becomes a top-level comment
  }
  return roots;
}

const count = (n: Tree): number => n.kids.reduce((s, k) => s + 1 + count(k), 0);

/** A box to write a comment or a reply. */
function Composer({ onSend, placeholder, autoFocus, onCancel }: { onSend: (body: string) => Promise<boolean>; placeholder: string; autoFocus?: boolean; onCancel?: () => void }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    if (await onSend(text)) setBody("");
    setBusy(false);
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
      className="flex items-end gap-2"
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void send();
          } else if (e.key === "Escape" && onCancel) onCancel();
        }}
        rows={1}
        autoFocus={autoFocus}
        maxLength={LIMITS.feedComment}
        placeholder={placeholder}
        aria-label={placeholder}
        className="max-h-32 min-h-10 flex-1 resize-none rounded-control border border-line bg-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-muted/70 focus:border-accent-text focus:outline-none"
        style={{ fieldSizing: "content" } as React.CSSProperties}
      />
      {onCancel && (
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      )}
      <Button type="submit" size="sm" variant="primary" loading={busy} disabled={!body.trim()}>
        {onCancel ? "Reply" : "Post"}
      </Button>
    </form>
  );
}

/**
 * A post's comments, Reddit style: replies nest under what they answer with a thread line down each level
 * (click it to fold the branch), a reply box opens right under the comment, and comments take emoji reactions.
 */
/**
 * `pinned` (the post viewer): `top` and the comments scroll together and the comment box stays at the bottom,
 * like Instagram.
 */
export function PostComments({ post, onCount, pinned, top }: { post: FeedPostDTO; onCount: (n: number) => void; pinned?: boolean; top?: React.ReactNode }) {
  const { user, requireAuth } = useAuth();
  const toast = useToast();
  const now = useNow();
  const slug = post.community.slug;
  const { data, loading, setData } = useApi(() => FeedService.comments(slug, post.id), [slug, post.id]);
  const list = useMemo(() => data ?? [], [data]);
  const tree = useMemo(() => nest(list), [list]);
  const [replying, setReplying] = useState<string | null>(null);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const canWrite = post.isMember;

  async function add(body: string, parentId?: string): Promise<boolean> {
    if (!requireAuth()) return false;
    try {
      const res = await FeedService.comment(slug, post.id, body, parentId);
      setData((d) => [...(d ?? []), res.data]);
      onCount(post.commentCount + 1);
      setReplying(null);
      return true;
    } catch (e) {
      toast(errorMessage(e), "error");
      return false;
    }
  }

  async function remove(c: FeedCommentDTO) {
    try {
      await FeedService.removeComment(slug, post.id, c.id);
      setData((d) => (d ?? []).map((x) => (x.id === c.id ? { ...x, body: "", deleted: true, reactions: [], canDelete: false } : x)));
      onCount(Math.max(0, post.commentCount - 1));
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  /** Shown at once; the server's counts land when the last request for this comment answers (rolled back on failure). */
  async function react(c: FeedCommentDTO, kind: ReactionKind) {
    if (!requireAuth()) return;
    const set = (reactions: ReactionDTO[]) => setData((d) => (d ?? []).map((x) => (x.id === c.id ? { ...x, reactions } : x)));
    const before = list.find((x) => x.id === c.id)?.reactions ?? c.reactions;
    set(applyReaction(before, kind));
    const err = await sendReaction(`feed-comment:${c.id}`, before, async () => (await FeedService.react(slug, post.id, c.id, kind)).data, set, set);
    if (err) toast(errorMessage(err), "error");
  }

  const node = (n: Tree, depth: number) => {
    const c = n.c;
    const shut = folded.has(c.id);
    const replies = count(n);
    return (
      <li key={c.id} className="relative">
        <div className="flex gap-2.5">
          <ProfileTrigger handle={c.author.handle} className="shrink-0 self-start rounded-full">
            <Avatar name={c.author.displayName} src={c.author.avatarUrl} frame={c.author.avatarFrame} size={depth ? 26 : 32} />
          </ProfileTrigger>
          <div className="group min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-2 text-[12.5px] text-ink-muted">
              <ProfileTrigger handle={c.author.handle} className="font-semibold text-ink hover:underline">
                <UserName name={c.author.displayName} effect={c.author.nameEffect} />
              </ProfileTrigger>
              <time dateTime={c.createdAt}>{now ? relativeStamp(c.createdAt, now) : ""}</time>
            </p>
            {c.deleted ? (
              <p className="mt-0.5 text-[14px] text-ink-muted italic">Comment deleted</p>
            ) : (
              <p className="mt-0.5 text-[14px] leading-relaxed break-words whitespace-pre-wrap">
                <Linkified text={c.body} />
              </p>
            )}
            {!c.deleted && <ReactionBar reactions={c.reactions} canReact={canWrite && !!user} onToggle={(k) => void react(c, k)} className="mt-1" />}
            <div className="mt-1 flex items-center gap-1 text-[12.5px] font-semibold text-ink-muted">
              {canWrite && !c.deleted && (
                <button type="button" onClick={() => setReplying(replying === c.id ? null : c.id)} className="inline-flex h-7 items-center gap-1 rounded-full px-2 hover:bg-raised hover:text-ink">
                  <Icon name="reply" size={13} /> Reply
                </button>
              )}
              {canWrite && !c.deleted && <ReactButton onPick={(k) => void react(c, k)} align="left" className="[&>button]:size-7" />}
              {c.canDelete && (
                <button type="button" onClick={() => void remove(c)} className="inline-flex h-7 items-center gap-1 rounded-full px-2 opacity-0 transition group-hover:opacity-100 hover:bg-raised hover:text-danger focus:opacity-100">
                  <Icon name="trash" size={13} /> Delete
                </button>
              )}
              {replies > 0 && shut && (
                <button type="button" onClick={() => setFolded((f) => (f.delete(c.id), new Set(f)))} className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-accent-text hover:bg-raised">
                  <Icon name="chevron-down" size={13} /> {replies} {replies === 1 ? "reply" : "replies"}
                </button>
              )}
            </div>
            {replying === c.id && (
              <div className="mt-2">
                <Composer autoFocus placeholder={`Reply to ${c.author.displayName}`} onSend={(body) => add(body, c.id)} onCancel={() => setReplying(null)} />
              </div>
            )}
          </div>
        </div>
        {n.kids.length > 0 && !shut && (
          <div className="relative mt-3">
            {/* the thread line: click it to fold this branch */}
            <button type="button" onClick={() => setFolded((f) => new Set(f).add(c.id))} aria-label={`Hide ${replies} ${replies === 1 ? "reply" : "replies"}`} title="Hide replies" className={cx("absolute top-0 bottom-0 w-4 -translate-x-1/2 cursor-pointer before:absolute before:inset-y-0 before:left-1/2 before:w-px before:bg-line hover:before:bg-ink-muted", depth ? "left-[13px]" : "left-[16px]")} />
            <ul className={cx("space-y-3", depth < MAX_DEPTH ? (depth ? "pl-[30px]" : "pl-[38px]") : "")}>{n.kids.map((k) => node(k, Math.min(depth + 1, MAX_DEPTH)))}</ul>
          </div>
        )}
      </li>
    );
  };

  const box = canWrite ? <Composer placeholder="Add a comment…" onSend={(body) => add(body)} /> : <p className="rounded-control border border-line bg-raised/50 px-3 py-2.5 text-[13px] text-ink-muted">Join {post.community.name} to comment.</p>;
  const thread = loading ? <RowSkeleton rows={3} /> : tree.length ? <ul className="space-y-4">{tree.map((n) => node(n, 0))}</ul> : <p className="py-6 text-center text-sm text-ink-muted">No comments yet.</p>;

  if (pinned) {
    return (
      <section aria-label="Comments" className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {top}
          {thread}
        </div>
        <div className="border-t border-line px-4 py-3">{box}</div>
      </section>
    );
  }
  return (
    <section aria-label="Comments" className="space-y-4">
      {box}
      {thread}
    </section>
  );
}
