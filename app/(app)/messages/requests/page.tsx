"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessageService } from "@/app/services/MessageService";
import { RequestActions } from "@/components/domain/messages/RequestActions";
import { useAuth } from "@/components/providers/AuthProvider";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { formatDateShort, relativeStamp } from "@/lib/format";
import { useApi, useNow } from "@/lib/hooks/useApi";
import { cityName } from "@/lib/places";
import type { ConversationDTO } from "@/lib/types";

/**
 * Messages → Requests (Instagram style): people you don't chat with freely sent you one message each. On a wide screen
 * it's an inbox: the requests on the left, the one you picked on the right (who they are, what they said, and Accept,
 * Delete or Block). On a phone-sized screen, a list that opens each one. Delete and Block are quiet: they aren't told.
 * "Who can message me" is in Settings, Privacy.
 */
export default function MessageRequestsPage() {
  const { status } = useAuth();
  const router = useRouter();
  const now = useNow();
  const { data, loading, error, reload, setData } = useApi(status === "authed" ? () => MessageService.requests() : null, [status], { key: "dm-requests" });
  useRealtimeEvent(() => void reload(), { filter: (e) => e.type === "dm", debounceMs: 500 });
  const [pickedId, setPickedId] = useState<string | null>(null);
  const list = data ?? [];
  const picked = list.find((c) => c.id === pickedId) ?? list[0] ?? null;

  const done = (c: ConversationDTO, action: "accept" | "delete" | "block") => {
    if (action === "accept") return router.push(`/messages/${c.id}`);
    setData((l) => (l ? l.filter((x) => x.id !== c.id) : l));
    setPickedId(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-4 sm:px-6">
        <span className="flex size-10 items-center justify-center rounded-full bg-raised text-ink-muted"><Icon name="message" size={18} /></span>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-[-0.02em]">
            Message requests{list.length ? <span className="ml-2 font-mono text-sm text-ink-muted">{list.length}</span> : null}
          </h1>
          <p className="text-sm text-ink-muted">
            People you don&apos;t chat with yet. They can&apos;t send more until you accept.{" "}
            <Link href="/settings#privacy" className="font-medium text-ink hover:underline">Who can message you</Link>
          </p>
        </div>
      </header>

      {loading && !data ? (
        <div className="p-6"><RowSkeleton rows={3} /></div>
      ) : error && !data ? (
        <div className="p-6"><ErrorState message={error} onRetry={reload} /></div>
      ) : !list.length ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState icon="message" title="No requests">
            When someone you don&apos;t chat with sends you a message, it waits here.
          </EmptyState>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
          {/* the requests */}
          <ul aria-label="Requests" className="min-h-0 overflow-y-auto border-line p-2 lg:border-r">
            {list.map((c) => {
              const on = picked?.id === c.id;
              const row = (
                <>
                  <Avatar name={c.other.displayName} src={c.other.avatarUrl} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate font-semibold">{c.other.displayName}</span>
                      <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-muted">{c.lastMessage && now ? relativeStamp(c.lastMessage.createdAt, now) : ""}</span>
                    </span>
                    <span className="block truncate text-sm text-ink-muted">{c.lastMessage?.body || "Sent you a message"}</span>
                  </span>
                </>
              );
              const cls = cx("flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left transition", on ? "lg:bg-raised" : "hover:bg-raised/60");
              return (
                <li key={c.id}>
                  {/* phone-sized: open the chat; wide: show it on the right */}
                  <Link href={`/messages/${c.id}`} className={cx(cls, "lg:hidden")}>{row}</Link>
                  <button type="button" aria-current={on ? "true" : undefined} onClick={() => setPickedId(c.id)} className={cx(cls, "hidden lg:flex")}>{row}</button>
                </li>
              );
            })}
          </ul>

          {/* the one you picked */}
          {picked && (
            <section aria-label={`Request from ${picked.other.displayName}`} className="hidden min-h-0 flex-col lg:flex">
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-8">
                <div className="flex flex-col items-center text-center">
                  <Avatar name={picked.other.displayName} src={picked.other.avatarUrl} size={88} />
                  <h2 className="mt-3 text-xl font-semibold">{picked.other.displayName}</h2>
                  <p className="font-mono text-sm text-ink-muted">@{picked.other.handle}</p>
                  {picked.other.city && <p className="mt-1 text-sm text-ink-muted">{cityName(picked.other.country, picked.other.city)}</p>}
                  <Link href={`/?profile=${picked.other.handle}`} className="mt-3 inline-flex h-9 items-center rounded-full border border-line px-4 text-sm font-semibold hover:bg-raised">View profile</Link>
                  <p className="mt-4 text-xs text-ink-muted">You&apos;re not friends. Only accept if you know them or want to chat.</p>
                </div>

                <div className="mt-8">
                  {picked.lastMessage && <p className="mb-2 text-center font-mono text-[11px] text-ink-muted">{formatDateShort(picked.lastMessage.createdAt)}</p>}
                  <div className="flex items-end gap-2">
                    <Avatar name={picked.other.displayName} src={picked.other.avatarUrl} size={28} />
                    <p className="max-w-[70%] rounded-[18px] rounded-bl-[6px] bg-raised px-4 py-2.5 text-[15px] leading-6 break-words whitespace-pre-wrap">{picked.lastMessage?.body || "Sent you a message"}</p>
                  </div>
                </div>
              </div>

              <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line px-8 py-4">
                <p className="text-sm text-ink-muted">Accept to reply. They won&apos;t know if you delete it.</p>
                <RequestActions key={picked.id} id={picked.id} name={picked.other.displayName} compact onDone={(a) => done(picked, a)} />
              </footer>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
