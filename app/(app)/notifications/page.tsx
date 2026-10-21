"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { InboxService } from "@/app/services/InboxService";
import { PanelLayout } from "@/components/layout/PanelLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { relativeStamp } from "@/lib/format";
import { useApi, useNow } from "@/lib/hooks/useApi";
import { isSamePage, softNavigate } from "@/lib/nav";
import { NOTIFY_CATEGORIES } from "@/lib/notifications";
import type { NotificationDTO } from "@/lib/types";

const ICON: Record<string, IconName> = { mentions: "message", replies: "topics", crews: "pin", admin: "shield", community: "users", events: "calendar", ads: "megaphone", points: "coin", friends: "userplus", messages: "message" };
const SHORT: Record<string, string> = { mentions: "Mentions & replies", replies: "Topic comments", crews: "Crews", admin: "Communities you run", community: "Your communities", events: "Events", ads: "Your ads", points: "Rank & points", friends: "Friends" };
const FILTERS = [{ id: "all", label: "All", icon: "bell" as IconName }, { id: "unread", label: "Unread", icon: "asterisk" as IconName }, ...NOTIFY_CATEGORIES.filter((c) => !("pushOnly" in c)).map((c) => ({ id: c.id as string, label: SHORT[c.id] ?? c.label, icon: ICON[c.id] ?? "bell" }))];

