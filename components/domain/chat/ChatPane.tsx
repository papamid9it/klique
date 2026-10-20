"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChannelService, type SpaceRef } from "@/app/services/ChannelService";
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
import { LIMITS } from "@/lib/constants";
import { useChat } from "@/lib/hooks/useChat";
import { useAttachments } from "@/lib/hooks/useAttachments";
import { useDebounced } from "@/lib/hooks/useApi";
import { activeMention } from "@/lib/mentions";
import type { ChannelDTO, ChannelMessageDTO, ReplyRefDTO, UserBrief } from "@/lib/types";
import { AttachmentStrip } from "./AttachmentStrip";
import { Message } from "./Message";
import { ReplyingTo } from "./ReplyQuote";
import { StickerPicker } from "./Reactions";

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
export function ChatPane({ space, channel, isMember, gate, onRead }: { space: SpaceRef; channel: ChannelDTO; isMember: boolean; gate: ReactNode; onRead: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const chat = useChat(space, channel.slug, channel.id);
  const { items, hasOlder, loading, loadingOlder, loadOlder } = chat;

  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLUListElement>(null);
  const atBottom = useRef(true);
  const restore = useRef<{ h: number; t: number } | null>(null);
  const prevLast = useRef<string | null>(null);
  const [unseen, setUnseen] = useState(0);
  const [deleting, setDeleting] = useState<ChannelMessageDTO | null>(null);
  const [reporting, setReporting] = useState<ChannelMessageDTO | null>(null);
  const [replyTo, setReplyTo] = useState<ChannelMessageDTO | null>(null);
  const [pinTick, setPinTick] = useState(0);

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
    void ChannelService.markRead(space, channel.slug).then(onRead, () => undefined);
  }, [newestId, loading, isMember, space, channel.slug, onRead]);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
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
      <PinnedBar space={space} channel={channel} tick={pinTick} onJump={jump} onUnpin={(id) => void chat.pin(id, false).then((err) => (err ? toast(err, "error") : setPinTick((n) => n + 1)))} />
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
                <ChannelIntro channel={channel} empty={!items.length} />
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
                      <Message m={m} showHead={showHead} mine={!!user && m.author.id === user.id} meId={user?.id ?? null} onDelete={setDeleting} onEdit={(msg, body) => chat.edit(msg.id, body)} onReport={user ? setReporting : undefined} onReply={isMember && channel.canPost ? setReplyTo : undefined} onPin={(msg, pinned) => void chat.pin(msg.id, pinned).then((err) => (err ? toast(err, "error") : setPinTick((n) => n + 1)))} onJump={jump} canReact={isMember && !!user} onReact={(msg, kind) => void chat.react(msg.id, kind).then((err) => err && toast(err, "error"))} />
                    </div>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {unseen > 0 && (
          <button type="button" onClick={jumpToLatest} className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink shadow-lg">
            <Icon name="arrowdown" size={14} /> {unseen} new {unseen === 1 ? "message" : "messages"}
          </button>
        )}
      </div>

      <Composer space={space} channel={channel} isMember={isMember} gate={gate} send={chat.send} onSent={() => (atBottom.current = true)} replyTo={replyTo} onClearReply={() => setReplyTo(null)} />

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
function PinnedBar({ space, channel, tick, onJump, onUnpin }: { space: SpaceRef; channel: ChannelDTO; tick: number; onJump: (id: string) => void; onUnpin: (id: string) => void }) {
  const [pins, setPins] = useState<ChannelMessageDTO[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    ChannelService.pins(space, channel.slug).then(
      (r) => live && setPins(r.data),
      () => live && setPins([]),
    );
    return () => {
      live = false;
    };
  }, [space, channel.slug, tick]);
  if (!pins.length) return null;
  const top = pins[0];
  return (
    <div className="shrink-0 border-b border-line bg-canvas">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] sm:px-6">
        <Icon name="pushpin" size={14} className="shrink-0 text-accent-text" />
        <span className="shrink-0 font-semibold">{pins.length} pinned</span>
        <span className="min-w-0 flex-1 truncate text-ink-muted">{top.author.displayName}: {top.body || "Photo"}</span>
        <Icon name="chevron-down" size={14} className={cx("shrink-0 text-ink-muted transition", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="max-h-64 overflow-y-auto border-t border-line px-2 py-1.5">
          {pins.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-control px-2 py-1.5 hover:bg-raised">
              <button type="button" onClick={() => (setOpen(false), onJump(p.id))} className="flex min-w-0 flex-1 items-center gap-2 text-left text-[13px]">
                <Avatar name={p.author.displayName} src={p.author.avatarUrl} frame={p.author.avatarFrame} size={22} />
                <span className="shrink-0 font-semibold">{p.author.displayName}</span>
                <span className="truncate text-ink-muted">{p.body || "Photo"}</span>
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
  space,
  channel,
  isMember,
  gate,
  send,
  onSent,
  replyTo,
  onClearReply,
}: {
  space: SpaceRef;
  channel: ChannelDTO;
  isMember: boolean;
  gate: ReactNode;
  send: (input: { body: string; sticker?: string; images?: string[]; replyTo?: ReplyRefDTO | null }, me: NonNullable<ReturnType<typeof useAuth>["user"]>) => Promise<string | null>;
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
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [options, setOptions] = useState<UserBrief[]>([]);
  const [active, setActive] = useState(0);
  const query = useDebounced(mention?.query ?? null, 150);
  const ticket = useRef(0);

  // Fetch tag suggestions for "@que" as you type (the server only returns people who can read this channel).
  useEffect(() => {
    if (query === null || !channel.canPost) {
      setOptions([]);
      return;
    }
    const mine = ++ticket.current;
    ChannelService.mentionable(space, channel.slug, query).then(
      (r) => {
        if (mine !== ticket.current) return;
        setOptions(r.data);
        setActive(0);
      },
      () => mine === ticket.current && setOptions([]),
    );
  }, [query, space, channel.slug, channel.canPost]);

  const resize = () => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
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
    if ((!body && !images.length) || !user || attach.uploading) return;
    const reply = replyTo ? { id: replyTo.id, authorName: replyTo.author.displayName, snippet: replyTo.body.slice(0, 120) || (replyTo.images.length ? "Photo" : "Message"), deleted: false } : null;
    setText("");
    attach.clear();
    onClearReply();
    setMention(null);
    requestAnimationFrame(resize);
    onSent();
    const err = await send({ body, images, replyTo: reply }, user);
    if (err) {
      setText((t) => t || body); // never lose what they typed
      attach.restore(images);
      toast(err, "error");
      requestAnimationFrame(resize);
    }
  }

  async function sendSticker(id: string) {
    if (!user) return;
    onSent();
    const err = await send({ body: "", sticker: id }, user);
    if (err) toast(err, "error");
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
        {channel.type === "announcement" ? "Only owners and admins can post in this channel." : "You can't post in this channel."}
      </div>
    );
  }

  const open = !!mention && options.length > 0;
  const left = LIMITS.messageBody - text.length;
  return (
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
      {replyTo && <ReplyingTo name={replyTo.author.displayName} snippet={replyTo.body.slice(0, 80) || "Photo"} onCancel={onClearReply} />}
      <AttachmentStrip urls={attach.urls} progress={attach.progress} error={attach.error} onRemove={attach.remove} />
      <div className="flex items-end gap-2 rounded-card border border-line bg-surface p-2 focus-within:border-accent-text">
        {attach.enabled && (
          <>
            <input ref={fileInput} type="file" hidden multiple accept=".jpg,.jpeg,.png,.webp,.gif,.avif,.heic,.heif" onChange={(e) => (void attach.add(e.target.files), (e.target.value = ""))} aria-label="Choose pictures" />
            <button type="button" onClick={() => fileInput.current?.click()} disabled={attach.full || attach.uploading} aria-label="Add pictures" title="Add pictures" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-raised hover:text-ink disabled:opacity-40">
              <Icon name="image" size={20} />
            </button>
          </>
        )}
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
          placeholder={`Message #${channel.name}`}
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
          <button type="button" onClick={() => setStickers((o) => !o)} aria-label="Stickers" aria-expanded={stickers} title="Stickers" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-raised hover:text-ink">
            <Icon name="sticker" size={20} />
          </button>
          {stickers && <StickerPicker onPick={(id) => void sendSticker(id)} onClose={() => setStickers(false)} className="absolute right-0 bottom-full mb-2" />}
        </span>
        {left < 200 && <span className={cx("pb-2.5 font-mono text-[11px]", left < 0 ? "text-danger" : "text-ink-muted")}>{left}</span>}
        <button type="submit" disabled={(!text.trim() && !attach.urls.length) || attach.uploading} aria-label="Send message" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition active:scale-95 disabled:opacity-40">
          <Icon name="send" size={17} />
        </button>
      </div>
      <p className="mt-1.5 hidden px-1 text-[11px] text-ink-muted sm:block">
        <kbd className="font-mono">Enter</kbd> to send · <kbd className="font-mono">Shift + Enter</kbd> for a new line · <kbd className="font-mono">@</kbd> to tag someone · paste a link to preview it
      </p>
    </form>
  );
}
