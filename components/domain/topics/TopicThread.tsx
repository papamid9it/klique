"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { errorMessage } from "@/app/ApiCore";
import { TopicService } from "@/app/services/TopicService";
import { ChatPane } from "@/components/domain/chat/ChatPane";
import { SpaceError } from "@/components/domain/space/parts";
import { useAuth } from "@/components/providers/AuthProvider";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { UserName } from "@/components/ui/UserName";
import { cx } from "@/components/ui/cx";
import { formatDateLong, formatTime, relativeStamp } from "@/lib/format";
import { recallApi, rememberApi, useApi, useNow } from "@/lib/hooks/useApi";
import type { TopicDetailDTO, TopicDTO } from "@/lib/types";
import { Linkified, LikeButton } from "./parts";
import { TopicMedia } from "./TopicMedia";
import { TopicMenu } from "./TopicMenu";

/* ------------------------------------------------------------------ */
/* Keeping the list and the open post in step                          */
/* ------------------------------------------------------------------ */

type TopicEvent = { type: "changed"; topic: TopicDTO } | { type: "removed"; id: string };
const listeners = new Set<(e: TopicEvent) => void>();

/** Tell every post list and the open post that a post changed (an upvote, a reply, an edit) or went away. */
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

/** Posts clicked in a list, so the panel can show the post straight away while its chat loads. */
const seeds = new Map<string, TopicDTO>();
export function seedTopic(t: TopicDTO) {
  seeds.set(t.id, t);
  if (seeds.size > 50) seeds.delete(seeds.keys().next().value!);
}

const detailKey = (slug: string, id: string) => `topic:${slug}:${id}`;

/** Put a post's chat page where its chat looks first (useChat), so the chat opens already filled. */
function seedChat(slug: string, d: TopicDetailDTO) {
  rememberApi(`chat:${slug}::${d.thread.slug}`, { items: d.messages.items, hasOlder: d.messages.hasMore });
}

/** Load a post (and its chat's newest page) before it's opened: pointing at a card is a strong hint. */
const prefetching = new Set<string>();
export function prefetchTopic(slug: string, id: string) {
  const key = detailKey(slug, id);
  if (recallApi(key) || prefetching.has(key)) return;
  prefetching.add(key);
  TopicService.get(slug, id).then(
    (r) => {
      rememberApi(key, r.data);
      seedChat(slug, r.data);
      prefetching.delete(key);
    },
    () => prefetching.delete(key),
  );
}

type DetailState = ReturnType<typeof useApi<TopicDetailDTO>>;
interface Detail extends DetailState {
  slug: string;
  topicId: string;
  /** the post to draw: the loaded one, or the one clicked in the list while it loads */
  preview: TopicDTO | null;
  setTopic: (t: TopicDTO) => void;
}
const DetailCtx = createContext<Detail | null>(null);
const useDetail = () => {
  const d = useContext(DetailCtx);
  if (!d) throw new Error("TopicSide must sit inside <TopicDetailProvider>.");
  return d;
};

/**
 * Loads the open post (and its chat channel) for the right-hand panel while the board stays put in the middle.
 * With `topicId` null it does nothing.
 */
export function TopicDetailProvider({ slug, topicId, children }: { slug: string; topicId: string | null; children: ReactNode }) {
  const api = useApi(topicId ? () => TopicService.get(slug, topicId) : null, [slug, topicId], { key: topicId ? detailKey(slug, topicId) : undefined });
  const { setData, reload } = api;
  // a reply, upvote or edit somewhere else: refetch the post (what's on screen stays meanwhile)
  useRealtimeEvent(() => void reload(), { filter: (e) => e.type === "topic" && e.topicId === topicId, debounceMs: 500 });
  // an upvote or edit made in the list reaches the open post
  useTopicEvents((e) => {
    if (e.type === "changed" && e.topic.id === topicId) setData((d) => (d && d.topic !== e.topic ? { ...d, topic: e.topic } : d));
  });
  // and the other way round: what changes here (upvotes, reply count) shows in the list
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
    }),
    [api, slug, topicId, setData, seed],
  );
  return <DetailCtx.Provider value={value}>{children}</DetailCtx.Provider>;
}

/**
 * The open post in the right-hand panel, like a Discord forum post: a header (follow, upvote, ⋯), then the
 * post itself (picture, then text) at the start of its chat, then the replies, live, with the community's
 * normal chat (pictures, stickers, reactions, @mentions, "Jump to present").
 * `onClose` puts the board's sidebar back; `bare` leaves the close button to the drawer it sits in.
 */
