"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CommunityService } from "@/app/services/CommunityService";
import { Panel, StatCard } from "@/components/domain/admin/AdminParts";
import { SignupChart } from "@/components/domain/admin/SignupChart";
import { MoneySummary } from "@/components/domain/money/CommunityMoney";
import { MoneyService } from "@/app/services/MoneyService";
import { HypeCoin } from "@/components/domain/gifts/HypeCoin";
import { Button } from "@/components/ui/Button";
import { GrowthStats } from "./GrowthStats";
import { ReviewView } from "./ReviewView";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { CountBadge } from "@/components/ui/CountBadge";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { SoftLink } from "@/components/ui/SoftLink";
import { ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { useApi } from "@/lib/hooks/useApi";
import type { CommunityDashboardDTO, CommunityDTO } from "@/lib/types";

type Section = "overview" | "members" | "activity" | "events" | "money";

/**
 * A community's dashboard, for its owner and admins, laid out like YouTube Studio or Discord's insights: a panel of
 * sections on the left (tabs across the top on narrow screens) and the section on the right. Overview is the week at
 * a glance and what's waiting; Members is growth; Activity is chat (by the owner's plan); Events is what's waiting for
 * approval; Money is donations, contributions and payouts. The section is in the address (`d`), so Back works.
 */
const sectionsFor = (c: CommunityDTO): { id: Section; label: string; icon: IconName; badge?: number; show: boolean }[] => [
  { id: "overview", label: "Overview", icon: "home", show: true },
  // money near the top: what the community earns is a reason to run one here (none in Klique HQ or explicit ones)
  { id: "money", label: "Money", icon: "coin", show: !c.official && !c.explicit },
  { id: "members", label: "Members", icon: "users", show: true },
  { id: "activity", label: "Activity", icon: "topics", show: true },
  { id: "events", label: "Events", icon: "calendar", badge: c.review?.events, show: true },
];
const sectionHref = (c: CommunityDTO, id: Section) => `/communities/${c.slug}?view=dashboard${id === "overview" ? "" : `&d=${id}`}`;
/** the section in the address (`d`), so Back works */
function useSection(c: CommunityDTO): Section {
  const asked = useSearchParams().get("d") as Section | null;
  return sectionsFor(c).some((s) => s.show && s.id === asked) ? asked! : "overview";
}

/** The sections as links: down the side (the panel that replaces the community's channels) or across the top. */
function SectionLinks({ c, across, onNavigate }: { c: CommunityDTO; across?: boolean; onNavigate?: () => void }) {
  const section = useSection(c);
  return (
    <ul className={across ? "-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" : "space-y-0.5"}>
      {sectionsFor(c)
        .filter((s) => s.show)
        .map((s) => {
          const on = s.id === section;
          return (
            <li key={s.id} className="shrink-0">
              <SoftLink
                href={sectionHref(c, s.id)}
                scroll={false}
                onClick={onNavigate}
                aria-current={on ? "page" : undefined}
                className={cx("flex h-9 items-center gap-2.5 rounded-control px-2.5 text-[14px] whitespace-nowrap transition", on ? "bg-raised font-semibold text-ink" : "font-medium text-ink-muted hover:bg-raised/60 hover:text-ink")}
              >
                <Icon name={s.icon} size={16} />
                {s.label}
                {s.badge ? <CountBadge n={s.badge} mention className="ml-auto" label={`${s.badge} waiting`} /> : null}
              </SoftLink>
            </li>
          );
        })}
    </ul>
  );
}

/**
 * While the dashboard is open it takes the place of the community's channels on the left, like Discord's server
 * settings: a way back to the community at the top, then the dashboard's sections.
 */
export function DashboardNav({ c, onNavigate }: { c: CommunityDTO; onNavigate?: () => void }) {
  return (
    <nav aria-label="Dashboard" className="flex h-full flex-col overflow-y-auto px-3 py-3">
      <SoftLink href={`/communities/${c.slug}`} onClick={onNavigate} className="flex h-9 items-center gap-2 rounded-control px-2.5 text-[13px] font-semibold text-ink-muted transition hover:bg-raised/60 hover:text-ink">
        <Icon name="arrowdown" size={15} className="rotate-90" />
        <span className="truncate">Back to {c.name}</span>
      </SoftLink>
      <p className="mt-3 mb-1.5 px-2.5 eyebrow">Dashboard</p>
      <SectionLinks c={c} onNavigate={onNavigate} />
    </nav>
  );
}

/**
 * A community's dashboard, for its owner and admins, laid out like YouTube Studio or Discord's insights: its sections
 * replace the community's channels on the left (DashboardNav; tabs across the top on narrow screens) and the section
 * shows here. Overview is the week at a glance and what's waiting; Members is growth; Activity is chat (by the owner's
 * plan); Events is what's waiting for approval; Money is donations, contributions and payouts.
 */
export function DashboardView({ c }: { c: CommunityDTO }) {
  const { data: d, loading, error, reload } = useApi(() => CommunityService.dashboard(c.slug), [c.slug], { key: `dashboard:${c.slug}` });
  // a member sent an event in, someone asked to join: refresh
  useRealtimeEvent(() => void reload(), { filter: (e) => e.type === "notify" && e.category === "admin", debounceMs: 800 });
  const section = useSection(c);
  const waiting = d ? d.pendingEvents.length + d.pendingRequests : 0;
  const href = (id: Section) => sectionHref(c, id);

  return (
    <div>
      {/* narrow screens: the side panel is tucked away, so the sections go across the top */}
      <div className="mb-4 lg:hidden">
        <SectionLinks c={c} across />
      </div>
      <div className="min-w-0">
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
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard label="Upcoming events" value={d.activity.upcomingEvents} hint="Posted and coming up" icon="calendar" href={`/communities/${c.slug}?view=events`} />
              <StatCard label="Join requests" value={d.pendingRequests} hint={c.privacy === "private" ? "Waiting to be let in" : "A public community: anyone can join"} icon="userplus" href={c.privacy === "private" ? `/communities/${c.slug}?settings=requests` : undefined} />
            </div>
            {/* the same list as To review, 20 at a time */}
            <ReviewView c={c} onDecided={() => void reload()} />
          </div>
        ) : (
          <MoneySummary slug={c.slug} />
        )}
      </div>
    </div>
  );
}

