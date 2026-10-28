"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { FeedService } from "@/app/services/FeedService";
import { AttachedSticker, ReactButton, ReactionBar, StickerPicker, StickerView, type StickerChoice } from "@/components/domain/chat/Reactions";
import { EditedTag, MessageEditor } from "@/components/domain/chat/MessageEditor";
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

/** Replies shown each time you open a thread a bit further. */
const BATCH = 3;

type Reply = { c: FeedCommentDTO; to: FeedCommentDTO["author"] | null };
type Thread = { c: FeedCommentDTO; replies: Reply[] };

/**
 * Instagram style: top-level comments, each with every reply under it in one flat list (oldest first), however deep
 * the reply was made. A reply to a reply carries who it answers (`to`), shown as an @mention. A reply whose comment
 * is hidden becomes a top-level comment.
 */
function threads(list: FeedCommentDTO[]): Thread[] {
  const byId = new Map(list.map((c) => [c.id, c]));
  const rootOf = (c: FeedCommentDTO) => {
    let x = c;
    for (let i = 0; x.parentId && byId.has(x.parentId) && i < 100; i++) x = byId.get(x.parentId)!;
    return x;
  };
  const out = new Map<string, Thread>();
  for (const c of list) if (rootOf(c) === c) out.set(c.id, { c, replies: [] });
  for (const c of list) {
    const root = rootOf(c);
    if (root === c) continue;
    const parent = byId.get(c.parentId!)!;
    out.get(root.id)!.replies.push({ c, to: parent === root ? null : parent.author });
  }
  return [...out.values()];
}

const MENTION = /^@([a-z0-9_]+)/i;

/** A comment's text, its leading @mention (typed, or the person a reply answers) as a link to them. */
function CommentText({ text, to }: { text: string; to: FeedCommentDTO["author"] | null }) {
  const m = MENTION.exec(text);
  const at = (handle: string) => (
    <ProfileTrigger handle={handle} className="font-semibold text-accent-text hover:underline">
      @{handle}
    </ProfileTrigger>
  );
  return (
    <p className="mt-0.5 text-[14px] leading-relaxed break-words whitespace-pre-wrap">
      {m ? (
        <>
          {at(m[1])}
          <Linkified text={text.slice(m[0].length)} />
        </>
      ) : (
        <>
          {to && <>{at(to.handle)} </>}
          <Linkified text={text} />
        </>
      )}
    </p>
  );
}

type Draft = { body: string } & StickerChoice;

/**
 * The comment bar, with a sticker tray like chat (the picked sticker waits above the box until Post). Its text is
 * held outside so Reply can fill it with "@name "; `above` is the "Replying to" strip.
 */
function Composer({ body, setBody, onSend, placeholder, inputRef, above }: { body: string; setBody: (v: string) => void; onSend: (draft: Draft) => Promise<boolean>; placeholder: string; inputRef?: React.Ref<HTMLTextAreaElement>; above?: React.ReactNode }) {
  const [sticker, setSticker] = useState<StickerChoice | null>(null);
  const [tray, setTray] = useState(false);
  const [busy, setBusy] = useState(false);
  async function send() {
    const text = body.trim();
    if ((!text && !sticker) || busy) return;
    setBusy(true);
    if (await onSend({ body: text, ...sticker })) {
      setBody("");
      setSticker(null);
    }
    setBusy(false);
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      {above}
      <AttachedSticker choice={sticker} onRemove={() => setSticker(null)} />
      {/* in the flow, as wide as the box: a popover would be cut off by the scrolling comment list */}
      {tray && <StickerPicker onPick={setSticker} onClose={() => setTray(false)} className="mb-2 w-full! max-w-md!" />}
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          maxLength={LIMITS.feedComment}
          placeholder={placeholder}
          aria-label={placeholder}
          className="max-h-32 min-h-10 flex-1 resize-none rounded-control border border-line bg-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-muted/70 focus:border-accent-text focus:outline-none"
          style={{ fieldSizing: "content" } as React.CSSProperties}
        />
        <button type="button" onClick={() => setTray((o) => !o)} aria-label="Stickers" aria-expanded={tray} title="Stickers" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-raised hover:text-ink">
          <Icon name="sticker" size={19} />
        </button>
        <Button type="submit" size="sm" variant="primary" loading={busy} disabled={!body.trim() && !sticker}>
          Post
        </Button>
      </div>
    </form>
  );
}

/**
 * A post's comments, Instagram style: top-level comments, their replies folded behind "View replies (N)" (a few at a
 * time), and one comment bar: Reply fills it with "@name " and a "Replying to" strip, and the reply lands in that
 * thread, opened. Comments take emoji reactions and stickers.
 * `pinned` (the post viewer): `top` and the comments scroll together and the comment bar stays at the bottom.
 * `focus`: a comment to open its thread at and point out (from a notification).
 */
