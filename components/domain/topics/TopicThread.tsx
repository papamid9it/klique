"use client";

import Link from "next/link";
import { createContext, useContext, useId, useMemo, useRef, useState, type ReactNode } from "react";
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
import type { TopicCommentDTO, TopicDetailDTO, TopicDTO } from "@/lib/types";
import { Linkified, LikeButton } from "./parts";
import { TopicMedia } from "./TopicMedia";
import { TopicMenu } from "./TopicMenu";
import { UserName } from "@/components/ui/UserName";

/** Replies revealed per "more replies" click, at each level. */
const REPLY_PAGE = 3;
/** Deepest level drawn in place; anything below opens as its own thread ("Continue this thread"). */
const MAX_DEPTH = 3;

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

type DetailState = ReturnType<typeof useApi<TopicDetailDTO>>;
interface Detail extends DetailState {
  slug: string;
  topicId: string;
  setTopic: (t: TopicDTO) => void;
  setComment: (id: string, patch: Partial<TopicCommentDTO>) => void;
  addComment: (c: TopicCommentDTO) => void;
  markDeleted: (id: string) => void;
}
const DetailCtx = createContext<Detail | null>(null);
const useDetail = () => {
  const d = useContext(DetailCtx);
  if (!d) throw new Error("TopicThread / TopicComments must sit inside <TopicDetailProvider>.");
  return d;
};

/**
 * Loads one topic and shares it between the post (middle pane) and its comments (right panel), the way
 * Discord shows a thread beside the conversation. With `topicId` null it does nothing.
 */
export function TopicDetailProvider({ slug, topicId, children }: { slug: string; topicId: string | null; children: ReactNode }) {
  const { user } = useAuth();
  const api = useApi(topicId ? () => TopicService.get(slug, topicId) : null, [slug, topicId, user?.id]);
  const { setData, reload } = api;
  // someone commented, edited or deleted: refetch this topic
  useRealtimeEvent(() => void reload(), { filter: (e) => e.type === "topic" && e.topicId === topicId, debounceMs: 500 });
  const value = useMemo<Detail>(
    () => ({
      ...api,
      slug,
      topicId: topicId ?? "",
      setTopic: (next) => setData((d) => (d ? { ...d, topic: next } : d)),
      setComment: (id, patch) => setData((d) => (d ? { ...d, comments: d.comments.map((c) => (c.id === id ? { ...c, ...patch } : c)) } : d)),
      addComment: (c) => setData((d) => (d ? { ...d, topic: { ...d.topic, commentCount: d.topic.commentCount + 1 }, comments: [...d.comments, c] } : d)),
      markDeleted: (id) => setData((d) => (d ? { ...d, topic: { ...d.topic, commentCount: Math.max(0, d.topic.commentCount - 1) }, comments: d.comments.map((c) => (c.id === id ? { ...c, body: "", deleted: true, likeCount: 0, liked: false, canEdit: false, canDelete: false } : c)) } : d)),
    }),
    [api, slug, topicId, setData],
  );
  return <DetailCtx.Provider value={value}>{children}</DetailCtx.Provider>;
}

