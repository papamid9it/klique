"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CommunityService } from "@/app/services/CommunityService";
import { Panel, StatCard } from "@/components/domain/admin/AdminParts";
import { SignupChart } from "@/components/domain/admin/SignupChart";
import { ReviewButtons } from "@/components/domain/events/ReviewBar";
import { MoneySummary } from "@/components/domain/money/CommunityMoney";
import { GrowthStats } from "./GrowthStats";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { Avatar } from "@/components/ui/Avatar";
import { CountBadge } from "@/components/ui/CountBadge";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { SoftLink } from "@/components/ui/SoftLink";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { formatDateShort } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import type { CommunityDashboardDTO, CommunityDTO } from "@/lib/types";

type Section = "overview" | "members" | "activity" | "events" | "money";

/**
 * A community's dashboard, for its owner and admins, laid out like YouTube Studio or Discord's insights: a panel of
 * sections on the left (tabs across the top on narrow screens) and the section on the right. Overview is the week at
 * a glance and what's waiting; Members is growth; Activity is chat (by the owner's plan); Events is what's waiting for
 * approval; Money is donations, contributions and payouts. The section is in the address (`d`), so Back works.
 */
export function DashboardView({ c }: { c: CommunityDTO }) {
  const sp = useSearchParams();
  const { data: d, loading, error, reload, setData } = useApi(() => CommunityService.dashboard(c.slug), [c.slug], { key: `dashboard:${c.slug}` });
  // a member sent an event in, someone asked to join: refresh
  useRealtimeEvent(() => void reload(), { filter: (e) => e.type === "notify" && e.category === "admin", debounceMs: 800 });

  const money = !c.official && !c.explicit;
  const waiting = d ? d.pendingEvents.length + d.pendingRequests : 0;
  const sections: { id: Section; label: string; icon: IconName; badge?: number; show: boolean }[] = [
    { id: "overview", label: "Overview", icon: "home", show: true },
    { id: "members", label: "Members", icon: "users", show: true },
    { id: "activity", label: "Activity", icon: "topics", show: true },
    { id: "events", label: "Events", icon: "calendar", badge: d?.pendingEvents.length, show: true },
    { id: "money", label: "Money", icon: "coin", show: money },
  ];
  const asked = sp.get("d") as Section | null;
  const section: Section = sections.some((s) => s.show && s.id === asked) ? asked! : "overview";
  const href = (id: Section) => `/communities/${c.slug}?view=dashboard${id === "overview" ? "" : `&d=${id}`}`;
  const shown = sections.filter((s) => s.show);

  return (
    <div className="md:flex md:items-start md:gap-6">
      {/* the left panel; on narrow screens, tabs across the top */}
      <nav aria-label="Dashboard sections" className="mb-4 md:sticky md:top-0 md:mb-0 md:w-48 md:shrink-0">
        <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:gap-0.5 md:overflow-visible md:p-0">
          {shown.map((s) => {
            const on = s.id === section;
            return (
              <li key={s.id} className="shrink-0">
                <SoftLink
                  href={href(s.id)}
                  scroll={false}
                  aria-current={on ? "page" : undefined}
                  className={cx(
                    "flex h-9 items-center gap-2.5 rounded-control px-3 text-[14px] whitespace-nowrap transition",
                    on ? "bg-raised font-semibold text-ink" : "font-medium text-ink-muted hover:bg-raised/60 hover:text-ink",
                  )}
                >
                  <Icon name={s.icon} size={16} />
                  {s.label}
                  {s.badge ? <CountBadge n={s.badge} mention className="ml-auto" label={`${s.badge} waiting`} /> : null}
                </SoftLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-w-0 flex-1">
        {loading && !d ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-card" />)}</div>
            <Skeleton className="h-56 w-full rounded-card" />
          </div>
        ) : error || !d ? (
          <ErrorState message={error} onRetry={reload} />
        ) : section === "overview" ? (
          <Overview c={c} d={d} waiting={waiting} href={href} />
        ) : section === "members" ? (
          <Members c={c} d={d} />
        ) : section === "activity" ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard label="Posts this week" value={d.activity.posts7} hint="In Posts" icon="image" />
              <StatCard label="Upcoming events" value={d.activity.upcomingEvents} hint="Posted and coming up" icon="calendar" />
            </div>
            <GrowthStats slug={c.slug} />
          </div>
        ) : section === "events" ? (
          <PendingEvents c={c} d={d} onDecided={(id) => setData((x) => (x ? { ...x, pendingEvents: x.pendingEvents.filter((p) => p.id !== id) } : x))} />
        ) : (
          <MoneySummary slug={c.slug} />
        )}
      </div>
    </div>
  );
}

/** The week at a glance, and what's waiting for you. */
function Overview({ c, d, waiting, href }: { c: CommunityDTO; d: CommunityDashboardDTO; waiting: number; href: (s: Section) => string }) {
  const m = d.members;
  return (
    <div className="space-y-4">
      {waiting > 0 && (
        <SoftLink href={`/communities/${c.slug}?view=review`} className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 transition hover:bg-raised">
          <span className="inline-flex size-9 items-center justify-center rounded-full bg-accent text-accent-ink">
            <Icon name="shield" size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold">Waiting for you</span>
            <span className="block text-[13px] text-ink-muted">
              {[d.pendingEvents.length ? `${d.pendingEvents.length} ${d.pendingEvents.length === 1 ? "event" : "events"} to approve` : "", d.pendingRequests ? `${d.pendingRequests} join ${d.pendingRequests === 1 ? "request" : "requests"}` : ""].filter(Boolean).join(" · ")}
            </span>
          </span>
          <span className="text-[13px] font-semibold text-accent-text">Review</span>
        </SoftLink>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Members" value={m.total} hint={`+${m.new30} in 30 days`} icon="users" href={href("members")} />
        <StatCard label="Joined this week" value={m.new7} hint={m.new30 ? `${Math.round((m.new7 / Math.max(1, m.new30)) * 100)}% of the month` : "Nobody new yet"} icon="userplus" href={href("members")} />
        <StatCard label="Posts this week" value={d.activity.posts7} hint="In Posts" icon="image" href={href("activity")} />
        <StatCard label="Upcoming events" value={d.activity.upcomingEvents} hint={d.pendingEvents.length ? `${d.pendingEvents.length} waiting for approval` : "Posted and coming up"} icon="calendar" href={href("events")} tone={d.pendingEvents.length ? "attention" : undefined} />
      </div>
      <Panel title="New members, last 30 days">
        <div className="p-4">
          <SignupChart data={m.perDay.map((x) => ({ day: x.day, count: x.joined }))} unit="joined" />
        </div>
      </Panel>
    </div>
  );
}

/** Who's joining, and the ways into the member list, requests and roles. */
function Members({ c, d }: { c: CommunityDTO; d: CommunityDashboardDTO }) {
  const m = d.members;
  const base = `/communities/${c.slug}`;
  const links: { href: string; label: string; icon: IconName; hint: string }[] = [
    { href: `${base}?view=members`, label: "Member list", icon: "users", hint: "Everyone, with their roles" },
    ...(c.privacy === "private" ? [{ href: `${base}?settings=requests`, label: "Join requests", icon: "userplus" as IconName, hint: d.pendingRequests ? `${d.pendingRequests} waiting` : "Nobody waiting" }] : []),
    { href: `${base}?settings=roles`, label: "Roles and permissions", icon: "shield", hint: "Who can do what" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Members" value={m.total} hint="Everyone in it now" icon="users" />
        <StatCard label="Joined this week" value={m.new7} hint="Last 7 days" icon="userplus" />
        <StatCard label="Joined this month" value={m.new30} hint="Last 30 days" icon="calendar" />
      </div>
      <Panel title="New members, last 30 days">
        <div className="p-4">
          <SignupChart data={m.perDay.map((x) => ({ day: x.day, count: x.joined }))} unit="joined" />
        </div>
      </Panel>
      <Panel title="Manage">
        <ul className="divide-y divide-line">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="flex items-center gap-3 px-4 py-3 transition hover:bg-raised/60">
                <Icon name={l.icon} size={16} className="text-ink-muted" />
                <span className="min-w-0 flex-1 text-[14px] font-medium">{l.label}</span>
                <span className="text-[13px] text-ink-muted">{l.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/** Members' events waiting for approval, decided right here. */
function PendingEvents({ c, d, onDecided }: { c: CommunityDTO; d: CommunityDashboardDTO; onDecided: (id: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Waiting for approval" value={d.pendingEvents.length} hint="Sent in by members" icon="clock" tone={d.pendingEvents.length ? "attention" : undefined} />
        <StatCard label="Upcoming events" value={d.activity.upcomingEvents} hint="Posted and coming up" icon="calendar" href={`/communities/${c.slug}?view=events`} />
      </div>
      <Panel title={d.pendingEvents.length ? `Waiting for approval · ${d.pendingEvents.length}` : "Waiting for approval"}>
        {d.pendingEvents.length === 0 ? (
          <div className="p-6">
            <EmptyState icon="calendar" title="Nothing to approve" compact>
              {c.memberEvents ? "When a member sends an event in, it waits here for you or another admin." : "Members can't send events in. Turn it on in Settings → Groups & events."}
            </EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {d.pendingEvents.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar name={e.host.displayName} src={e.host.avatarUrl} size={34} />
                <div className="min-w-0 flex-1">
                  <Link href={`/events/${e.id}`} className="block truncate text-[14px] font-semibold hover:underline">
                    {e.title}
                  </Link>
                  <p className="truncate text-[12.5px] text-ink-muted">
                    {e.host.displayName} · {formatDateShort(e.startsAt, e.timeZone)} · {e.online ? "Online" : e.venue}
                  </p>
                </div>
                <div className="flex gap-2">
                  <ReviewButtons event={e} size="sm" onDone={() => onDecided(e.id)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
