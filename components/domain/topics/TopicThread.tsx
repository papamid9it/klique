"use client";

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { errorMessage } from "@/app/ApiCore";
import { TopicService } from "@/app/services/TopicService";
import { MessageEditor } from "@/components/domain/chat/MessageEditor";
import { ConfirmModal } from "@/components/domain/space/parts";
import { SpaceError } from "@/components/domain/space/parts";
import { useAuth } from "@/components/providers/AuthProvider";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Dropdown, type MenuEntry } from "@/components/ui/Dropdown";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { cx } from "@/components/ui/cx";
import { LIMITS } from "@/lib/constants";
import { formatDateLong, formatTime, relativeStamp } from "@/lib/format";
import { useApi, useNow } from "@/lib/hooks/useApi";
import type { TopicCommentDTO, TopicDetailDTO, TopicDTO, UserBrief } from "@/lib/types";
import { Linkified, LikeButton } from "./parts";
import { TopicMedia } from "./TopicMedia";
import { TopicMenu } from "./TopicMenu";
import { UserName } from "@/components/ui/UserName";

/** Replies revealed per "more replies" click, at each level. */
const REPLY_PAGE = 3;
/** Deepest level drawn in place; anything below opens as its own thread ("Continue this thread"). */
const MAX_DEPTH = 4;
/**
 * Like Reddit, a thread arrives already open a few levels deep: this many replies show under a comment at each
 * depth before "N more replies" (top-level comments show 3 replies, those show 2, then 1).
 */
const AUTO_SHOWN = [3, 2, 1];

/**
 * Comments the Reddit way: a tree with a thread line down each level (click it to collapse),
 * replies tucked away until you open them, a reply box right under the comment you answer,
 * and "Continue this thread" once a conversation gets deep, so it never gets squeezed.
 */
type Tree = { c: TopicCommentDTO; kids: Tree[] };

function nest(list: TopicCommentDTO[]): Tree[] {
  const nodes = new Map(list.map((c) => [c.id, { c, kids: [] as Tree[] }]));
  const roots: Tree[] = [];
  for (const n of nodes.values()) {
    const parent = n.c.parentId ? nodes.get(n.c.parentId) : undefined;
    (parent ?? { kids: roots }).kids.push(n); // a reply whose parent is hidden (blocked author) becomes a top-level comment
  }
  const byTime = (x: Tree, y: Tree) => x.c.createdAt.localeCompare(y.c.createdAt);
  const sortAll = (ts: Tree[]) => {
    ts.sort(byTime);
    ts.forEach((t) => sortAll(t.kids));
  };
  sortAll(roots);
  return roots;
}

/** Scroll the pane an element lives in (not the whole page, which would shift the side panels) so it sits at the top. */
function scrollPaneTo(el: Element | null) {
  const pane = el?.parentElement?.closest(".overflow-y-auto");
  if (!el || !pane) return;
  pane.scrollBy({ top: el.getBoundingClientRect().top - pane.getBoundingClientRect().top - 12, behavior: "smooth" });
}

function countAll(n: Tree): number {
  return n.kids.reduce((sum, k) => sum + 1 + countAll(k), 0);
}

function findNode(ts: Tree[], id: string): Tree | null {
  for (const t of ts) {
    if (t.c.id === id) return t;
    const hit = findNode(t.kids, id);
    if (hit) return hit;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Keeping the list and the open topic in step                         */
/* ------------------------------------------------------------------ */

type TopicEvent = { type: "changed"; topic: TopicDTO } | { type: "removed"; id: string };
const listeners = new Set<(e: TopicEvent) => void>();

/** Tell every topic list and the open topic that a topic changed (a like, a new comment, an edit) or went away. */
export function emitTopic(e: TopicEvent) {
  for (const fn of listeners) fn(e);
}

/** Listen for emitTopic. */
export function useTopicEvents(handler: (e: TopicEvent) => void) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const fn = (e: TopicEvent) => ref.current(e);
    listeners.add(fn);
    return () => void listeners.delete(fn);
  }, []);
}

