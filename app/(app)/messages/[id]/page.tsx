"use client";

import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import { useRealtime } from "@/components/providers/RealtimeProvider";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, isApiError } from "@/app/ApiCore";
import { MessageService } from "@/app/services/MessageService";
import { SafetyService } from "@/app/services/SafetyService";
import { OverflowMenu } from "@/components/domain/OverflowMenu";
import { ConversationInfo } from "@/components/domain/messages/ConversationInfo";
import { SlideOver } from "@/components/ui/SlideOver";
import { ReportDialog } from "@/components/domain/ReportDialog";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { LIMITS } from "@/lib/constants";
import { formatDateLong, formatTime } from "@/lib/format";
import { AttachmentStrip } from "@/components/domain/chat/AttachmentStrip";
import { ChatImages } from "@/components/domain/chat/ChatImages";
import { ReplyingTo, ReplyQuote } from "@/components/domain/chat/ReplyQuote";
import { useAttachments } from "@/lib/hooks/useAttachments";
import { recallApi, rememberApi } from "@/lib/hooks/useApi";
import { EditedTag, MessageEditor } from "@/components/domain/chat/MessageEditor";
import { ConfirmModal } from "@/components/domain/space/parts";
import { StickerPicker, StickerView, ReactButton, ReactionBar } from "@/components/domain/chat/Reactions";
import { applyReaction, type ReactionKind } from "@/lib/reactions";
import type { ConversationDetailDTO, MessageDTO } from "@/lib/types";
import { UserName } from "@/components/ui/UserName";

type Local = MessageDTO & { pending?: boolean; failed?: boolean };
type Snapshot = { detail: ConversationDetailDTO; messages: Local[]; hasMore: boolean };

