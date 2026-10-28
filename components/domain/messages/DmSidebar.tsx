"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FriendService } from "@/app/services/FriendService";
import { MessageService } from "@/app/services/MessageService";
import { useAuth } from "@/components/providers/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ConversationListSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { cx } from "@/components/ui/cx";
import { relativeStamp } from "@/lib/format";
import { useRealtime, useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { useApi, useNow } from "@/lib/hooks/useApi";
import { stickerOf } from "@/lib/reactions";
import { UserName } from "@/components/ui/UserName";

/** Left pane of Messages: Friends, Friend requests, then everyone you're chatting with. */
export function DmSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { status, requireAuth } = useAuth();
  const authed = status === "authed";
  const pathname = usePathname();
  const router = useRouter();
  const now = useNow();
  const [q, setQ] = useState("");
  const { connected } = useRealtime();
  const inbox = useApi(authed ? () => MessageService.inbox() : null, [authed], { key: "dm-inbox" });
  const summary = useApi(authed ? () => FriendService.summary() : null, [authed], { key: "friends-summary" });
  // a friend request or an accept: the counts update by themselves
  useRealtimeEvent(() => void summary.reload(), { filter: (e) => e.type === "notify" && e.category === "friends", debounceMs: 400 });

  const reloadInbox = inbox.reload;
  const reloadSummary = summary.reload;
  useEffect(() => {
    if (!authed) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void reloadInbox();
      void reloadSummary();
    };
    const t = setInterval(tick, connected ? 90_000 : 20_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [authed, reloadInbox, reloadSummary, connected]);
  // a new message anywhere: refresh the inbox right away
  useRealtimeEvent(() => void reloadInbox(), { filter: (e) => e.type === "dm", debounceMs: 400 });

  const activeId = /^\/messages\/([a-f0-9]{24})/.exec(pathname)?.[1] ?? null;
  const onFriends = pathname.startsWith("/messages/friends");
  const tab = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("tab");

  const rows = useMemo(() => {
    const list = inbox.data ?? [];
    const needle = q.trim().toLowerCase();
    return needle ? list.filter((c) => c.other.displayName.toLowerCase().includes(needle) || c.other.handle.includes(needle)) : list;
  }, [inbox.data, q]);

  const incoming = summary.data?.incoming ?? 0;
  const nav: { href: string; label: string; icon: IconName; active: boolean; badge?: number }[] = [
    { href: "/messages/friends", label: "Friends", icon: "users", active: onFriends && tab !== "pending" && tab !== "add" },
    { href: "/messages/friends?tab=pending", label: "Friend requests", icon: "userplus", active: onFriends && tab === "pending", badge: incoming },
  ];

  if (status === "loading") {
    return (
      <div aria-busy="true">
        <div className="space-y-2 p-3 pb-1">
          <Skeleton className="h-9" />
          <Skeleton className="h-8 opacity-70" />
          <Skeleton className="h-8 opacity-70" />
        </div>
        <ConversationListSkeleton rows={5} />
      </div>
    );
  }
  if (!authed) {
    return (
      <div className="p-5 text-center">
        <p className="text-sm text-ink-muted">Sign in to chat with people and manage your friends.</p>
        <Button variant="primary" className="mt-3" onClick={() => requireAuth()}>
          Sign in
        </Button>
      </div>
    );
  }

  return (
    <nav aria-label="Messages" className="flex h-full flex-col">
      <div className="border-b border-line p-3">
        <label htmlFor="dm-find" className="sr-only">
          Find a conversation
        </label>
        <div className="flex h-9 items-center gap-2 rounded-control bg-raised px-3 focus-within:ring-1 focus-within:ring-accent-text">
          <Icon name="search" size={14} className="shrink-0 text-ink-muted" />
          <input
            id="dm-find"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && q.trim() && !rows.length) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
            }}
            placeholder="Find or start a conversation"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-muted/80 focus:outline-none"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <ul className="space-y-0.5">
          {nav.map((n) => (
            <li key={n.label}>
              <Link href={n.href} onClick={onNavigate} aria-current={n.active ? "page" : undefined} className={cx("flex h-10 items-center gap-3 rounded-control px-2.5 text-[14px] font-medium transition", n.active ? "bg-raised text-ink" : "text-ink-muted hover:bg-raised/60 hover:text-ink")}>
                <Icon name={n.icon} size={18} />
                {n.label}
                {!!n.badge && (
                  <span className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1.5 text-[11px] leading-none font-bold text-white" aria-label={`${n.badge} waiting`}>
                    {n.badge > 99 ? "99+" : n.badge}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-4 mb-1 flex items-center justify-between px-2.5">
          <h2 className="text-[11px] font-bold tracking-[0.08em] text-ink-muted uppercase">Direct messages</h2>
          <Link href="/search" onClick={onNavigate} aria-label="Find people to message" title="Find people" className="inline-flex size-6 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink">
            <Icon name="plus" size={14} />
          </Link>
        </div>

        {inbox.loading ? (
          <div className="space-y-2 px-1" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 px-1.5 py-1">
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2.5 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : !rows.length ? (
          <p className="px-2.5 py-3 text-[13px] text-ink-muted">{q ? "No one matches. Press Enter to search people." : "No conversations yet. Message a friend or find people from a community."}</p>
        ) : (
          <ul className="space-y-0.5">
            {rows.map((c) => {
              const unread = c.unreadCount > 0;
              const active = c.id === activeId;
              const sticker = c.lastMessage?.sticker ? stickerOf(c.lastMessage.sticker) : null;
              const preview = c.lastMessage ? `${c.lastMessage.mine ? "You: " : ""}${sticker ? `${sticker.emoji} Sticker` : c.lastMessage.body}` : "No messages yet";
              return (
                <li key={c.id}>
                  <Link href={`/messages/${c.id}`} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cx("flex items-center gap-3 rounded-control px-2.5 py-1.5 transition", active ? "bg-raised" : "hover:bg-raised/60")}>
                    <Avatar name={c.other.displayName} src={c.other.avatarUrl} frame={c.other.avatarFrame} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={cx("truncate text-[14px]", unread || active ? "font-semibold text-ink" : "font-medium text-ink-muted")}><UserName name={c.other.displayName} effect={c.other.nameEffect} /></span>
                        <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-muted">{c.lastMessage && now ? relativeStamp(c.lastMessage.createdAt, now) : ""}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={cx("truncate text-[12px]", unread ? "font-medium text-ink" : "text-ink-muted")}>{c.blockedByMe ? "Blocked" : preview}</span>
                        {unread && !active && (
                          <span className="ml-auto inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] leading-none font-bold text-accent-ink" aria-label={`${c.unreadCount} unread`}>
                            {c.unreadCount > 99 ? "99+" : c.unreadCount}
                          </span>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </nav>
  );
}