/** Today / Yesterday / This week / Earlier, in Lagos time. */
function bucketOf(iso: string, now: Date): string {
  const lagos = (d: Date) => new Date(d.toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
  const a = lagos(new Date(iso));
  const b = lagos(now);
  const days = Math.floor((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : days < 7 ? "This week" : "Earlier";
}

/**
 * Notifications, with their own left panel: filter by kind (with unread counts), unread only, settings.
 * New ones arrive by themselves; opening one marks it read.
 */
function NotificationsContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const { status, requireAuth, user, setUser } = useAuth();
  const authed = status === "authed";
  const now = useNow();
  const filter = sp.get("f") ?? "all";
  const q = filter === "all" ? {} : filter === "unread" ? { unread: true } : { category: filter };
  // switching filters keeps the current list up (slightly faded) until the new one arrives: no blank flash
  const { data, loading, refreshing, error, reload, setData } = useApi(authed ? () => InboxService.list(q) : null, [authed, filter], { key: `inbox:${filter}`, keepPrevious: true });
  const [more, setMore] = useState<NotificationDTO[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (status === "anon") requireAuth();
  }, [status, requireAuth]);
  useEffect(() => setMore([]), [filter]);
  // something new arrived, or was read in another tab: show it
  useRealtimeEvent(() => void reload(), { filter: (e) => e.type === "notify" && e.inbox, debounceMs: 300 });

  const items = [...(data?.items ?? []), ...more];
  const unreadBy = data?.unreadBy ?? {};
  const unread = data?.unread ?? 0;
  const setBadge = (n: number) => user && setUser({ ...user, unreadNotifications: n });
  const go = (f: string) => softNavigate(f === "all" ? "/notifications" : `/notifications?f=${f}`);

  async function open(n: NotificationDTO) {
    if (!n.read) {
      const markRead = (x: NotificationDTO) => (x.id === n.id ? { ...x, read: true } : x);
      setData((d) => (d ? { ...d, items: d.items.map(markRead), unread: Math.max(0, d.unread - 1), unreadBy: { ...d.unreadBy, [n.category]: Math.max(0, (d.unreadBy[n.category] ?? 1) - 1) } } : d));
      setMore((m) => m.map(markRead));
      setBadge(Math.max(0, unread - 1));
      void InboxService.markRead({ ids: [n.id] }).catch(() => {});
    }
    if (isSamePage(n.href)) softNavigate(n.href);
    else router.push(n.href);
  }

  async function readAll() {
    setData((d) => (d ? { ...d, items: d.items.map((x) => ({ ...x, read: true })), unread: 0, unreadBy: {} } : d));
    setMore((m) => m.map((x) => ({ ...x, read: true })));
    setBadge(0);
    await InboxService.markRead({ all: true }).catch(() => {});
  }

  async function loadMore() {
    const last = items[items.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const res = await InboxService.list({ ...q, before: last.updatedAt });
      setMore((m) => [...m, ...res.data.items]);
      setData((d) => (d ? { ...d, hasMore: res.data.hasMore } : d));
    } finally {
      setLoadingMore(false);
    }
  }

  const countOf = (id: string) => (id === "all" || id === "unread" ? unread : (unreadBy[id] ?? 0));

  const panel = (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between px-1 pt-1">
        <p className="text-[15px] font-semibold tracking-[-0.01em]">Notifications</p>
        <Link href="/settings#notifications" aria-label="Notification settings" title="Notification settings" className="inline-flex size-8 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink">
          <Icon name="sliders" size={16} />
        </Link>
      </div>
      <nav aria-label="Filter notifications">
        <ul className="space-y-0.5">
          {FILTERS.map((f) => {
            const on = filter === f.id;
            const n = countOf(f.id);
            return (
              <li key={f.id}>
                <button type="button" onClick={() => go(f.id)} aria-current={on ? "page" : undefined} className={cx("flex h-10 w-full items-center gap-3 rounded-control px-3 text-left text-[14px] font-medium transition", on ? "bg-raised text-ink" : "text-ink-muted hover:bg-raised/60 hover:text-ink")}>
                  <Icon name={f.icon} size={16} />
                  <span className="flex-1 truncate">{f.label}</span>
                  {n > 0 && <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-ink">{n > 99 ? "99+" : n}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <p className="mt-auto px-1 text-xs text-ink-muted">Only things addressed to you or waiting on you. Similar ones bundle into one line. Channel chat shows as unread counts instead.</p>
    </div>
  );

  const mobile = (
    <div className="no-bar flex gap-1.5 overflow-x-auto">
      {FILTERS.map((f) => {
        const n = countOf(f.id);
        return (
          <button key={f.id} type="button" onClick={() => go(f.id)} className={cx("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold", filter === f.id ? "border-transparent bg-accent text-accent-ink" : "border-line bg-surface text-ink-muted")}>
            {f.label}
            {n > 0 && <span className="font-mono text-[11px]">{n}</span>}
          </button>
        );
      })}
    </div>
  );

  // grouped by when they last changed
  const groups: { label: string; items: NotificationDTO[] }[] = [];
  for (const n of items) {
    const label = now ? bucketOf(n.updatedAt, now) : "Earlier";
    const g = groups.find((x) => x.label === label);
    if (g) g.items.push(n);
    else groups.push({ label, items: [n] });
  }
  const title = FILTERS.find((f) => f.id === filter)?.label ?? "All";

  return (
    <PanelLayout panel={panel} mobile={mobile}>
      <div className="mx-auto max-w-3xl">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow mb-1.5">Notifications</p>
            <h1 className="text-[clamp(1.6rem,3vw,2.1rem)] font-bold tracking-[-0.03em]">{filter === "all" ? "Everything" : title}</h1>
          </div>
          <Button size="sm" onClick={() => void readAll()} disabled={!unread}>
            <Icon name="check" size={14} /> Mark all read
          </Button>
        </header>

        {loading || status === "loading" ? (
          <RowSkeleton rows={6} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : items.length === 0 ? (
          <EmptyState icon="bell" title={filter === "unread" ? "You're all caught up" : "Nothing here yet"}>
            {filter === "all" ? "Requests to join your crews and communities, replies, mentions, event news and your ads show up here." : filter === "unread" ? "No unread notifications." : `No ${title.toLowerCase()} notifications yet.`}
          </EmptyState>
        ) : (
          <div className={cx("space-y-6 transition-opacity", refreshing && "opacity-60")} aria-busy={refreshing || undefined}>
            {groups.map((g) => (
              <section key={g.label} aria-label={g.label}>
                <h2 className="eyebrow mb-2">{g.label}</h2>
                <ul className="overflow-hidden rounded-card border border-line bg-surface">
                  {g.items.map((n) => (
                    <li key={n.id} className="border-b border-line last:border-b-0">
                      <button type="button" onClick={() => void open(n)} className={cx("flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-raised/50", !n.read && "bg-accent/[0.04]")}>
                        <span className={cx("relative inline-flex size-10 shrink-0 items-center justify-center rounded-full", n.read ? "bg-raised text-ink-muted" : "bg-accent text-accent-ink")}>
                          <Icon name={ICON[n.category] ?? "bell"} size={17} />
                          {n.count > 1 && <span className="absolute -right-1 -bottom-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ink px-1 font-mono text-[10px] font-bold text-canvas ring-2 ring-surface">{n.count > 99 ? "99+" : n.count}</span>}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cx("block text-[14px] leading-snug", n.read ? "text-ink-muted" : "font-semibold text-ink")}>{n.title}</span>
                          {n.body && <span className="mt-0.5 block line-clamp-2 text-[13px] text-ink-muted">{n.body}</span>}
                          <span className="mt-1 block font-mono text-[11px] text-ink-muted">
                            {SHORT[n.category] ?? n.category} · {now ? relativeStamp(n.updatedAt, now) : ""}
                          </span>
                        </span>
                        {!n.read && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-accent" aria-label="New" />}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {data?.hasMore && (
              <div className="flex justify-center">
                <Button onClick={() => void loadMore()} loading={loadingMore}>
                  Load older
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </PanelLayout>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={null}>
      <NotificationsContent />
    </Suspense>
  );
}
