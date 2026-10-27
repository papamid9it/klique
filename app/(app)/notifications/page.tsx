"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { InboxService } from "@/app/services/InboxService";
import { PagePanel, PanelItem, PanelSection } from "@/components/layout/PagePanel";
import { NotificationRow } from "@/components/domain/notifications/NotificationRow";
import { InboxEmptyArt, InboxSide } from "@/components/domain/notifications/InboxSide";
import { useAuth } from "@/components/providers/AuthProvider";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { useApi, useNow } from "@/lib/hooks/useApi";
import { isSamePage, softNavigate } from "@/lib/nav";
import { NOTIFY_CATEGORIES } from "@/lib/notifications";
import type { NotificationDTO } from "@/lib/types";

const ICON: Record<string, IconName> = { mentions: "message", replies: "topics", crews: "pin", admin: "shield", community: "users", events: "calendar", ads: "megaphone", points: "coin", friends: "userplus", messages: "message" };
const SHORT: Record<string, string> = { mentions: "Mentions & replies", replies: "Topic comments", crews: "Crews", admin: "Communities you run", community: "Your communities", events: "Events", ads: "Your ads", points: "Hype & styles", friends: "Friends" };
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
 * Notifications, with their own left panel (Home, then filter by kind with unread counts, unread only, settings).
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

  /** a line changed here (read / unread): keep the list and the badges in step */
  function patchOne(next: NotificationDTO) {
    const was = [...(data?.items ?? []), ...more].find((x) => x.id === next.id);
    const delta = was && was.read !== next.read ? (next.read ? -1 : 1) : 0;
    setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === next.id ? next : x)), unread: Math.max(0, d.unread + delta), unreadBy: { ...d.unreadBy, [next.category]: Math.max(0, (d.unreadBy[next.category] ?? 0) + delta) } } : d));
    setMore((m) => m.map((x) => (x.id === next.id ? next : x)));
    if (delta) setBadge(Math.max(0, unread + delta));
  }
  function dropOne(n: NotificationDTO) {
    setData((d) => (d ? { ...d, items: d.items.filter((x) => x.id !== n.id), unread: Math.max(0, d.unread - (n.read ? 0 : 1)) } : d));
    setMore((m) => m.filter((x) => x.id !== n.id));
    if (!n.read) setBadge(Math.max(0, unread - 1));
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

  // the filters: in the left panel on big screens (with Home on top), a row of pills on phones and tablets
  const panel = (
    <PagePanel label="Notifications">
      <PanelSection title="Notifications">
        {FILTERS.map((f) => {
          const n = countOf(f.id);
          return (
            <li key={f.id}>
              {/* All: no count · Unread: the total, dim · a kind with something new: a dot and a bold label (the number only past 1) */}
              <PanelItem onClick={() => go(f.id)} on={filter === f.id} icon={f.icon} count={f.id === "unread" ? n : f.id !== "all" && n > 1 ? (n > 9 ? "9+" : n) : null} dot={f.id !== "all" && f.id !== "unread" && n > 0}>
                {f.label}
              </PanelItem>
            </li>
          );
        })}
      </PanelSection>
      <p className="px-3 text-xs text-ink-muted">Only things addressed to you or waiting on you. Similar ones bundle into one line. Channel chat shows as unread counts instead.</p>
    </PagePanel>
  );
  const filters = (
    <div role="toolbar" aria-label="Filter notifications" className="no-bar mb-5 flex gap-1.5 overflow-x-auto lg:hidden">
      {FILTERS.map((f) => {
        const n = countOf(f.id);
        return (
          <button key={f.id} type="button" onClick={() => go(f.id)} aria-pressed={filter === f.id} className={cx("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold", filter === f.id ? "border-transparent bg-accent text-accent-ink" : "border-line bg-surface text-ink-muted")}>
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
    <div className="mx-auto grid max-w-[1240px] gap-8 xl:grid-cols-[minmax(0,880px)_19rem]">
      {panel}
      <div className="min-w-0">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow mb-1.5">Notifications</p>
            <h1 className="text-[clamp(1.6rem,3vw,2.1rem)] font-bold tracking-[-0.03em]">{filter === "all" ? "Everything" : title}</h1>
          </div>
          <span className="flex items-center gap-1.5">
          <Button size="sm" onClick={() => void readAll()} disabled={!unread}>
            <Icon name="check" size={14} /> Mark all read
          </Button>
          </span>
        </header>
        {filters}

        {loading || status === "loading" ? (
          <RowSkeleton rows={6} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : items.length === 0 ? (
          <div className="rounded-card border border-dashed border-line px-6 py-12 text-center">
            <InboxEmptyArt />
            <h2 className="mt-4 text-lg font-semibold">{filter === "unread" ? "You're all caught up" : "Nothing here yet"}</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
              {filter === "all" ? "Requests to join your crews and communities, replies, mentions, event news and your ads show up here." : filter === "unread" ? "No unread notifications." : `No ${title.toLowerCase()} notifications yet.`}
            </p>
          </div>
        ) : (
          <div className={cx("space-y-6 transition-opacity", refreshing && "opacity-60")} aria-busy={refreshing || undefined}>
            {groups.map((g) => (
              <section key={g.label} aria-label={g.label}>
                <h2 className="eyebrow mb-2">{g.label}</h2>
                <ul className="overflow-hidden rounded-card border border-line bg-surface">
                  {g.items.map((n) => (
                    <NotificationRow key={n.id} n={n} now={now} icon={ICON[n.category] ?? "bell"} kind={SHORT[n.category] ?? n.category} onOpen={() => void open(n)} onPatch={patchOne} onRemove={() => dropOne(n)} />
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
      <InboxSide />
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={null}>
      <NotificationsContent />
    </Suspense>
  );
}
