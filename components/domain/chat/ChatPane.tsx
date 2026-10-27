"use client";

import { errorMessage } from "@/app/ApiCore";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { SpaceRef } from "@/app/services/ChannelService";
import { channelSource, type ChatSource } from "@/app/services/ChatSource";
import { ReportDialog } from "@/components/domain/ReportDialog";
import { ConfirmModal } from "@/components/domain/space/parts";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button, Spinner } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { LIMITS, slowModeLabel } from "@/lib/constants";
import { useChat, type SendError } from "@/lib/hooks/useChat";
import { useAttachments } from "@/lib/hooks/useAttachments";
import { useStickers } from "@/lib/hooks/useStickers";
import { useDebounced } from "@/lib/hooks/useApi";
import { activeMention } from "@/lib/mentions";
import type { ChannelDTO, ChannelMessageDTO, ReplyRefDTO, UserBrief } from "@/lib/types";
import { AttachmentStrip } from "./AttachmentStrip";
import { Dropdown } from "@/components/ui/Dropdown";
import { Message } from "./Message";
import { ReplyingTo } from "./ReplyQuote";
import { AttachedSticker, StickerPicker, type StickerChoice } from "./Reactions";
import { PollComposer } from "./Polls";

const GROUP_GAP_MS = 5 * 60 * 1000;
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

function dayLabel(iso: string) {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  const k = dayKey(iso);
  if (k === today) return "Today";
  if (k === yesterday) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Lagos", weekday: "long", day: "numeric", month: "long" });
}

/**
 * The conversation itself: newest messages at the bottom, scroll UP for history (older pages load
 * automatically as you near the top and your place is kept), a composer pinned underneath.
 * Mount with `key` = space + channel so each channel starts with a clean scroll state.
 *  - `isMember`: the viewer belongs to this space (community or group)
 *  - `gate`: what to show instead of the composer for someone who isn't a member (a join button)
 */