/** Topics clicked in a list, so the panel can show the post straight away while its comments load. */
const seeds = new Map<string, TopicDTO>();
export function seedTopic(t: TopicDTO) {
  seeds.set(t.id, t);
  if (seeds.size > 50) seeds.delete(seeds.keys().next().value!);
}

type DetailState = ReturnType<typeof useApi<TopicDetailDTO>>;
interface Detail extends DetailState {
  slug: string;
  topicId: string;
  /** the topic to draw: the loaded one, or the one clicked in the list while it loads */
  preview: TopicDTO | null;
  setTopic: (t: TopicDTO) => void;
  setComment: (id: string, patch: Partial<TopicCommentDTO>) => void;
  /** add a comment; `replaces` swaps out the placeholder shown while it was sending */
  addComment: (c: TopicCommentDTO, replaces?: string) => void;
  dropComment: (id: string) => void;
  markDeleted: (id: string) => void;
}
const DetailCtx = createContext<Detail | null>(null);
const useDetail = () => {
  const d = useContext(DetailCtx);
  if (!d) throw new Error("TopicPost / TopicComments must sit inside <TopicDetailProvider>.");
  return d;
};

/**
 * Loads one topic and shares it between the post and its comments, shown together in the right-hand panel
 * while the board stays put in the middle. With `topicId` null it does nothing.
 */
export function TopicDetailProvider({ slug, topicId, children }: { slug: string; topicId: string | null; children: ReactNode }) {
  const api = useApi(topicId ? () => TopicService.get(slug, topicId) : null, [slug, topicId], { key: topicId ? `topic:${slug}:${topicId}` : undefined });
  const { setData, reload } = api;
  // someone commented, edited or deleted: refetch this topic (what's on screen stays meanwhile)
  useRealtimeEvent(() => void reload(), { filter: (e) => e.type === "topic" && e.topicId === topicId, debounceMs: 500 });
  // a like or edit made in the list reaches the open topic
  useTopicEvents((e) => {
    if (e.type === "changed" && e.topic.id === topicId) setData((d) => (d && d.topic !== e.topic ? { ...d, topic: e.topic } : d));
  });
  // and the other way round: what changes here (likes, comment count) shows in the list
  const loaded = api.data?.topic;
  useEffect(() => {
    if (loaded) emitTopic({ type: "changed", topic: loaded });
  }, [loaded]);

  const seed = topicId ? (seeds.get(topicId) ?? null) : null;
  const value = useMemo<Detail>(
    () => ({
      ...api,
      slug,
      topicId: topicId ?? "",
      preview: api.data?.topic ?? seed,
      setTopic: (next) => setData((d) => (d ? { ...d, topic: next } : d)),
      setComment: (id, patch) => setData((d) => (d ? { ...d, comments: d.comments.map((c) => (c.id === id ? { ...c, ...patch } : c)) } : d)),
      addComment: (c, replaces) =>
        setData((d) => {
          if (!d) return d;
          if (replaces && d.comments.some((x) => x.id === replaces)) return { ...d, comments: d.comments.map((x) => (x.id === replaces ? c : x)) };
          if (d.comments.some((x) => x.id === c.id)) return d; // a realtime refresh got here first
          return { ...d, topic: { ...d.topic, commentCount: d.topic.commentCount + 1 }, comments: [...d.comments, c] };
        }),
      dropComment: (id) => setData((d) => (d ? { ...d, topic: { ...d.topic, commentCount: Math.max(0, d.topic.commentCount - 1) }, comments: d.comments.filter((c) => c.id !== id) } : d)),
      markDeleted: (id) => setData((d) => (d ? { ...d, topic: { ...d.topic, commentCount: Math.max(0, d.topic.commentCount - 1) }, comments: d.comments.map((c) => (c.id === id ? { ...c, body: "", deleted: true, likeCount: 0, liked: false, canEdit: false, canDelete: false } : c)) } : d)),
    }),
    [api, slug, topicId, setData, seed],
  );
  return <DetailCtx.Provider value={value}>{children}</DetailCtx.Provider>;
}

