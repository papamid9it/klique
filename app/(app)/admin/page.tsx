"use client";

import { AdminService } from "@/app/services/AdminService";
import { AdminHeader, AuditRow, Panel, StatCard, Trend } from "@/components/domain/admin/AdminParts";
import { AdminGate } from "@/components/domain/admin/AdminShell";
import { SignupChart } from "@/components/domain/admin/SignupChart";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { pluralize } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";

function AdminOverviewPageContent() {
  const { data: o, loading, error, reload } = useApi(() => AdminService.overview(), []);

  return (
    <>
      <AdminHeader title="Overview" actions={<Button size="sm" onClick={() => void reload()}>Refresh</Button>}>
        How Klique is doing, and what needs your attention.
      </AdminHeader>

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[118px] rounded-card" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-card" />
        </div>
      ) : error || !o ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="space-y-6">
          {(o.queue.openReports > 0 || o.queue.pendingDrafts > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {o.queue.openReports > 0 && (
                <StatCard tone="attention" icon="flag" label="Reports to review" value={o.queue.openReports} href="/admin/reports" hint="Oldest first. Acting on one closes duplicates." />
              )}
              {o.queue.pendingDrafts > 0 && (
                <StatCard tone="attention" icon="ticket" label="Events waiting for approval" value={o.queue.pendingDrafts} href="/admin/inbox" hint="Found by the event finder. Nothing is live yet." />
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon="users" label="People" value={o.people.total} href="/admin/people" hint={<>{o.people.new7d} new this week · <Trend now={o.people.new7d} before={o.people.newPrev7d} unit="" /></>} />
            <StatCard icon="calendar" label="Upcoming events" value={o.events.upcoming} href="/admin/events" hint={`${o.events.thisWeek} in the next 7 days · ${o.events.created7d} posted this week`} />
            <StatCard icon="hash" label="Communities" value={o.communities.total} href="/admin/communities" hint={`${o.communities.new7d} new this week · ${o.communities.large} with ${o.hostMinMembers}+ members`} />
            <StatCard icon="shield" label="Suspended accounts" value={o.people.suspended} href="/admin/people?filter=suspended" hint={`${pluralize(o.people.verifiedHosts, "verified host")} · ${pluralize(o.people.unverified, "unverified email")}`} />
          </div>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Panel title="Sign-ups, last 30 days" action={<span className="font-mono text-xs text-ink-muted">{o.signups.reduce((n, d) => n + d.count, 0)} total</span>}>
              <div className="px-4 pt-6 pb-4">
                <SignupChart data={o.signups} />
              </div>
            </Panel>
            <Panel
              title="Recent admin activity"
              action={
                <Button size="sm" variant="ghost" href="/admin/audit">
                  View all <Icon name="arrowdown" size={13} className="-rotate-90" />
                </Button>
              }
            >
              {o.recent.length ? (
                <ul className="divide-y divide-line">
                  {o.recent.map((e) => (
                    <AuditRow key={e.id} e={e} compact />
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-8 text-center text-sm text-ink-muted">Nothing yet. Everything admins do shows up here.</p>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}

export default function AdminOverviewPage() {
  return (
    <AdminGate>
      <AdminOverviewPageContent />
    </AdminGate>
  );
}