export function ChatPane({
  space,
  source,
  channel,
  isMember,
  gate,
  onRead,
  intro,
  placeholder,
  closedNote,
}: {
  /** a community or group channel (or pass `source` for any other chat, like a crew's) */
  space?: SpaceRef;
  source?: ChatSource;
  channel: ChannelDTO;
  isMember: boolean;
  gate: ReactNode;
  onRead: () => void;
  /** replaces the "Welcome to #channel" start of the conversation */
  intro?: (empty: boolean) => ReactNode;
  /** composer hint (default "Message #channel") */
  placeholder?: string;
  /** what a member who can't post here is told (default: the announcement / no-posting line) */
  closedNote?: string;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [src] = useState(() => source ?? channelSource(space!, channel.slug, channel.id));
  const chat = useChat(src);
  const { items, hasOlder, loading, loadingOlder, loadOlder } = chat;

  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLUListElement>(null);
  const atBottom = useRef(true);
  const restore = useRef<{ h: number; t: number } | null>(null);
  const prevLast = useRef<string | null>(null);
  const [unseen, setUnseen] = useState(0);
  // scrolled well up into the history: offer the way back down ("Jump to present")
  const [away, setAway] = useState(false);
  const [deleting, setDeleting] = useState<ChannelMessageDTO | null>(null);
  const [reporting, setReporting] = useState<ChannelMessageDTO | null>(null);
  const [replyTo, setReplyTo] = useState<ChannelMessageDTO | null>(null);
  const [pinTick, setPinTick] = useState(0);
  const stickers = useStickers();
  const saveSticker = (url: string) => void stickers.save(url).then((err) => toast(err ?? "Saved to your stickers.", err ? "error" : "success"));

  /** Scroll to a message that is already loaded and flash it. */
  const jump = useCallback(
    (id: string) => {
      const el = document.getElementById(`msg-${id}`);
      if (!el) return toast("That message is further back. Scroll up to find it.");
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("bg-accent/20");
      setTimeout(() => el.classList.remove("bg-accent/20"), 1400);
    },
    [toast],
  );

  // Keep the viewport sensible whenever messages change.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (restore.current) {
      // Older messages were prepended: hold the user's place instead of jumping.
      el.scrollTop = el.scrollHeight - restore.current.h + restore.current.t;
      restore.current = null;
      return;
    }
    const last = items[items.length - 1];
    const lastId = last?.id ?? null;
    if (lastId === prevLast.current) return;
    const first = prevLast.current === null;
    const idx = prevLast.current ? items.findIndex((m) => m.id === prevLast.current) : -1;
    const added = idx >= 0 ? items.length - 1 - idx : 1;
    const mine = !!last && !!user && last.author.id === user.id;
    prevLast.current = lastId;
    if (first || atBottom.current || mine) {
      el.scrollTop = el.scrollHeight;
      setUnseen(0);
    } else {
      setUnseen((n) => n + added);
    }
  }, [items, user]);

  // Link previews and images load after the text: stay glued to the bottom if that's where you were.
  useEffect(() => {
    const list = content.current;
    const el = scroller.current;
    if (!list || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (atBottom.current && !restore.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(list);
    return () => ro.disconnect();
  }, [loading]);

  // Mark read when the conversation is on screen and the tab is visible.
  const newestId = items.length ? items[items.length - 1].id : null;
  const lastMarked = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!isMember || loading || !newestId || newestId.startsWith("pending-") || lastMarked.current === newestId) return;
    if (document.visibilityState !== "visible" || !atBottom.current) return;
    lastMarked.current = newestId;
    void src.markRead().then(onRead, () => undefined);
  }, [newestId, loading, isMember, src, onRead]);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottom.current = fromBottom < 80;
    setAway(fromBottom > 600);
    if (atBottom.current) setUnseen(0);
    if (el.scrollTop < 200 && hasOlder && !loadingOlder && !loading) {
      restore.current = { h: el.scrollHeight, t: el.scrollTop };
      void loadOlder().then((ok) => {
        if (!ok) restore.current = null;
      });
    }
  }, [hasOlder, loadingOlder, loading, loadOlder]);

  const jumpToLatest = () => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setUnseen(0);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PinnedBar source={src} tick={pinTick} onJump={jump} onUnpin={(id) => void chat.pin(id, false).then((err) => (err ? toast(err, "error") : setPinTick((n) => n + 1)))} />
      <div className="relative min-h-0 flex-1">
        <div ref={scroller} onScroll={onScroll} className="kq-calm h-full overflow-y-auto overscroll-contain pb-3" role="log" aria-live="polite" aria-relevant="additions" aria-label={`Messages in ${channel.name}`}>
          {loading ? (
            <div className="space-y-5 px-6 py-6" role="status" aria-label="Loading messages">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="size-10 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className={cx("h-3.5", i % 2 ? "w-2/3" : "w-1/2")} />
                  </div>
                </div>
              ))}
            </div>
          ) : chat.error && !items.length ? (
            <div className="p-6">
              <ErrorState title="Couldn't load this channel" message={chat.error} onRetry={chat.reload} />
            </div>
          ) : (
            <>
              {hasOlder ? (
                <div className="flex justify-center py-4 text-xs text-ink-muted" aria-live="polite">
                  {loadingOlder ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner /> Loading earlier messages…
                    </span>
                  ) : (
                    <button type="button" onClick={onScroll} className="underline underline-offset-2 hover:text-ink">
                      Scroll up for earlier messages
                    </button>
                  )}
                </div>
              ) : (
                intro ? intro(!items.length) : <ChannelIntro channel={channel} empty={!items.length} />
              )}
              <ul ref={content}>
                {items.map((m, i) => {
                  const prev = items[i - 1];
                  const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
                  const showHead = newDay || prev.author.id !== m.author.id || +new Date(m.createdAt) - +new Date(prev.createdAt) > GROUP_GAP_MS;
                  return (
                    <div key={m.id} role="presentation">
                      {newDay && (
                        <li role="separator" aria-label={dayLabel(m.createdAt)} className="mx-4 mt-5 flex items-center gap-3 text-[11px] font-semibold tracking-wide text-ink-muted uppercase sm:mx-6">
                          <span className="h-px flex-1 bg-line" />
                          {dayLabel(m.createdAt)}
                          <span className="h-px flex-1 bg-line" />
                        </li>
                      )}
                      <Message m={m} showHead={showHead} mine={!!user && m.author.id === user.id} meId={user?.id ?? null} onDelete={setDeleting} onEdit={(msg, body) => chat.edit(msg.id, body)} onReport={user ? setReporting : undefined} onReply={isMember && channel.canPost ? setReplyTo : undefined} onPin={(msg, pinned) => void chat.pin(msg.id, pinned).then((err) => (err ? toast(err, "error") : setPinTick((n) => n + 1)))} onJump={jump} canReact={isMember && !!user} onReact={(msg, kind) => void chat.react(msg.id, kind).then((err) => err && toast(err, "error"))} onSaveSticker={user ? saveSticker : undefined} />
                    </div>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {unseen > 0 ? (
          <button type="button" onClick={jumpToLatest} className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink shadow-lg">
            <Icon name="arrowdown" size={14} /> {unseen} new {unseen === 1 ? "message" : "messages"}
          </button>
        ) : (
          away && (
            <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 rounded-control border border-line bg-surface/95 py-1.5 pr-1.5 pl-3.5 text-[13px] shadow-lg backdrop-blur sm:inset-x-6">
              <span className="truncate text-ink-muted">You&apos;re viewing older messages</span>
              <button type="button" onClick={jumpToLatest} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 font-semibold text-accent-ink">
                Jump to present <Icon name="arrowdown" size={13} />
              </button>
            </div>
          )
        )}
      </div>

      <Composer source={src} placeholder={placeholder} closedNote={closedNote} channel={channel} isMember={isMember} gate={gate} send={chat.send} onSent={() => (atBottom.current = true)} onPolled={() => void chat.reload()} replyTo={replyTo} onClearReply={() => setReplyTo(null)} />

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete this message?"
        description="It will be removed for everyone."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return;
          const err = await chat.remove(deleting.id);
          if (err) throw new Error(err);
        }}
      />
      {reporting && <ReportDialog open onClose={() => setReporting(null)} targetType="channelMessage" targetId={reporting.id} subject={`this message from ${reporting.author.displayName}`} />}
      {chat.error && items.length > 0 && (
        <p role="alert" className="sr-only">
          {chat.error}
        </p>
      )}
    </div>
  );
}