/**
 * The open topic in the right-hand panel: the post, then its comments, Reddit-style, in one scroll.
 * `onClose` puts the community info back; `bare` leaves the close button to the drawer it sits in.
 */
export function TopicSide({ onClose, bare }: { onClose: () => void; bare?: boolean }) {
  const { preview, error, status, reload } = useDetail();
  const scroller = useRef<HTMLDivElement>(null);
  const id = preview?.id;
  // a different topic starts at the top
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [id]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className={cx("flex min-h-14 shrink-0 items-center gap-2 border-b border-line pl-4", bare ? "pr-14" : "pr-2")}>
        <Icon name="topics" size={17} className="shrink-0 text-ink-muted" />
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em]">{preview?.board.name ?? "Topic"}</h2>
        {!bare && (
          <button type="button" onClick={onClose} aria-label="Close topic" title="Close" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-raised hover:text-ink">
            <Icon name="x" size={18} />
          </button>
        )}
      </header>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-6">
        {!preview && error ? (
          <SpaceError status={status} message={error} onRetry={reload} />
        ) : (
          <>
            <TopicPost
              onGone={(t) => {
                emitTopic({ type: "removed", id: t.id });
                onClose();
              }}
            />
            <TopicComments inline />
          </>
        )}
      </div>
    </div>
  );
}