/** The topic itself. Its comments live in <TopicComments>, in the right panel. */
export function TopicThread({ backHref, onGone }: { backHref: string; onGone: () => void }) {
  const { data, loading, error, status, reload, setTopic, slug } = useDetail();
  const now = useNow();

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-32" />
        <Skeleton className="h-16" />
      </div>
    );
  }
  if (error || !data) return <SpaceError status={status} message={error} onRetry={reload} backHref={backHref} backLabel="Back to topics" />;

  const { topic: t } = data;

  return (
    <div>
      <Link href={backHref} scroll={false} className="eyebrow mb-4 inline-flex items-center gap-1 hover:text-ink">
        <Icon name="arrow-left" size={11} /> {t.board.name}
      </Link>

      <article className="rounded-card border border-line bg-surface p-5 sm:p-6" aria-label={t.title}>
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-muted">
          <ProfileTrigger handle={t.author.handle} className="inline-flex items-center gap-2 text-ink hover:underline">
            <Avatar name={t.author.displayName} src={t.author.avatarUrl} frame={t.author.avatarFrame} size={26} />
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
            <TopicMenu topic={t} onChange={setTopic} onRemoved={onGone} />
          </span>
        </div>
        <h1 className="text-[clamp(1.4rem,3vw,1.9rem)] leading-tight font-bold tracking-[-0.03em] break-words">{t.title}</h1>
        {t.body && (
          <p className="mt-3 text-[15px] leading-relaxed break-words whitespace-pre-wrap">
            <Linkified text={t.body} />
          </p>
        )}
        <TopicMedia media={t.media} tall className="mt-4" />
        <div className="mt-4 flex items-center gap-1 border-t border-line pt-3">
          <LikeButton liked={t.liked} count={t.likeCount} canLike={t.canLike} onToggle={async () => (await TopicService.like(slug, t.id)).data} onChange={(n) => setTopic({ ...t, liked: n.liked, likeCount: n.likeCount })} />
          <button
            type="button"
            onClick={() => scrollPaneTo(document.getElementById("topic-comments"))}
            aria-label={`${t.commentCount} comments`}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold text-ink-muted transition hover:bg-raised hover:text-ink xl:pointer-events-none"
          >
            <Icon name="message" size={16} />
            <span className="font-mono tabular-nums">{t.commentCount}</span>
          </button>
        </div>
      </article>
    </div>
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
  onPosted: (c: TopicCommentDTO) => void;
  onDeleted: (id: string) => void;
}

/**
 * A topic's comments. On wide screens: the right-hand panel (Discord-thread style), list on top and composer
 * pinned at the bottom. With `inline`: a section under the post for phones, tablets and laptops (Reddit-style),
 * with the composer first and the page doing the scrolling.
 */
export function TopicComments({ inline }: { inline?: boolean } = {}) {
  const { user, requireAuth } = useAuth();
  const { data, loading, slug, setComment, addComment, markDeleted } = useDetail();
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
        onPosted: (c) => {
          addComment(c);
          // open the comment they answered far enough to show the new reply
          if (c.parentId) setShownMap((s) => ({ ...s, [c.parentId!]: Number.MAX_SAFE_INTEGER }));
          setReplyingTo(null);
        },
        onDeleted: markDeleted,
      }
    : null;

  const composer = t && (
        <div className={inline ? "px-3 pt-3" : "shrink-0 border-t border-line p-3"}>
          {t.canComment ? (
            <CommentBox slug={slug} topicId={t.id} placeholder="Add a comment" onPosted={(c) => ctx?.onPosted(c)} />
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
    <section id={inline ? "topic-comments" : undefined} aria-label="Comments" className={inline ? "mt-6 scroll-mt-4 rounded-card border border-line bg-surface/40 pb-2" : "flex h-full min-h-0 flex-col"}>
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
function CommentBox({ slug, topicId, parentId, placeholder, onPosted, onCancel, autoFocus }: { slug: string; topicId: string; parentId?: string; placeholder: string; onPosted: (c: TopicCommentDTO) => void; onCancel?: () => void; autoFocus?: boolean }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();

  async function post() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const res = await TopicService.comment(slug, topicId, body, parentId);
      setText("");
      onPosted(res.data);
    } catch (e) {
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
  const open = Math.min(ctx.shown[c.id] ?? 0, kids.length);
  const left = kids.length - open;
  const tooDeep = depth >= MAX_DEPTH;
  const total = countAll(node);

  const items: MenuEntry[] = [
    ...(c.canEdit ? ([{ label: "Edit comment", icon: "edit", onSelect: () => setEditing(true) }] as MenuEntry[]) : []),
    ...(c.canDelete ? ([{ label: "Delete comment", icon: "trash", danger: true, onSelect: () => setDeleting(true) }] as MenuEntry[]) : []),
  ];

  return (
    <li className="relative">
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

              {!c.deleted && !editing && (
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
                  <CommentBox slug={slug} topicId={topic.id} parentId={c.id} autoFocus placeholder={`Reply to ${c.author.displayName}`} onCancel={() => ctx.setReplyingTo(null)} onPosted={ctx.onPosted} />
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
