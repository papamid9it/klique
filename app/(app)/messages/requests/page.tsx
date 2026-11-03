"use client";

import Link from "next/link";
import { MessageService } from "@/app/services/MessageService";
import { RequestActions } from "@/components/domain/messages/RequestActions";
import { useAuth } from "@/components/providers/AuthProvider";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { Avatar } from "@/components/ui/Avatar";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { relativeStamp } from "@/lib/format";
import { useApi, useNow } from "@/lib/hooks/useApi";

/**
 * Messages → Requests (Instagram style): people you don't chat with freely sent you one message each. Open it to read
 * it in full, Accept to chat, or Delete / Block (they aren't told). "Who can message me" is in Settings, Privacy.
 */
export default function MessageRequestsPage() {
  const { status } = useAuth();
  const now = useNow();
  const { data, loading, error, reload, setData } = useApi(status === "authed" ? () => MessageService.requests() : null, [status], { key: "dm-requests" });
  useRealtimeEvent(() => void reload(), { filter: (e) => e.type === "dm", debounceMs: 500 });

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-8">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">Message requests</h1>
        <p className="mt-1 text-sm text-ink-muted">
          From people you don&apos;t chat with yet. They can&apos;t send more until you accept, and they won&apos;t know if you delete it. Change who can message you in{" "}
          <Link href="/settings#privacy" className="font-medium text-accent-text hover:underline">
            Settings, Privacy
          </Link>
          .
        </p>
      </header>
      {loading && !data ? (
        <RowSkeleton rows={3} />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState icon="message" title="No requests">
          When someone you don&apos;t chat with sends you a message, it waits here.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {data.map((c) => (
            <li key={c.id} className="rounded-card border border-line bg-surface p-4">
              <Link href={`/messages/${c.id}`} className="flex items-start gap-3">
                <Avatar name={c.other.displayName} src={c.other.avatarUrl} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold">{c.other.displayName}</span>
                    <span className="font-mono text-xs text-ink-muted">@{c.other.handle}</span>
                    <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-muted">{c.lastMessage && now ? relativeStamp(c.lastMessage.createdAt, now) : ""}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-sm text-ink/90">{c.lastMessage?.body}</span>
                </span>
              </Link>
              <div className="mt-3">
                <RequestActions id={c.id} name={c.other.displayName} compact onDone={() => setData((list) => (list ? list.filter((x) => x.id !== c.id) : list))} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
