"use client";

import Link from "next/link";
import { CommunityService } from "@/app/services/CommunityService";
import { Panel, StatCard } from "@/components/domain/admin/AdminParts";
import { SignupChart } from "@/components/domain/admin/SignupChart";
import { ReviewButtons } from "@/components/domain/events/ReviewBar";
import { MoneySummary } from "@/components/domain/money/CommunityMoney";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { formatDateShort } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import type { CommunityDTO } from "@/lib/types";

/**
 * A community's dashboard, for its owner and admins: members and growth over 30 days, members' events waiting for
 * approval (decided right here), join requests, this week's activity, and money (donations, contributions, the
 * balance).
 */
export function DashboardView({ c }: { c: CommunityDTO }) {
  const { data: d, loading, error, reload, setData } = useApi(() => CommunityService.dashboard(c.slug), [c.slug], { key: `dashboard:${c.slug}` });
  // a member sent an event in, someone asked to join: refresh
  useRealtimeEvent(() => void reload(), { filter: (e) => e.type === "notify" && e.category === "admin", debounceMs: 800 });
  if (loading && !d) return <Skeleton className="h-96 w-full rounded-card" />;
  if (error || !d) return <ErrorState message={error} onRetry={reload} />;
  const m = d.members;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Members" value={m.total} hint={`+${m.new30} in 30 days`} icon="users" />
        <StatCard label="Joined this week" value={m.new7} hint={m.new30 ? `${Math.round((m.new7 / Math.max(1, m.new30)) * 100)}% of the month` : "Nobody new yet"} icon="userplus" />
        <StatCard label="Waiting on you" value={d.pendingEvents.length + d.pendingRequests} hint={`${d.pendingEvents.length} ${d.pendingEvents.length === 1 ? "event" : "events"} · ${d.pendingRequests} join ${d.pendingRequests === 1 ? "request" : "requests"}`} icon="clock" tone={d.pendingEvents.length + d.pendingRequests ? "attention" : undefined} />
        <StatCard label="Posts this week" value={d.activity.posts7} hint={`${d.activity.upcomingEvents} upcoming events`} icon="image" />
      </div>

      <Panel title="New members, last 30 days">
        <div className="p-4">
          <SignupChart data={m.perDay.map((x) => ({ day: x.day, count: x.joined }))} unit="joined" />
        </div>
      </Panel>

      <Panel
        title={d.pendingEvents.length ? `Events waiting for approval · ${d.pendingEvents.length}` : "Events waiting for approval"}
        action={
          d.pendingRequests > 0 ? (
            <Link href={`/communities/${c.slug}?settings=requests`} className="text-[13px] font-semibold text-accent-text hover:underline">
              {d.pendingRequests} join {d.pendingRequests === 1 ? "request" : "requests"}
            </Link>
          ) : undefined
        }
      >
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
                    {e.host.displayName} · {formatDateShort(e.startsAt)} · {e.online ? "Online" : e.venue}
                  </p>
                </div>
                <div className="flex gap-2">
                  <ReviewButtons event={e} size="sm" onDone={() => setData((x) => (x ? { ...x, pendingEvents: x.pendingEvents.filter((p) => p.id !== e.id) } : x))} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {!c.official && <MoneySummary slug={c.slug} />}
    </div>
  );
}