function merge(prev: Local[], incoming: MessageDTO[]): Local[] {
  const map = new Map<string, Local>();
  for (const m of prev) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const { user, status, requireAuth, refresh } = useAuth();
  const toast = useToast();
  const authed = status === "authed";

  // the conversation as you last saw it paints at once; the server's copy merges in behind it
  const cacheKey = `dm:${id}`;
  const [initial] = useState(() => recallApi<Snapshot>(cacheKey));
  const [detail, setDetail] = useState<ConversationDetailDTO | null>(initial?.detail ?? null);
  const [messages, setMessages] = useState<Local[]>(initial?.messages ?? []);
  const [hasMore, setHasMore] = useState(initial?.hasMore ?? false);
  const [loading, setLoading] = useState(!initial);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [reportMsg, setReportMsg] = useState<string | null>(null);
  const [reportUser, setReportUser] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteMsg, setDeleteMsg] = useState<Local | null>(null);
  const [replyTo, setReplyTo] = useState<Local | null>(null);
  const attach = useAttachments();
  const fileInput = useRef<HTMLInputElement>(null);

  const jump = (mid: string) => {
    const el = document.getElementById(`msg-${mid}`);
    if (!el) return toast("That message is further back. Load earlier messages to find it.");
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("bg-accent/15");
    setTimeout(() => el.classList.remove("bg-accent/15"), 1400);
  };

  const bottomRef = useRef<HTMLDivElement>(null);
  const lastKey = useRef<string | null>(null);
  const tmp = useRef(0);
  const touched = useRef(new Map<string, number>());
  const clock = useRef(0); // ticks on every local reaction change; a poll that began before a tick must not overwrite it

  const load = useCallback(async () => {
    try {
      const res = await MessageService.open(id);
      setDetail(res.data);
      setMessages((prev) => merge(prev.filter((m) => m.pending || m.failed), res.data.messages));
      setHasMore((h) => h || res.data.hasMore);
      setLoadError(null);
      return true;
    } catch (e) {
      if (isApiError(e) && e.status === 404) setNotFound(true);
      else setLoadError(errorMessage(e));
      return false;
    }
  }, [id]);

  // Initial load.
  useEffect(() => {
    if (!authed) return;
    let live = true;
    setNotFound(false);
    const cached = recallApi<Snapshot>(cacheKey);
    if (cached) {
      setDetail(cached.detail);
      setMessages(cached.messages);
      setHasMore(cached.hasMore);
      setLoading(false);
    } else {
      setLoading(true);
      setMessages([]);
      setHasMore(false);
    }
    void load().then((ok) => {
      if (!live) return;
      setLoading(false);
      if (ok) void refresh(); // server marked it read: refresh the unread badge
    });
    return () => {
      live = false;
    };
  }, [authed, load, refresh, cacheKey]);
  useEffect(() => {
    if (loading || !detail) return;
    const real = messages.filter((m) => !m.pending && !m.failed);
    rememberApi(cacheKey, { detail, messages: real.slice(-60), hasMore: hasMore || real.length > 60 });
  }, [loading, detail, messages, hasMore, cacheKey]);

  // New messages arrive as live pings; polling (8s, or 45s while the live connection is up) is the safety net. It merges, never replaces.
  const { connected, on } = useRealtime();
  useEffect(() => {
    if (!authed || notFound) return;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const startedAt = clock.current;
      try {
        const res = await MessageService.open(id);
        setDetail((d) => (d ? { ...d, conversation: res.data.conversation, canSend: res.data.canSend, cannotSendReason: res.data.cannotSendReason } : res.data));
        // keep reactions you changed after this poll began (it would show the old counts for a moment)
        setMessages((prev) => {
          const keep = new Map(prev.filter((m) => (touched.current.get(m.id) ?? 0) > startedAt).map((m) => [m.id, m.reactions]));
          return merge(prev, res.data.messages.map((m) => (keep.has(m.id) ? { ...m, reactions: keep.get(m.id)! } : m)));
        });
      } catch (e) {
        if (isApiError(e) && e.status === 404) setNotFound(true);
      }
    };
    const off = on((e) => {
      if (e.type === "resync" || (e.type === "dm" && e.conversationId === id)) void tick();
    });
    const t = setInterval(() => void tick(), connected ? 45_000 : 8000);
    return () => {
      off();
      clearInterval(t);
    };
  }, [authed, id, notFound, connected, on]);

  // Scroll to bottom when the newest message changes (not when older ones load).
  const newest = messages.length ? messages[messages.length - 1].id : null;
  useEffect(() => {
    if (newest && newest !== lastKey.current) {
      bottomRef.current?.scrollIntoView({ block: "end", behavior: lastKey.current ? "smooth" : "auto" });
      lastKey.current = newest;
    }
  }, [newest]);

  async function loadEarlier() {
    const oldest = messages.find((m) => !m.pending && !m.failed);
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const res = await MessageService.open(id, oldest.id);
      setMessages((prev) => merge(prev, res.data.messages));
      setHasMore(res.data.hasMore);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setLoadingMore(false);
    }
  }

  async function react(m: Local, kind: ReactionKind) {
    const before = m.reactions;
    const optimistic = applyReaction(before, kind);
    touched.current.set(m.id, ++clock.current);
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, reactions: optimistic } : x)));
    try {
      const res = await MessageService.react(id, m.id, kind);
      touched.current.set(m.id, ++clock.current);
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, reactions: res.data } : x)));
    } catch (e) {
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, reactions: before } : x)));
      toast(errorMessage(e), "error");
    }
  }

  /** Returns an error message on failure; the editor stays open with the text intact. */
  async function saveEdit(m: Local, body: string): Promise<string | null> {
    try {
      const res = await MessageService.edit(id, m.id, body);
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, body: res.data.body, editedAt: res.data.editedAt } : x)));
      setEditingId(null);
      return null;
    } catch (e) {
      return errorMessage(e);
    }
  }

  async function sendSticker(stickerId: string) {
    if (!user) return;
    const tempId = `tmp-${++tmp.current}`;
    setSendError(null);
    setMessages((prev) => merge(prev, [{ id: tempId, conversationId: id, senderId: user.id, body: "", sticker: stickerId, images: [], replyTo: null, reactions: [], createdAt: new Date().toISOString(), mine: true, editedAt: null, deleted: false, pending: true } as Local]));
    try {
      const res = await MessageService.send(id, { body: "", sticker: stickerId });
      setMessages((prev) => merge(prev.filter((m) => m.id !== tempId), [res.data]));
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setSendError(errorMessage(e));
    }
  }

  async function send(retry?: Local) {
    if (retry?.sticker) return sendSticker(retry.sticker);
    const body = (retry?.body ?? draft).trim();
    const images = retry?.images ?? attach.urls;
    if ((!body && !images.length) || !user || attach.uploading) return;
    const reply = retry?.replyTo ?? (replyTo ? { id: replyTo.id, authorName: replyTo.mine ? "You" : detail?.conversation.other.displayName ?? "Them", snippet: replyTo.body.slice(0, 120) || (replyTo.images.length ? "Photo" : "Message"), deleted: false } : null);
    if (body.length > LIMITS.messageBody) {
      setSendError(`Messages can be up to ${LIMITS.messageBody} characters.`);
      return;
    }
    const tempId = retry?.id ?? `tmp-${++tmp.current}`;
    setSendError(null);
    if (!retry) {
      setDraft("");
      attach.clear();
      setReplyTo(null);
    }
    setMessages((prev) => merge(prev.filter((m) => m.id !== tempId), [{ id: tempId, conversationId: id, senderId: user.id, body, sticker: null, images, replyTo: reply, reactions: [], createdAt: new Date().toISOString(), mine: true, editedAt: null, deleted: false, pending: true } as Local]));
    try {
      const res = await MessageService.send(id, { body, images, replyToId: reply?.id });
      setMessages((prev) => merge(prev.filter((m) => m.id !== tempId), [res.data]));
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
      setSendError(errorMessage(e));
    }
  }

  async function toggleBlock() {
    if (!detail) return;
    const { other, blockedByMe } = detail.conversation;
    setBlockBusy(true);
    try {
      if (blockedByMe) await SafetyService.unblock(other.handle);
      else await SafetyService.block(other.handle);
      toast(blockedByMe ? `Unblocked @${other.handle}` : `Blocked @${other.handle}`, "success");
      setBlockOpen(false);
      await load();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBlockBusy(false);
    }
  }

  if (status === "loading") return <div className="p-6"><Skeleton className="h-96 w-full rounded-card" /></div>;
  if (!authed) {
    return (
      <div className="p-6">
        <EmptyState icon="message" title="Sign in to read this conversation" action={<Button variant="primary" onClick={() => requireAuth()}>Sign in</Button>} />
      </div>
    );
  }
  if (notFound) {
    return (
      <div className="p-6">
        <EmptyState icon="message" title="Conversation not found" action={<Button href="/messages">Back to messages</Button>}>
          It may not exist, or it isn&apos;t one of yours.
        </EmptyState>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="space-y-4 p-6" aria-busy="true">
        <Skeleton className="h-14 w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    );
  }
  if (loadError && !detail) return <div className="p-6"><ErrorState message={loadError} onRetry={() => void load()} /></div>;
  if (!detail) return null;

  const { other, blockedByMe } = detail.conversation;
  let lastDay = "";

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col" aria-label={`Conversation with ${other.displayName}`}>
      <header className="flex min-h-14 items-center gap-3 border-b border-line px-3 sm:px-5">
        <Link href="/messages" aria-label="Back to messages" className="inline-flex size-9 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink lg:hidden">
          <Icon name="arrow-left" size={18} />
        </Link>
        <ProfileTrigger handle={other.handle} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Avatar name={other.displayName} src={other.avatarUrl} frame={other.avatarFrame} size={40} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold"><UserName name={other.displayName} effect={other.nameEffect} /></span>
            <span className="block truncate font-mono text-[11px] text-ink-muted">@{other.handle}</span>
          </span>
        </ProfileTrigger>
        <OverflowMenu
          label="Conversation options"
          items={[
            { label: blockedByMe ? "Unblock" : "Block", icon: "ban", danger: !blockedByMe, onSelect: () => setBlockOpen(true) },
            { label: "Report user", icon: "flag", danger: true, onSelect: () => setReportUser(true) },
          ]}
        />
        <button type="button" onClick={() => setInfoOpen(true)} aria-label="About this person" className="inline-flex size-9 items-center justify-center rounded-full text-ink hover:bg-raised xl:hidden">
          <Icon name="info" size={19} />
        </button>
      </header>

      <div className="kq-calm min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
        {hasMore && (
          <div className="mb-3 flex justify-center">
            <Button size="sm" onClick={() => void loadEarlier()} loading={loadingMore}>
              Load earlier
            </Button>
          </div>
        )}
        {messages.length === 0 && <p className="py-10 text-center text-sm text-ink-muted">No messages yet. Say hi to {other.displayName}.</p>}
        {messages.map((m) => {
          const day = formatDateLong(m.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id} className="kq-live">
              {showDay && <p className="eyebrow my-4 text-center">{day}</p>}
              <div className={cx("group flex items-end gap-1.5", m.mine ? "flex-row-reverse" : "flex-row")}>
                <div className={cx("flex max-w-[80%] flex-col", m.mine ? "items-end" : "items-start")}>
                  {m.deleted ? (
                    <div className="rounded-2xl border border-dashed border-line px-3.5 py-2 text-sm text-ink-muted italic">Message deleted</div>
                  ) : editingId === m.id ? (
                    <MessageEditor className="w-[min(32rem,80vw)]" initial={m.body} onCancel={() => setEditingId(null)} onSave={(body) => saveEdit(m, body)} />
                  ) : m.sticker ? (
                    <div className={cx("px-1", m.pending && "opacity-60")}>
                      <StickerView id={m.sticker} size={84} />
                      <span className="block text-right font-mono text-[10px] text-ink-muted">{m.failed ? "Not sent" : m.pending ? "Sending…" : formatTime(m.createdAt)}</span>
                    </div>
                  ) : (
                    <div id={`msg-${m.id}`} className={cx("rounded-2xl px-3.5 py-2 text-[15px] break-words whitespace-pre-wrap transition-colors", m.mine ? "rounded-br-md bg-accent text-accent-ink" : "rounded-bl-md border border-line bg-surface text-ink", m.pending && "opacity-60")}>
                      {m.replyTo && <ReplyQuote reply={m.replyTo} onJump={jump} className={cx("whitespace-normal", m.mine ? "!text-accent-ink/80 [&_span]:!text-accent-ink/80" : "")} />}
                      {m.body}
                      <ChatImages images={m.images ?? []} className={m.body ? "mt-1.5" : ""} />
                      <span className={cx("mt-0.5 flex items-baseline justify-end gap-1.5 font-mono text-[10px]", m.mine ? "text-accent-ink/70" : "text-ink-muted")}>
                        {m.editedAt && <EditedTag at={m.editedAt} />}
                        {m.failed ? "Not sent" : m.pending ? "Sending…" : formatTime(m.createdAt)}
                      </span>
                    </div>
                  )}
                  {!m.pending && !m.failed && !m.deleted && editingId !== m.id && <ReactionBar reactions={m.reactions ?? []} canReact={detail.canSend} onToggle={(k) => void react(m, k)} mine={m.mine} />}
                </div>
                {!m.pending && !m.failed && !m.deleted && editingId !== m.id && detail.canSend && <ReactButton onPick={(k) => void react(m, k)} align={m.mine ? "right" : "left"} className="opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100" />}
                {m.failed && (
                  <button type="button" onClick={() => void send(m)} className="text-xs font-medium text-danger underline underline-offset-2">
                    Retry
                  </button>
                )}
                {m.mine && !m.pending && !m.failed && !m.deleted && editingId !== m.id && (
                  <OverflowMenu
                    label="Message options"
                    className="opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100 [&>button]:size-8 [&>button]:border-transparent [&>button]:bg-transparent"
                    align="right"
                    items={[
                      ...(detail.canSend ? [{ label: "Reply", icon: "reply" as const, onSelect: () => setReplyTo(m) }] : []),
                      ...(m.sticker ? [] : [{ label: "Edit message", icon: "edit" as const, onSelect: () => setEditingId(m.id) }]),
                      { label: "Delete message", icon: "trash" as const, danger: true, onSelect: () => setDeleteMsg(m) },
                    ]}
                  />
                )}
                {!m.mine && !m.pending && !m.deleted && <OverflowMenu label="Message options" className="opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100 [&>button]:size-8 [&>button]:border-transparent [&>button]:bg-transparent" align="left" items={[...(detail.canSend ? [{ label: "Reply", icon: "reply" as const, onSelect: () => setReplyTo(m) }] : []), { label: "Report message", icon: "flag" as const, danger: true, onSelect: () => setReportMsg(m.id) }]} />}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-line bg-canvas px-4 py-3 sm:px-6">
        {detail.canSend ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            {replyTo && <ReplyingTo name={replyTo.mine ? "yourself" : other.displayName} snippet={replyTo.body.slice(0, 80) || "Photo"} onCancel={() => setReplyTo(null)} />}
            <AttachmentStrip urls={attach.urls} progress={attach.progress} error={attach.error} onRemove={attach.remove} />
            <div className="flex items-end gap-2">
            {attach.enabled && (
              <>
                <input ref={fileInput} type="file" hidden multiple accept=".jpg,.jpeg,.png,.webp,.gif,.avif,.heic,.heif" onChange={(e) => (void attach.add(e.target.files), (e.target.value = ""))} aria-label="Choose pictures" />
                <button type="button" onClick={() => fileInput.current?.click()} disabled={attach.full || attach.uploading} aria-label="Add pictures" title="Add pictures" className="inline-flex size-11 items-center justify-center rounded-full text-ink-muted transition hover:bg-raised hover:text-ink disabled:opacity-40">
                  <Icon name="image" size={21} />
                </button>
              </>
            )}
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
                if (files.length && attach.enabled) {
                  e.preventDefault();
                  void attach.add(files);
                }
              }}
              rows={1}
              maxLength={LIMITS.messageBody}
              placeholder={`Message ${other.displayName}`}
              aria-label="Message"
              className="max-h-40 min-h-11 flex-1 resize-none rounded-control border border-line bg-raised px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-muted/70 focus:border-accent-text"
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
            <span className="relative">
              <button type="button" onClick={() => setStickerOpen((o) => !o)} aria-label="Stickers" aria-expanded={stickerOpen} title="Stickers" className="inline-flex size-11 items-center justify-center rounded-full text-ink-muted transition hover:bg-raised hover:text-ink">
                <Icon name="sticker" size={21} />
              </button>
              {stickerOpen && <StickerPicker onPick={(sid) => void sendSticker(sid)} onClose={() => setStickerOpen(false)} className="absolute right-0 bottom-full mb-2" />}
            </span>
            <Button type="submit" variant="primary" disabled={(!draft.trim() && !attach.urls.length) || attach.uploading} aria-label="Send" className="size-11 px-0">
              <Icon name="send" size={18} />
            </Button>
            </div>
          </form>
        ) : (
          <p className="flex items-start gap-2 rounded-control border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
            <Icon name="lock" size={15} className="mt-0.5 shrink-0" /> {detail.cannotSendReason ?? "You can't send messages in this conversation."}
          </p>
        )}
        {sendError && (
          <p role="alert" className="mt-2 text-sm font-medium text-danger">
            {sendError}
          </p>
        )}
      </div>

      </section>

      <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-line xl:block" aria-label="About this person">
        <ConversationInfo handle={other.handle} blockedByMe={blockedByMe} onBlock={() => setBlockOpen(true)} onReport={() => setReportUser(true)} />
      </aside>
      <SlideOver open={infoOpen} onClose={() => setInfoOpen(false)} side="right" title="About this person">
        <ConversationInfo handle={other.handle} blockedByMe={blockedByMe} onBlock={() => { setInfoOpen(false); setBlockOpen(true); }} onReport={() => { setInfoOpen(false); setReportUser(true); }} onNavigate={() => setInfoOpen(false)} />
      </SlideOver>

      <Modal open={blockOpen} onClose={() => setBlockOpen(false)} size="sm" title={blockedByMe ? `Unblock @${other.handle}?` : `Block @${other.handle}?`} description={blockedByMe ? "You'll be able to message each other again." : "You won't be able to message each other. You can unblock them any time."}>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setBlockOpen(false)}>Cancel</Button>
          <Button variant={blockedByMe ? "primary" : "danger"} loading={blockBusy} onClick={() => void toggleBlock()}>
            {blockedByMe ? "Unblock" : "Block"}
          </Button>
        </div>
      </Modal>
      <ConfirmModal
        open={!!deleteMsg}
        onClose={() => setDeleteMsg(null)}
        title="Delete this message?"
        description={`It disappears for you and ${other.displayName}. This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleteMsg) return;
          await MessageService.remove(id, deleteMsg.id);
          setMessages((prev) => prev.map((x) => (x.id === deleteMsg.id ? { ...x, body: "", sticker: null, images: [], replyTo: null, deleted: true } : x)));
        }}
      />
      <ReportDialog open={reportUser} onClose={() => setReportUser(false)} targetType="user" targetId={other.id} subject={`@${other.handle}`} />
      <ReportDialog open={reportMsg !== null} onClose={() => setReportMsg(null)} targetType="message" targetId={reportMsg ?? ""} subject="this message" />
    </div>
  );
}