/** A thin strip under the channel header listing pinned messages (owners and admins can unpin). */
function PinnedBar({ source, tick, onJump, onUnpin }: { source: ChatSource; tick: number; onJump: (id: string) => void; onUnpin: (id: string) => void }) {
  const [pins, setPins] = useState<ChannelMessageDTO[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!source.pins) return;
    let live = true;
    source.pins().then(
      (r) => live && setPins(r.data),
      () => live && setPins([]),
    );
    return () => {
      live = false;
    };
  }, [source, tick]);
  if (!pins.length) return null;
  const top = pins[0];
  return (
    <div className="shrink-0 border-b border-line bg-canvas">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] sm:px-6">
        <Icon name="pushpin" size={14} className="shrink-0 text-accent-text" />
        <span className="shrink-0 font-semibold">{pins.length} pinned</span>
        <span className="min-w-0 flex-1 truncate text-ink-muted">{top.author.displayName}: {top.body || (top.sticker || top.stickerUrl ? "Sticker" : "Photo")}</span>
        <Icon name="chevron-down" size={14} className={cx("shrink-0 text-ink-muted transition", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="max-h-64 overflow-y-auto border-t border-line px-2 py-1.5">
          {pins.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-control px-2 py-1.5 hover:bg-raised">
              <button type="button" onClick={() => (setOpen(false), onJump(p.id))} className="flex min-w-0 flex-1 items-center gap-2 text-left text-[13px]">
                <Avatar name={p.author.displayName} src={p.author.avatarUrl} frame={p.author.avatarFrame} size={22} />
                <span className="shrink-0 font-semibold">{p.author.displayName}</span>
                <span className="truncate text-ink-muted">{p.body || (p.sticker || p.stickerUrl ? "Sticker" : "Photo")}</span>
              </button>
              {p.canPin && (
                <button type="button" onClick={() => onUnpin(p.id)} className="shrink-0 rounded-full px-2 py-1 text-[12px] font-semibold text-ink-muted hover:bg-line hover:text-ink">
                  Unpin
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChannelIntro({ channel, empty }: { channel: ChannelDTO; empty: boolean }) {
  return (
    <div className="px-4 pt-8 pb-2 sm:px-6">
      <span className="mb-3 inline-flex size-14 items-center justify-center rounded-full bg-raised text-accent-text">
        <Icon name={channel.type === "announcement" ? "megaphone" : channel.visibility === "all" ? "hash" : "lock"} size={26} />
      </span>
      <h2 className="text-2xl font-semibold tracking-[-0.03em]">
        {channel.type === "announcement" ? "" : "Welcome to #"}
        {channel.name}
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        {channel.topic || (channel.visibility === "invite" ? "A private channel. Only invited people and admins can see it." : channel.type === "announcement" ? "Official updates from the admins." : "This is the start of the conversation.")}
        {empty && channel.canPost ? " Be the first to say something." : ""}
      </p>
      {empty && !channel.canPost && (
        <div className="mt-6">
          <EmptyState icon="message" title="Nothing here yet" compact>
            {channel.type === "announcement" ? "Announcements from the admins will show up here." : "Messages will show up here."}
          </EmptyState>
        </div>
      )}
    </div>
  );
}

/* ----------------------------- composer ----------------------------- */

function Composer({
  source,
  placeholder,
  channel,
  isMember,
  gate,
  send,
  onSent,
  replyTo,
  onClearReply,
  closedNote,
  onPolled,
}: {
  /** a poll was posted: fetch the chat so it shows */
  onPolled: () => void;
  source: ChatSource;
  placeholder?: string;
  closedNote?: string;
  channel: ChannelDTO;
  isMember: boolean;
  gate: ReactNode;
  send: (input: { body: string; sticker?: string; stickerUrl?: string; images?: string[]; replyTo?: ReplyRefDTO | null }, me: NonNullable<ReturnType<typeof useAuth>["user"]>) => Promise<SendError | null>;
  onSent: () => void;
  replyTo: ChannelMessageDTO | null;
  onClearReply: () => void;
}) {
  const attach = useAttachments();
  const fileInput = useRef<HTMLInputElement>(null);
  const { user, status } = useAuth();
  const toast = useToast();
  const [text, setText] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const [stickers, setStickers] = useState(false);
  const [sticker, setSticker] = useState<StickerChoice | null>(null);
  const [polling, setPolling] = useState(false);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [options, setOptions] = useState<UserBrief[]>([]);
  const [active, setActive] = useState(0);
  const query = useDebounced(mention?.query ?? null, 150);
  const ticket = useRef(0);
  const slow = useSlowMode(channel);

  // Fetch tag suggestions for "@que" as you type (the server only returns people who can read this channel).
  useEffect(() => {
    if (query === null || !channel.canPost) {
      setOptions([]);
      return;
    }
    const mine = ++ticket.current;
    source.mentionable(query).then(
      (r) => {
        if (mine !== ticket.current) return;
        setOptions(r.data);
        setActive(0);
      },
      () => mine === ticket.current && setOptions([]),
    );
  }, [query, source, channel.canPost]);

  const resize = () => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    // only a message taller than the box scrolls; a short one (or the hint) never shows a scrollbar
    el.style.overflowY = el.scrollHeight > 180 ? "auto" : "hidden";
  };

  const trackMention = (value: string, caret: number) => setMention(activeMention(value, caret));

  function pick(u: UserBrief) {
    if (!mention || !area.current) return;
    const caret = area.current.selectionStart ?? text.length;
    const next = `${text.slice(0, mention.start)}@${u.handle} ${text.slice(caret)}`;
    const pos = mention.start + u.handle.length + 2;
    setText(next);
    setMention(null);
    setOptions([]);
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(pos, pos);
      resize();
    });
  }

  async function submit() {
    const body = text.trim();
    const images = attach.urls;
    const chosen = sticker;
    if ((!body && !images.length && !chosen) || !user || attach.uploading || slow.left > 0) return;
    const reply = replyTo ? { id: replyTo.id, authorName: replyTo.author.displayName, snippet: replyTo.body.slice(0, 120) || (replyTo.sticker || replyTo.stickerUrl ? "Sticker" : replyTo.images.length ? "Photo" : "Message"), deleted: false } : null;
    setText("");
    attach.clear();
    setSticker(null);
    onClearReply();
    setMention(null);
    requestAnimationFrame(resize);
    onSent();
    slow.sent();
    const err = await send({ body, images, replyTo: reply, ...chosen }, user);
    if (err) {
      setText((t) => t || body); // never lose what they typed
      attach.restore(images);
      setSticker((s) => s ?? chosen);
      slow.failed(err.retryAfter);
      if (!err.retryAfter) toast(err.message, "error");
      requestAnimationFrame(resize);
    }
  }

  function pickSticker(choice: StickerChoice) {
    setSticker(choice);
    requestAnimationFrame(() => area.current?.focus());
  }

  const bar = "border-t border-line bg-canvas px-4 py-3 sm:px-6";

  if (status === "anon") {
    return (
      <div className={cx(bar, "flex items-center justify-between gap-3")}>
        <p className="text-sm text-ink-muted">Sign in to join the conversation.</p>
        <Button href={`/login?next=${encodeURIComponent(typeof window === "undefined" ? "/" : window.location.pathname + window.location.search)}`} variant="primary" size="sm">
          Sign in
        </Button>
      </div>
    );
  }
  if (!isMember) return <div className={cx(bar, "flex items-center justify-between gap-3")}>{gate}</div>;
  if (!channel.canPost) {
    return (
      <div className={cx(bar, "flex items-center gap-2 text-sm text-ink-muted")}>
        <Icon name={channel.type === "announcement" ? "megaphone" : "lock"} size={15} />
        {closedNote ?? (channel.type === "announcement" ? "Only owners and admins can post in this channel." : "You can't post in this channel.")}
      </div>
    );
  }

  const open = !!mention && options.length > 0;
  const left = LIMITS.messageBody - text.length;
  return (
    <>
    {/* outside the form: the poll's own form must not sit inside this one */}
    {polling && (
      <PollComposer
        onClose={() => setPolling(false)}
        onCreate={async (poll) => {
          try {
            await source.send({ body: "", poll });
            onSent();
            onPolled();
            return null;
          } catch (e) {
            return errorMessage(e);
          }
        }}
      />
    )}
    <form
      className={cx(bar, "relative")}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {open && (
        <ul id="mention-list" role="listbox" aria-label="Tag someone" className="absolute right-4 bottom-full left-4 z-20 mb-1 max-h-64 overflow-y-auto rounded-card border border-line bg-surface p-1.5 shadow-2xl sm:right-6 sm:left-6">
          {options.map((o, i) => (
            <li
              key={o.id}
              id={`mention-${o.id}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setActive(i)}
              className={cx("flex cursor-pointer items-center gap-3 rounded-control px-2.5 py-2", i === active ? "bg-raised" : "")}
            >
              <Avatar name={o.displayName} src={o.avatarUrl} frame={o.avatarFrame} size={28} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{o.displayName}</span>
              <span className="font-mono text-[11px] text-ink-muted">@{o.handle}</span>
            </li>
          ))}
        </ul>
      )}
      {slow.on && (
        <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[12px] text-ink-muted" aria-live="polite">
          <Icon name="timer" size={13} className="shrink-0" />
          {slow.left > 0 ? (
            <>
              Slow mode is on. You can send again in <span className="font-mono font-semibold text-ink">{formatWait(slow.left)}</span>
            </>
          ) : (
            <>Slow mode is on: one message every {slowModeLabel(channel.slowModeSec)}{channel.slowModeExempt ? ". You're exempt as an owner or admin." : "."}</>
          )}
        </p>
      )}
      {replyTo && <ReplyingTo name={replyTo.author.displayName} snippet={replyTo.body.slice(0, 80) || (replyTo.sticker || replyTo.stickerUrl ? "Sticker" : "Photo")} onCancel={onClearReply} />}
      <AttachedSticker choice={sticker} onRemove={() => setSticker(null)} />
      <AttachmentStrip urls={attach.urls} progress={attach.progress} error={attach.error} onRemove={attach.remove} />
      <div className="flex items-end gap-2 rounded-card border border-line bg-surface p-2 focus-within:border-accent-text">
        {attach.enabled && <input ref={fileInput} type="file" hidden multiple accept=".jpg,.jpeg,.png,.webp,.gif,.avif,.heic,.heif" onChange={(e) => (void attach.add(e.target.files), (e.target.value = ""))} aria-label="Choose pictures" />}
        {/* + : add pictures, or start a poll */}
        <Dropdown
          label="Add to your message"
          width={200}
          items={[
            ...(attach.enabled ? [{ label: "Upload pictures", icon: "image" as const, disabled: attach.full || attach.uploading, onSelect: () => fileInput.current?.click() }] : []),
            { label: "Create a poll", icon: "topics" as const, onSelect: () => setPolling(true) },
          ]}
          trigger={({ props }) => (
            <button {...props} disabled={slow.left > 0} aria-label="Add pictures or a poll" title="Add pictures or a poll" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-raised hover:text-ink disabled:opacity-40">
              <Icon name="plus" size={20} />
            </button>
          )}
        />
        <label htmlFor="chat-composer" className="sr-only">
          Message #{channel.name}. Type @ to tag someone.
        </label>
        <textarea
          id="chat-composer"
          ref={area}
          rows={1}
          role="combobox"
          aria-expanded={open}
          aria-controls="mention-list"
          aria-autocomplete="list"
          aria-activedescendant={open ? `mention-${options[active]?.id}` : undefined}
          value={text}
          maxLength={LIMITS.messageBody}
          placeholder={placeholder ?? `Message #${channel.name}`}
          onChange={(e) => {
            setText(e.target.value);
            trackMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
            resize();
          }}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
            if (files.length && attach.enabled) {
              e.preventDefault();
              void attach.add(files);
            }
          }}
          onClick={(e) => trackMention(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
          onBlur={() => setTimeout(() => setMention(null), 120)}
          onKeyDown={(e) => {
            if (open) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => (a + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                pick(options[active]);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setMention(null);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          className="max-h-[180px] min-h-10 flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] leading-relaxed text-ink placeholder:text-ink-muted/70 focus:outline-none"
        />
        <span className="relative">
          <button type="button" onClick={() => setStickers((o) => !o)} disabled={slow.left > 0} aria-label="Stickers" aria-expanded={stickers} title="Stickers" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-raised hover:text-ink disabled:opacity-40">
            <Icon name="sticker" size={20} />
          </button>
          {stickers && <StickerPicker onPick={pickSticker} onClose={() => setStickers(false)} className="absolute right-0 bottom-full mb-2" />}
        </span>
        {left < 200 && <span className={cx("pb-2.5 font-mono text-[11px]", left < 0 ? "text-danger" : "text-ink-muted")}>{left}</span>}
        {slow.left > 0 ? (
          <span role="timer" aria-label={`You can send again in ${formatWait(slow.left)}`} className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full bg-raised px-2.5 font-mono text-[12px] font-semibold text-ink-muted">
            {formatWait(slow.left)}
          </span>
        ) : (
          <button type="submit" disabled={(!text.trim() && !attach.urls.length && !sticker) || attach.uploading} aria-label="Send message" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition active:scale-95 disabled:opacity-40">
            <Icon name="send" size={17} />
          </button>
        )}
      </div>
      <p className="mt-1.5 hidden px-1 text-[11px] text-ink-muted sm:block">
        <kbd className="font-mono">Enter</kbd> to send · <kbd className="font-mono">Shift + Enter</kbd> for a new line · <kbd className="font-mono">@</kbd> to tag someone · paste a link to preview it
      </p>
    </form>
    </>
  );
}

/** "0:42", "4:05", "1:00:00" */
function formatWait(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/**
 * Slow mode in the composer: after you send, the countdown runs and sending waits until it ends. The server is
 * the judge (it refuses early messages and says how long is left); this only mirrors it. A change to the
 * channel's setting applies at once: turned off, the wait ends; shortened, it never runs past the new interval.
 */
function useSlowMode(channel: ChannelDTO) {
  const sec = channel.slowModeExempt ? 0 : (channel.slowModeSec ?? 0);
  const [from, setFrom] = useState<{ at: number; wait: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const until = from && sec ? from.at + Math.min(from.wait, sec) * 1000 : 0;
  useEffect(() => {
    if (!until) return;
    setNow(Date.now());
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= until) clearInterval(t);
    }, 250);
    return () => clearInterval(t);
  }, [until]);
  return {
    /** the channel has slow mode (shown to everyone who can post, exempt or not) */
    on: (channel.slowModeSec ?? 0) > 0,
    /** whole seconds left before you can send (0: go ahead) */
    left: until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0,
    sent: () => {
      if (sec) setFrom({ at: Date.now(), wait: sec });
    },
    /** the server said no: wait what it says (or nothing, if it refused for another reason) */
    failed: (retryAfter?: number) => setFrom(retryAfter ? { at: Date.now(), wait: retryAfter } : null),
  };
}