/**
 * Money first on the Overview: what the community can be paid now, what came in over 30 days and its causes, with
 * the way to see it all and to the payouts. Nothing in yet: how to start (a cause).
 */
function MoneyGlance({ c, href }: { c: CommunityDTO; href: string }) {
  const { data } = useApi(() => MoneyService.money(c.slug), [c.slug], { key: `money:${c.slug}` });
  const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
  if (!data) return <Skeleton className="h-28 w-full rounded-card" />;
  const running = data.buttons.filter((b) => b.active).length;
  return (
    <section aria-label="Money" className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-1.5"><HypeCoin size={14} /> Ready to pay out</p>
          <p className="mt-1.5 font-mono text-[34px] leading-none font-semibold tracking-tight tabular-nums">{naira(data.available)}</p>
        </div>
        <div className="min-w-0">
          <p className="eyebrow">Last 30 days</p>
          <p className="mt-1.5 font-mono text-[20px] leading-none font-semibold tabular-nums">{naira(data.totals.last30)}</p>
        </div>
        <div className="min-w-0">
          <p className="eyebrow">Causes</p>
          <p className="mt-1.5 font-mono text-[20px] leading-none font-semibold tabular-nums">{running} running</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" href={href}>See money</Button>
          {running === 0 ? (
            <Button size="sm" variant="primary" href={`/communities/${c.slug}?settings=donations`}>Start a cause</Button>
          ) : (
            <Button size="sm" variant="primary" href={`/communities/${c.slug}?settings=payouts`}>Payouts</Button>
          )}
        </div>
      </div>
      {data.requested > 0 && <p className="mt-3 text-[12.5px] text-ink-muted">{naira(data.requested)} is on its way to your bank.</p>}
    </section>
  );
}

/** The week at a glance, and what's waiting for you. */
function Overview({ c, d, waiting, href }: { c: CommunityDTO; d: CommunityDashboardDTO; waiting: number; href: (s: Section) => string }) {
  const m = d.members;
  return (
    <div className="space-y-4">
      {!c.official && !c.explicit && <MoneyGlance c={c} href={href("money")} />}
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