export function PostComments({ post, onCount, pinned, top, focus }: { post: FeedPostDTO; onCount: (n: number) => void; pinned?: boolean; top?: React.ReactNode; focus?: string | null }) {
  const { user, requireAuth } = useAuth();
  const toast = useToast();
  const now = useNow();
  const slug = post.community.slug;
  const { data, loading, setData } = useApi(() => FeedService.comments(slug, post.id), [slug, post.id]);
  const list = useMemo(() => data ?? [], [data]);
  const all = useMemo(() => threads(list), [list]);
  const [editing, setEditing] = useState<string | null>(null);
  // how many replies each thread shows (none until opened)
  const [shown, setShown] = useState<Map<string, number>>(new Map());
  const show = (root: string, n: number) => setShown((m) => new Map(m).set(root, n));
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; root: string; handle: string } | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  // a comment pointed out for a moment (yours just posted, or the one a notification is about)
  const [flash, setFlash] = useState<string | null>(null);
  const canWrite = post.isMember;

  useEffect(() => {
    if (!flash) return;
    document.getElementById(`comment-${flash}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  // opened from a notification: open the thread that comment is in, and point it out
  const focused = useRef<string | null>(null);
  useEffect(() => {
    if (!focus || focused.current === focus || !data) return;
    focused.current = focus;
    const t = all.find((x) => x.c.id === focus || x.replies.some((r) => r.c.id === focus));
    if (!t) return;
    if (t.c.id !== focus) show(t.c.id, t.replies.length);
    setFlash(focus);
  }, [focus, data, all]);

  function startReply(c: FeedCommentDTO, root: string) {
    if (!requireAuth()) return;
    setReplyTo({ id: c.id, root, handle: c.author.handle });
    setBody(`@${c.author.handle} `);
    requestAnimationFrame(() => {
      const el = input.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }
  // clearing the @mention turns it back into a plain comment
  const typed = (v: string) => {
    setBody(v);
    if (replyTo && !v.startsWith(`@${replyTo.handle}`)) setReplyTo(null);
  };

  async function add(draft: Draft): Promise<boolean> {
    if (!requireAuth()) return false;
    const to = replyTo && draft.body.startsWith(`@${replyTo.handle}`) ? replyTo : null;
    try {
      const res = await FeedService.comment(slug, post.id, { ...draft, parentId: to?.id });
      setData((d) => [...(d ?? []), res.data]);
      onCount(post.commentCount + 1);
      setReplyTo(null);
      // your reply shows in its thread, opened all the way
      if (to) show(to.root, Number.MAX_SAFE_INTEGER);
      setFlash(res.data.id);
      return true;
    } catch (e) {
      toast(errorMessage(e), "error");
      return false;
    }
  }

  /** Your comment's new text: shown at once (with "edited"), saved behind; the old text comes back if that fails. */
  async function saveEdit(c: FeedCommentDTO, body: string): Promise<string | null> {
    const text = body.trim();
    if (!text && !c.sticker && !c.stickerUrl) return "Write something, or delete the comment.";
    setData((d) => (d ?? []).map((x) => (x.id === c.id ? { ...x, body: text, editedAt: new Date().toISOString() } : x)));
    setEditing(null);
    try {
      await FeedService.editComment(slug, post.id, c.id, text);
    } catch (e) {
      setData((d) => (d ?? []).map((x) => (x.id === c.id ? c : x)));
      toast(errorMessage(e), "error");
    }
    return null;
  }

  /** Gone at once ("Comment deleted"); the server is told behind, and it comes back with a note if that fails. */
  async function remove(c: FeedCommentDTO) {
    setData((d) => (d ?? []).map((x) => (x.id === c.id ? { ...x, body: "", sticker: null, stickerUrl: null, deleted: true, reactions: [], canDelete: false } : x)));
    onCount(Math.max(0, post.commentCount - 1));
    try {
      await FeedService.removeComment(slug, post.id, c.id);
    } catch (e) {
      setData((d) => (d ?? []).map((x) => (x.id === c.id ? c : x)));
      onCount(post.commentCount);
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

  const row = (c: FeedCommentDTO, root: string, to: Reply["to"], reply: boolean) => (
    <li key={c.id} id={`comment-${c.id}`} className={cx("-mx-2 flex gap-2.5 rounded-control px-2 py-1 transition-colors duration-700", flash === c.id && "bg-accent/10")}>
      <ProfileTrigger handle={c.author.handle} className="shrink-0 self-start rounded-full">
        <Avatar name={c.author.displayName} src={c.author.avatarUrl} frame={c.author.avatarFrame} size={reply ? 26 : 32} />
      </ProfileTrigger>
      <div className="group min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-[12.5px] text-ink-muted">
          <ProfileTrigger handle={c.author.handle} className="font-semibold text-ink hover:underline">
            <UserName name={c.author.displayName} effect={c.author.nameEffect} />
          </ProfileTrigger>
          <EditedTag at={c.editedAt} />
        </p>
        {c.deleted ? (
          <p className="mt-0.5 text-[14px] text-ink-muted italic">Comment deleted</p>
        ) : editing === c.id ? (
          <MessageEditor className="mt-1" initial={c.body} max={LIMITS.feedComment} onCancel={() => setEditing(null)} onSave={(body) => saveEdit(c, body)} />
        ) : (
          <>
            {c.body && <CommentText text={c.body} to={to} />}
            {(c.sticker || c.stickerUrl) && (
              <div className="mt-1">
                <StickerView id={c.sticker} url={c.stickerUrl} size={52} />
              </div>
            )}
          </>
        )}
        {!c.deleted && <ReactionBar reactions={c.reactions} canReact={canWrite && !!user} onToggle={(k) => void react(c, k)} className="mt-1" />}
        {/* Instagram's line under the comment: when · Reply · react */}
        <div className="mt-1 flex items-center gap-1 text-[12.5px] font-semibold text-ink-muted">
          <time dateTime={c.createdAt} className="pr-1 font-normal">
            {now ? relativeStamp(c.createdAt, now) : ""}
          </time>
          {canWrite && !c.deleted && (
            <button type="button" onClick={() => startReply(c, root)} className="inline-flex h-7 items-center gap-1 rounded-full px-2 hover:bg-raised hover:text-ink">
              Reply
            </button>
          )}
          {canWrite && !c.deleted && <ReactButton onPick={(k) => void react(c, k)} align="left" className="[&>button]:size-7" />}
          {c.canEdit && editing !== c.id && (
            <button type="button" onClick={() => setEditing(c.id)} className="inline-flex h-7 items-center gap-1 rounded-full px-2 opacity-0 transition group-hover:opacity-100 hover:bg-raised hover:text-ink focus:opacity-100 [@media(pointer:coarse)]:opacity-100">
              <Icon name="edit" size={13} /> Edit
            </button>
          )}
          {c.canDelete && (
            <button type="button" onClick={() => void remove(c)} className="inline-flex h-7 items-center gap-1 rounded-full px-2 opacity-0 transition group-hover:opacity-100 hover:bg-raised hover:text-danger focus:opacity-100 [@media(pointer:coarse)]:opacity-100">
              <Icon name="trash" size={13} /> Delete
            </button>
          )}
        </div>
      </div>
    </li>
  );

  const threadOf = (t: Thread) => {
    const n = t.replies.length;
    const open = Math.min(shown.get(t.c.id) ?? 0, n);
    const left = n - open;
    return (
      <li key={t.c.id}>
        <ul>{row(t.c, t.c.id, null, false)}</ul>
        {n > 0 && (
          <div className="pl-[42px]">
            {open > 0 && <ul className="mt-2 space-y-2">{t.replies.slice(0, open).map((r) => row(r.c, t.c.id, r.to, true))}</ul>}
            {/* Instagram's "—— View replies (N)" */}
            <button type="button" onClick={() => show(t.c.id, left ? open + BATCH : 0)} aria-expanded={open > 0} className="mt-1.5 inline-flex h-7 items-center gap-3 text-[12.5px] font-semibold text-ink-muted hover:text-ink">
              <span aria-hidden="true" className="h-px w-6 bg-ink-muted/50" />
              {left ? (open ? `View more replies (${left})` : `View replies (${left})`) : "Hide replies"}
            </button>
          </div>
        )}
      </li>
    );
  };

  const strip = replyTo && (
    <div className="mb-2 flex items-center justify-between gap-2 rounded-control bg-raised px-3 py-1.5 text-[12.5px] text-ink-muted">
      <span>
        Replying to <span className="font-semibold text-ink">@{replyTo.handle}</span>
      </span>
      <button
        type="button"
        onClick={() => {
          setReplyTo(null);
          setBody((b) => b.replace(MENTION, "").trimStart());
        }}
        aria-label="Cancel the reply"
        className="inline-flex size-6 items-center justify-center rounded-full hover:bg-surface hover:text-ink"
      >
        <Icon name="x" size={13} />
      </button>
    </div>
  );
  const box = canWrite ? (
    <Composer body={body} setBody={typed} inputRef={input} above={strip} placeholder={replyTo ? `Reply to @${replyTo.handle}…` : "Add a comment…"} onSend={add} />
  ) : !user ? (
    // signed out: the comments are there to read; writing asks them to log in or sign up
    <button type="button" onClick={() => requireAuth()} className="flex h-10 w-full items-center rounded-control border border-line bg-raised/50 px-3 text-left text-[13px] text-ink-muted transition hover:text-ink">
      <span className="flex-1">Log in to comment…</span>
      <span className="font-semibold text-ink">Log in</span>
    </button>
  ) : <p className="rounded-control border border-line bg-raised/50 px-3 py-2.5 text-[13px] text-ink-muted">Join {post.community.name} to comment.</p>;
  const thread = loading ? <RowSkeleton rows={3} /> : all.length ? <ul className="space-y-4">{all.map(threadOf)}</ul> : <p className="py-6 text-center text-sm text-ink-muted">No comments yet.</p>;

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