export function TopicSide({ onClose, bare }: { onClose: () => void; bare?: boolean }) {
  const { preview: t, data: loaded, error, status, reload, slug, setTopic, topicId } = useDetail();
  // the post and its replies appear together: until both are in, one placeholder (no half-drawn post first).
  // A post loaded ahead (hovered in the list) is in the cache: use it straight away rather than a frame later.
  const data = loaded && loaded.topic.id === topicId ? loaded : topicId ? (recallApi<TopicDetailDTO>(detailKey(slug, topicId)) ?? null) : null;
  const threadId = data?.thread.id;
  useMemo(() => {
    if (data) seedChat(slug, data);
  }, [threadId]); // eslint-disable-line react-hooks/exhaustive-deps
  // deleted from the list beside it: nothing left to reply to
  useTopicEvents((e) => {
    if (e.type === "removed" && e.id === t?.id) onClose();
  });
  const update = (next: TopicDTO) => {
    setTopic(next);
    emitTopic({ type: "changed", topic: next });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className={cx("flex min-h-14 shrink-0 items-center gap-1.5 border-b border-line pl-4", bare ? "pr-14" : "pr-2")}>
        <Icon name="topics" size={17} className="shrink-0 text-ink-muted" />
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em]" title={t?.title}>
          {t?.title ?? "Post"}
        </h2>
        {t && (
          <>
            <FollowButton topic={t} slug={slug} onChange={update} />
            <LikeButton upvote liked={t.liked} count={t.likeCount} canLike={t.canLike} onToggle={async () => (await TopicService.like(slug, t.id)).data} onChange={(n) => update({ ...t, liked: n.liked, likeCount: n.likeCount })} />
            <TopicMenu
              topic={t}
              onChange={update}
              onRemoved={() => {
                emitTopic({ type: "removed", id: t.id });
                onClose();
              }}
            />
          </>
        )}
        {!bare && (
          <button type="button" onClick={onClose} aria-label="Close post" title="Close" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-raised hover:text-ink">
            <Icon name="x" size={18} />
          </button>
        )}
      </header>
      {!t && error ? (
        <div className="p-4">
          <SpaceError status={status} message={error} onRetry={reload} />
        </div>
      ) : !data || !t ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <PostSkeleton />
        </div>
      ) : (
        <ChatPane
          key={data.thread.id}
          space={{ slug }}
          channel={data.thread}
          isMember={t.canLike}
          gate={<p className="text-sm text-ink-muted">Join the community to reply.</p>}
          onRead={() => undefined}
          placeholder="Reply…"
          closedNote={t.locked ? "This post is locked. Only owners and admins can reply." : undefined}
          intro={(empty) => <PostIntro t={t} empty={empty} />}
        />
      )}
    </div>
  );
}

function PostSkeleton() {
  return (
    <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading the post">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="h-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <div className="space-y-4 pt-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className={i % 2 ? "h-3.5 w-2/3" : "h-3.5 w-1/2"} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The post at the start of its chat: who and when, the title, tags, the picture, then the text. */
function PostIntro({ t, empty }: { t: TopicDTO; empty: boolean }) {
  const now = useNow();
  return (
    <article className="px-4 pt-5 pb-2 sm:px-5" aria-label={t.title}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-muted">
        <ProfileTrigger handle={t.author.handle} className="inline-flex items-center gap-2 text-ink hover:underline">
          <Avatar name={t.author.displayName} src={t.author.avatarUrl} frame={t.author.avatarFrame} size={26} />
          <span className="text-[13px] font-semibold">
            <UserName name={t.author.displayName} effect={t.author.nameEffect} />
          </span>
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
      </div>
      <h1 className="mt-2.5 text-xl leading-snug font-bold tracking-[-0.02em] break-words">{t.title}</h1>
      {t.tags.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Tags">
          {t.tags.map((tag) => (
            <li key={tag} className="rounded-full bg-raised px-2.5 py-0.5 text-[12px] font-medium text-ink-muted">
              {tag}
            </li>
          ))}
        </ul>
      )}
      <TopicMedia media={t.media.slice(0, 1)} tall className="mt-3" />
      {t.body && (
        <p className="mt-3 text-[15px] leading-relaxed break-words whitespace-pre-wrap">
          <Linkified text={t.body} />
        </p>
      )}
      <div className="mt-5 flex items-center gap-3 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
        <span className="h-px flex-1 bg-line" />
        {empty ? "No replies yet" : `${t.commentCount} ${t.commentCount === 1 ? "reply" : "replies"}`}
        <span className="h-px flex-1 bg-line" />
      </div>
      {empty && t.canComment && <p className="mt-3 text-center text-sm text-ink-muted">Start the conversation.</p>}
    </article>
  );
}

/** Follow a post to hear about new replies (posting or replying follows it for you). */
function FollowButton({ topic: t, slug, onChange }: { topic: TopicDTO; slug: string; onChange: (t: TopicDTO) => void }) {
  const { requireAuth } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    if (busy || !requireAuth()) return;
    setBusy(true);
    const next = !t.following;
    onChange({ ...t, following: next });
    try {
      await TopicService.follow(slug, t.id, next);
      toast(next ? "Following. You'll hear about new replies." : "Unfollowed", "success");
    } catch (e) {
      onChange({ ...t, following: !next });
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-pressed={t.following}
      title={t.following ? "Following: you hear about new replies. Click to stop." : "Follow to hear about new replies"}
      className={cx("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold transition", t.following ? "bg-accent/15 text-accent-text" : "text-ink-muted hover:bg-raised hover:text-ink")}
    >
      <Icon name="bell" size={15} /> {t.following ? "Following" : "Follow"}
    </button>
  );
}
