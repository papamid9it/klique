"use client";

import { useSearchParams } from "next/navigation";

import ApiClient, { errorMessage } from "@/app/ApiCore";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { relativeStamp } from "@/lib/format";
import { useApi, useNow } from "@/lib/hooks/useApi";
import type { ChannelDTO, Envelope, ThreadDTO } from "@/lib/types";
import { ChatPane } from "./ChatPane";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { useState } from "react";
import { ChannelService } from "@/app/services/ChannelService";
import { dropThreadDraft, threadDraft, type ThreadDraft } from "@/app/services/threadStart";
import { EmojiText } from "@/components/ui/CustomEmoji";

const api = new ApiClient();

/**
 * A thread, in the side panel: its own chat (replies, mentions, reactions, typing: all as in a channel), with the
 * channel it hangs off. A new one opens at once as a draft and is made with its first reply. Archived threads
 * (7 quiet days) open again with a reply.
 */
export function ThreadSide({ slug, threadSlug, isMember, gate, onClose }: { slug: string; threadSlug: string; isMember: boolean; gate: React.ReactNode; onClose: () => void }) {
  // from a notification: ?m=<message id> opens on that message
  const focus = useSearchParams().get("m");
  const draft = threadDraft(threadSlug);
  const [made, setMade] = useState<ChannelDTO | null>(null);
  // a thread that already exists: the last copy shows straight away (useApi's cache), then it refreshes
  const { data, loading, error, reload } = useApi(!draft && !made ? () => api.get<Envelope<ChannelDTO>>(`/api/communities/${slug}/threads/${threadSlug}`) : null, [slug, threadSlug, !!draft, !!made], { key: `thread:${slug}:${threadSlug}` });
  const thread = made ?? data;
  const close = () => {
    dropThreadDraft(threadSlug);
    onClose();
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3">
        <Icon name="message" size={17} className="shrink-0 text-ink-muted" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{thread?.name ?? (draft ? "New thread" : "Thread")}</p>
          {thread?.thread ? (
            <p className="truncate text-xs text-ink-muted">
              in #{thread.thread.parentName}
              {thread.thread.archived ? " · archived (a reply opens it again)" : ""}
            </p>
          ) : draft ? (
            <p className="truncate text-xs text-ink-muted">in #{draft.channelSlug} · it starts with your first reply</p>
          ) : null}
        </div>
        <button type="button" onClick={close} aria-label="Close thread" className="inline-flex size-9 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink">
          <Icon name="x" size={17} />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        {thread ? (
          <ChatPane focus={focus} key={thread.slug} space={{ slug }} channel={thread} isMember={isMember} gate={gate} onRead={() => undefined} placeholder="Reply in the thread" />
        ) : draft ? (
          <DraftThread
            draft={draft}
            onMade={(t) => {
              dropThreadDraft(threadSlug);
              setMade(t);
            }}
          />
        ) : loading && !data ? (
          <Skeleton className="m-4 h-40" />
        ) : (
          <ErrorState message={error ?? "We couldn't find that thread."} onRetry={reload} />
        )}
      </div>
    </div>
  );
}

/** A thread that doesn't exist yet: the message it hangs off, a name, and the first reply. Sending makes it. */
function DraftThread({ draft, onMade }: { draft: ThreadDraft; onMade: (t: ChannelDTO) => void }) {
  const toast = useToast();
  const [name, setName] = useState(() => (draft.body.replace(/<:([a-z0-9_]+):[a-f0-9]{24}>/g, ":$1:").replace(/\s+/g, " ").trim() || "Thread").slice(0, 40));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const res = await ChannelService.startThread(draft.space, draft.channelSlug, draft.messageId, body, name.trim() || undefined);
      onMade(res.data);
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(false);
    }
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <blockquote className="rounded-control border-l-2 border-accent-text bg-raised/60 px-3 py-2 text-sm">
          <span className="block text-xs font-semibold text-ink-muted">{draft.author}</span>
          <span className="line-clamp-4 whitespace-pre-wrap">{draft.body ? <EmojiText text={draft.body} /> : "A message"}</span>
        </blockquote>
        <label className="mt-4 block text-[13px] font-medium" htmlFor="thread-name">
          Thread name
        </label>
        <input id="thread-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="mt-1 h-10 w-full rounded-control border border-line bg-raised px-3 text-sm" />
      </div>
      <form
        className="flex items-end gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Write the first reply"
          aria-label="First reply"
          className="max-h-40 min-h-10 flex-1 resize-none rounded-control border border-line bg-raised px-3 py-2 text-[15px]"
        />
        <Button type="submit" variant="primary" loading={busy} disabled={!text.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}

/** A channel's threads: active first, then archived. */
export function ThreadsModal({ slug, channel, onOpen, onClose }: { slug: string; channel: { slug: string; name: string }; onOpen: (threadSlug: string) => void; onClose: () => void }) {
  const now = useNow();
  const { data, loading, error, reload } = useApi(() => api.get<Envelope<ThreadDTO[]>>(`/api/communities/${slug}/channels/${channel.slug}/threads`), [slug, channel.slug], { key: `threads:${slug}:${channel.slug}` });
  // new threads and replies show up while it's open
  useRealtimeEvent(() => void reload(), { filter: (e) => e.type === "channel", debounceMs: 600 });
  return (
    <Modal open onClose={onClose} title={`Threads in #${channel.name}`} description="Start one from any message: hover it (or press and hold) and pick Start thread." size="md">
      {loading && !data ? (
        <Skeleton className="h-40 w-full" />
      ) : error || !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data.length ? (
        <EmptyState icon="message" title="No threads yet" compact />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
          {data.map((t, i) => (
            <li key={t.slug}>
              {t.archived && (i === 0 || !data[i - 1].archived) && <p className="eyebrow bg-raised px-4 py-1.5">Archived</p>}
              <button type="button" onClick={() => onOpen(t.slug)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-raised">
                <Icon name="message" size={16} className="shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{t.name}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {t.count} {t.count === 1 ? "reply" : "replies"}
                    {t.lastAt && now ? ` · last ${relativeStamp(t.lastAt, now)}` : ""}
                    {t.startedBy ? ` · started by ${t.startedBy.displayName}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex justify-end">
        <Button onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}