/** The topic itself, at the top of the panel. */
function TopicPost({ onGone }: { onGone: (t: TopicDTO) => void }) {
  const { preview: t, setTopic, slug } = useDetail();
  const now = useNow();

  if (!t) {
    return (
      <div className="space-y-3 p-1" aria-busy="true">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  const update = (next: TopicDTO) => {
    setTopic(next);
    emitTopic({ type: "changed", topic: next });
  };

  return (
    <article className="rounded-card border border-line bg-surface p-4" aria-label={t.title}>
      <div className="mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-muted">
        <ProfileTrigger handle={t.author.handle} className="inline-flex items-center gap-2 text-ink hover:underline">
          <Avatar name={t.author.displayName} src={t.author.avatarUrl} frame={t.author.avatarFrame} size={24} />
          <span className="text-[13px] font-semibold"><UserName name={t.author.displayName} effect={t.author.nameEffect} /></span>
        </ProfileTrigger>
        <span aria-hidden="true">·</span>
        <time dateTime={t.createdAt} title={`${formatDateLong(t.createdAt)} ${formatTime(t.createdAt)}`}>
          {now ? relativeStamp(t.createdAt, now) : ""}
        </time>
        {t.editedAt && <span>(edited)</span>}
        {t.pinned && (
          <span className="inline-flex items-center gap-1 font-semibold text-accent-text">
            <Icon name="pushpin" size={12} /> Pinned
          </span>
        )}
        {t.locked && (
          <span className="inline-flex items-center gap-1 font-semibold">
            <Icon name="lock" size={12} /> Locked
          </span>
        )}
        <span className="ml-auto">
          <TopicMenu topic={t} onChange={update} onRemoved={() => onGone(t)} />
        </span>
      </div>
      <h1 className="text-xl leading-snug font-bold tracking-[-0.02em] break-words">{t.title}</h1>
      {t.body && (
        <p className="mt-2.5 text-[15px] leading-relaxed break-words whitespace-pre-wrap">
          <Linkified text={t.body} />
        </p>
      )}
      <TopicMedia media={t.media} tall className="mt-3" />
      <div className="mt-3 flex items-center gap-1 border-t border-line pt-2.5">
        <LikeButton liked={t.liked} count={t.likeCount} canLike={t.canLike} onToggle={async () => (await TopicService.like(slug, t.id)).data} onChange={(n) => update({ ...t, liked: n.liked, likeCount: n.likeCount })} />
        <button
          type="button"
          onClick={() => scrollPaneTo(document.getElementById("topic-comments"))}
          aria-label={`${t.commentCount} comments`}
          className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold text-ink-muted transition hover:bg-raised hover:text-ink"
        >
          <Icon name="message" size={16} />
          <span className="font-mono tabular-nums">{t.commentCount}</span>
        </button>
      </div>
    </article>
  );
}

/** Shared by every comment in the tree, so a node doesn't need a dozen props passed down. */
interface TreeCtx {
  slug: string;
  topic: TopicDTO;
  now: Date | null;
  /** how many replies are open under each comment (absent = none) */
  shown: Record<string, number>;
  setShown: (id: string, n: number) => void;
  collapsed: Set<string>;
  toggleCollapsed: (id: string) => void;
  replyingTo: string | null;
  setReplyingTo: (id: string | null) => void;
  focus: (id: string) => void;
  onChange: (id: string, patch: Partial<TopicCommentDTO>) => void;
  onPosted: (c: TopicCommentDTO, replaces?: string) => void;
  onPending: (c: TopicCommentDTO) => void;
  onFailed: (id: string) => void;
  onDeleted: (id: string) => void;
  me: UserBrief | null;
}

/**
 * A topic's comments. On wide screens: the right-hand panel (Discord-thread style), list on top and composer
 * pinned at the bottom. With `inline`: a section under the post for phones, tablets and laptops (Reddit-style),
 * with the composer first and the page doing the scrolling.
 */
export function TopicComments({ inline }: { inline?: boolean } = {}) {
  const { user, requireAuth } = useAuth();
  const { data, loading, slug, setComment, addComment, dropComment, markDeleted } = useDetail();
  const now = useNow();
  const tree = useMemo(() => nest(data?.comments ?? []), [data?.comments]);
  const [shown, setShownMap] = useState<Record<string, number>>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  // "Continue this thread": show one deep comment as the root of its own view
  const [focusId, setFocusId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const t = data?.topic;
  const focused = focusId ? findNode(tree, focusId) : null;
  const roots = focused ? [focused] : tree;

  const ctx: TreeCtx | null = t
    ? {
        slug,
        topic: t,
        now,
        shown,
        setShown: (id, n) => setShownMap((s) => ({ ...s, [id]: n })),
        collapsed,
        toggleCollapsed: (id) =>
          setCollapsed((s) => {
            const n = new Set(s);
            if (!n.delete(id)) n.add(id);
            return n;
          }),
        replyingTo,
        setReplyingTo,
        focus: (id) => {
          setFocusId(id);
          setShownMap((s) => ({ ...s, [id]: Math.max(s[id] ?? 0, REPLY_PAGE) }));
          if (inline) scrollPaneTo(listRef.current);
          else listRef.current?.scrollTo({ top: 0 });
        },
        onChange: setComment,
        onPosted: (c, replaces) => addComment(c, replaces),
        // shown at once while it sends; swapped for the real one when the server answers
        onPending: (c) => {
          addComment(c);
          // open the comment they answered far enough to show the new reply
          if (c.parentId) setShownMap((s) => ({ ...s, [c.parentId!]: Number.MAX_SAFE_INTEGER }));
          setReplyingTo(null);
        },
        onFailed: dropComment,
        onDeleted: markDeleted,
        me: user,
      }
    : null;

  const composer = t && (
        <div className={inline ? "px-3 pt-3" : "shrink-0 border-t border-line p-3"}>
          {t.canComment ? (
            ctx && <CommentBox ctx={ctx} placeholder="Add a comment" />
          ) : (
            <p className="flex items-center gap-2 rounded-control border border-line bg-surface px-3 py-2.5 text-sm text-ink-muted">
              <Icon name="lock" size={15} className="shrink-0" />
              {t.locked ? (
                "Comments are locked on this topic."
              ) : user ? (
                `Join ${t.community.name} to comment.`
              ) : (
                <span>
                  <button type="button" onClick={() => requireAuth()} className="font-semibold text-accent-text hover:underline">
                    Sign in
                  </button>{" "}
                  and join to comment.
                </span>
              )}
            </p>
          )}
        </div>
      );

  return (
    <section id={inline ? "topic-comments" : undefined} aria-label="Comments" className={inline ? "mt-4 scroll-mt-4 rounded-card border border-line bg-surface/40 pb-2" : "flex h-full min-h-0 flex-col"}>
      <header className={cx("flex min-h-14 shrink-0 items-center gap-2 px-4", !inline && "border-b border-line")}>
        <Icon name="message" size={17} className="text-ink-muted" />
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Comments</h2>
        {t && <span className="font-mono text-xs text-ink-muted">{t.commentCount}</span>}
      </header>

      {inline && composer}

      <div ref={listRef} className={inline ? "px-3 pb-2" : "min-h-0 flex-1 overflow-y-auto px-3 pb-4"}>
        {loading || !t || !ctx ? (
          <div className="space-y-3 pt-4" aria-busy="true">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : (
          <>
            {focused && (
              <button type="button" onClick={() => setFocusId(null)} className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[12.5px] font-semibold text-accent-text transition hover:bg-raised">
                <Icon name="arrow-left" size={13} /> All comments
              </button>
            )}
            {tree.length === 0 && <p className="px-1 pt-4 text-sm text-ink-muted">{t.canComment ? "No comments yet. Be the first to say something." : "No comments yet."}</p>}
            <ul>
              {roots.map((n) => (
                <CommentNode key={n.c.id} node={n} depth={0} ctx={ctx} />
              ))}
            </ul>
          </>
        )}
      </div>

      {!inline && composer}
    </section>
  );
}

/** A rounded field with the send button inside. Used pinned at the bottom (new comment) and inline under a comment (reply). */
let pendingSeq = 0;
const isPending = (c: TopicCommentDTO) => c.id.startsWith("pending-");

function CommentBox({ ctx, parentId, placeholder, onCancel, autoFocus }: { ctx: TreeCtx; parentId?: string; placeholder: string; onCancel?: () => void; autoFocus?: boolean }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();
  const { slug, topic } = ctx;

  async function post() {
    const body = text.trim();
    if (!body || busy) return;
    // the comment appears straight away; it only goes away again if the server says no
    const tempId = `pending-${++pendingSeq}`;
    if (ctx.me) {
      const now = new Date().toISOString();
      ctx.onPending({ id: tempId, topicId: topic.id, parentId: parentId ?? null, body, likeCount: 0, liked: false, deleted: false, createdAt: now, editedAt: null, author: ctx.me, canEdit: false, canDelete: false });
      setText("");
    } else setBusy(true);
    try {
      const res = await TopicService.comment(slug, topic.id, body, parentId);
      ctx.onPosted(res.data, ctx.me ? tempId : undefined);
      if (!ctx.me) {
        setText("");
        ctx.setReplyingTo(null);
      }
    } catch (e) {
      if (ctx.me) {
        ctx.onFailed(tempId);
        setText((cur) => cur || body);
      }
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-end gap-2 rounded-[1.4rem] border border-line bg-surface py-1.5 pr-1.5 pl-4 transition focus-within:border-accent-text focus-within:ring-2 focus-within:ring-accent/20">
        <label className="sr-only" htmlFor={id}>
          {placeholder}
        </label>
        <textarea
          id={id}
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void post();
            } else if (e.key === "Escape" && onCancel) {
              e.preventDefault();
              onCancel();
            }
          }}
          rows={1}
          maxLength={LIMITS.topicComment}
          placeholder={placeholder}
          style={{ fieldSizing: "content", outline: "none" } as React.CSSProperties}
          className="max-h-40 min-h-9 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-snug text-ink placeholder:text-ink-muted/70 focus:outline-none focus-visible:outline-none"
        />
        <button
          type="button"
          onClick={() => void post()}
          disabled={!text.trim() || busy}
          aria-label={parentId ? "Send reply" : "Post comment"}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition hover:opacity-90 disabled:bg-raised disabled:text-ink-muted"
        >
          <Icon name="send" size={16} className={busy ? "animate-pulse" : undefined} />
        </button>
      </div>
      {(onCancel || text.length > LIMITS.topicComment - 300) && (
        <div className="mt-1 flex items-center justify-between px-2 text-[11.5px] text-ink-muted">
          {onCancel ? (
            <button type="button" onClick={onCancel} className="font-semibold transition hover:text-ink">
              Cancel
            </button>
          ) : (
            <span />
          )}
          {text.length > LIMITS.topicComment - 300 && <span className="font-mono">{text.length}/{LIMITS.topicComment}</span>}
        </div>
      )}
    </div>
  );
}

function CommentNode({ node, depth, ctx }: { node: Tree; depth: number; ctx: TreeCtx }) {
  const { c, kids } = node;
  const { slug, topic, now } = ctx;
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isCollapsed = ctx.collapsed.has(c.id);
  const open = Math.min(ctx.shown[c.id] ?? AUTO_SHOWN[depth] ?? 0, kids.length);
  const left = kids.length - open;
  const tooDeep = depth >= MAX_DEPTH;
  const total = countAll(node);

  const items: MenuEntry[] = [
    ...(c.canEdit ? ([{ label: "Edit comment", icon: "edit", onSelect: () => setEditing(true) }] as MenuEntry[]) : []),
    ...(c.canDelete ? ([{ label: "Delete comment", icon: "trash", danger: true, onSelect: () => setDeleting(true) }] as MenuEntry[]) : []),
  ];

  return (
    <li className={cx("relative transition-opacity", isPending(c) && "opacity-60")} aria-busy={isPending(c) || undefined}>
      <div className="flex gap-2 pt-3">
        {/* avatar, then the thread line: click the line to fold this whole conversation */}
        <div className="flex w-7 shrink-0 flex-col items-center">
          {c.deleted ? (
            <span className="size-7 rounded-full bg-raised" aria-hidden="true" />
          ) : (
            <ProfileTrigger handle={c.author.handle} aria-label={`${c.author.displayName}'s profile`}>
              <Avatar name={c.author.displayName} src={c.author.avatarUrl} frame={c.author.avatarFrame} size={28} />
            </ProfileTrigger>
          )}
          {!isCollapsed && (open > 0 || ctx.replyingTo === c.id) && (
            <button type="button" onClick={() => ctx.toggleCollapsed(c.id)} aria-label="Collapse thread" className="group mt-1 flex w-5 flex-1 justify-center">
              <span className="w-px bg-line transition group-hover:w-0.5 group-hover:bg-ink-muted" />
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-ink-muted">
            {c.deleted ? (
              <span className="italic">deleted</span>
            ) : (
              <ProfileTrigger handle={c.author.handle} className="text-[13px] font-semibold text-ink hover:underline">
                <UserName name={c.author.displayName} effect={c.author.nameEffect} />
              </ProfileTrigger>
            )}
            {topic.author.id === c.author.id && !c.deleted && <span className="rounded bg-accent/15 px-1.5 text-[10px] font-bold tracking-wide text-accent-text uppercase">OP</span>}
            <time dateTime={c.createdAt} title={`${formatDateLong(c.createdAt)} ${formatTime(c.createdAt)}`}>
              {now ? relativeStamp(c.createdAt, now) : ""}
            </time>
            {c.editedAt && <span>(edited)</span>}
            {isCollapsed && (
              <button type="button" onClick={() => ctx.toggleCollapsed(c.id)} className="font-semibold text-accent-text hover:underline">
                [+] {total > 0 ? `${total} more` : "show"}
              </button>
            )}
          </p>

          {!isCollapsed && (
            <>
              {c.deleted ? (
                <p className="mt-0.5 text-sm text-ink-muted italic">This comment was deleted.</p>
              ) : editing ? (
                <MessageEditor
                  className="mt-1"
                  initial={c.body}
                  max={LIMITS.topicComment}
                  onCancel={() => setEditing(false)}
                  onSave={async (body) => {
                    try {
                      const res = await TopicService.editComment(slug, topic.id, c.id, body);
                      ctx.onChange(c.id, { body: res.data.body, editedAt: res.data.editedAt });
                      setEditing(false);
                      return null;
                    } catch (e) {
                      return errorMessage(e);
                    }
                  }}
                />
              ) : (
                <p className="mt-0.5 text-[15px] leading-relaxed break-words whitespace-pre-wrap">
                  <Linkified text={c.body} />
                </p>
              )}

              {!c.deleted && !editing && !isPending(c) && (
                <div className="mt-0.5 -ml-2 flex flex-wrap items-center gap-0.5">
                  <LikeButton size="sm" liked={c.liked} count={c.likeCount} canLike={topic.canLike} onToggle={async () => (await TopicService.likeComment(slug, topic.id, c.id)).data} onChange={(n) => ctx.onChange(c.id, { liked: n.liked, likeCount: n.likeCount })} />
                  {topic.canComment && (
                    <button type="button" onClick={() => ctx.setReplyingTo(ctx.replyingTo === c.id ? null : c.id)} className={cx("inline-flex h-7 items-center gap-1.5 rounded-full px-2 text-[12px] font-semibold transition hover:bg-raised hover:text-ink", ctx.replyingTo === c.id ? "text-ink" : "text-ink-muted")}>
                      <Icon name="message" size={13} /> Reply
                    </button>
                  )}
                  {items.length > 0 && (
                    <Dropdown
                      items={items}
                      label="Comment options"
                      align="left"
                      width={190}
                      trigger={({ open: o, props }) => (
                        <button {...props} aria-label="Comment options" className={cx("inline-flex size-7 items-center justify-center rounded-full text-ink-muted transition hover:bg-raised hover:text-ink", o && "bg-raised text-ink")}>
                          <Icon name="more" size={15} />
                        </button>
                      )}
                    />
                  )}
                </div>
              )}

              {ctx.replyingTo === c.id && (
                <div className="mt-2">
                  <CommentBox ctx={ctx} parentId={c.id} autoFocus placeholder={`Reply to ${c.author.displayName}`} onCancel={() => ctx.setReplyingTo(null)} />
                </div>
              )}

              {open > 0 && (
                <ul className="-ml-1">
                  {kids.slice(0, open).map((k) =>
                    tooDeep ? null : <CommentNode key={k.c.id} node={k} depth={depth + 1} ctx={ctx} />,
                  )}
                </ul>
              )}

              {kids.length > 0 &&
                (tooDeep ? (
                  <button type="button" onClick={() => ctx.focus(c.id)} className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent-text hover:underline">
                    Continue this thread <Icon name="chevron-right" size={13} />
                  </button>
                ) : left > 0 ? (
                  <button type="button" onClick={() => ctx.setShown(c.id, open + REPLY_PAGE)} className="mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-muted transition hover:text-ink">
                    <Icon name="chevron-down" size={13} />
                    {open === 0 ? `${left} ${left === 1 ? "reply" : "replies"}` : `${left} more ${left === 1 ? "reply" : "replies"}`}
                  </button>
                ) : null)}
            </>
          )}
        </div>
      </div>

      <ConfirmModal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this comment?"
        description={kids.length ? "Replies stay; this comment shows as deleted." : "This can't be undone."}
        confirmLabel="Delete"
        onConfirm={async () => {
          await TopicService.removeComment(slug, topic.id, c.id);
          ctx.onDeleted(c.id);
          toast("Comment deleted", "success");
        }}
      />
    </li>
  );
}
