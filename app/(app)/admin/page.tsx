"use client";

import Link from "next/link";
import { useState } from "react";
import { AdminService } from "@/app/services/AdminService";
import { AdminHeader, AuditRow, groupAudit, Panel, Segmented, StatCard, Trend } from "@/components/domain/admin/AdminParts";
import { AdminGate } from "@/components/domain/admin/AdminShell";
import { TrendChart } from "@/components/domain/admin/TrendChart";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { pluralize } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";

/** whole naira (formatNaira says "Free" for 0, which reads wrong for money earned) */
const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

type Series = "signups" | "posts" | "messages";
const SERIES: { id: Series; label: string; unit: string }[] = [
  { id: "signups", label: "Sign-ups", unit: "sign-ups" },
  { id: "posts", label: "Posts", unit: "posts" },
  { id: "messages", label: "Messages", unit: "messages" },
];
const RANGES = [
  { id: "7", label: "7d" },
  { id: "30", label: "30d" },
  { id: "90", label: "90d" },
];

/** One queue that needs an admin: its count, and a link to it. Quiet when it's empty. */
function QueueCard({ label, count, href, icon, hint, urgent }: { label: string; count: number; href: string; icon: IconName; hint: string; urgent?: number }) {
  const waiting = count > 0;
  return (
    <Link
      href={href}
      className={cx(
        "group flex items-start gap-3 rounded-card border p-4 transition",
        urgent ? "border-danger/50 bg-danger/[0.06] hover:bg-danger/10" : waiting ? "border-line bg-surface hover:border-ink-muted/40 hover:bg-raised/40" : "border-line/70 bg-surface/50 hover:bg-surface",
      )}
    >
      <span className={cx("inline-flex size-9 shrink-0 items-center justify-center rounded-full", urgent ? "bg-danger text-white" : waiting ? "bg-accent text-accent-ink" : "bg-raised text-ink-muted")}>
        <Icon name={icon} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cx("text-sm font-semibold", !waiting && "text-ink-muted")}>{label}</span>
          <span className={cx("font-mono text-xl leading-none font-semibold tabular-nums", !waiting && "text-ink-muted/60")}>{count}</span>
        </span>
        <span className="mt-1 block text-xs text-ink-muted">{urgent ? <span className="font-semibold text-danger">{urgent} urgent · </span> : null}{waiting ? hint : "Nothing waiting"}</span>
      </span>
    </Link>
  );
}

function AdminOverviewPageContent() {
  const [days, setDays] = useState("30");
  const [series, setSeries] = useState<Series>("signups");
  const { data: o, loading, error, reload } = useApi(() => AdminService.overview(Number(days)), [days], { keepPrevious: true });

  if (!o) {
    return (
      <>
        <AdminHeader title="Overview">How Klique is doing, and what needs your attention.</AdminHeader>
        {loading ? (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-[76px] rounded-card" />
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-[118px] rounded-card" />
              ))}
            </div>
            <Skeleton className="h-80 rounded-card" />
          </div>
        ) : (
          <ErrorState message={error} onRetry={reload} />
        )}
      </>
    );
  }

  const q = o.queue;
  const waiting = q.openReports + q.pendingAds + q.pendingPayouts + q.pendingDrafts;
  const s = SERIES.find((x) => x.id === series)!;
  const points = o.series.map((d) => ({ day: d.day, value: d[series] }));
  const periodTotal = points.reduce((n, d) => n + d.value, 0);
  const r = o.revenue;
  const recent = groupAudit(o.recent).slice(0, 8);

  return (
    <>
      <AdminHeader title="Overview" actions={<Button size="sm" onClick={() => void reload()}>Refresh</Button>}>
        How Klique is doing, and what needs your attention.
      </AdminHeader>

      <div className="space-y-8">
        <section aria-labelledby="attention">
          <h2 id="attention" className="eyebrow mb-3">
            Needs your attention
          </h2>
          {waiting === 0 ? (
            <div className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3.5 text-sm">
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-raised text-success">
                <Icon name="check" size={15} />
              </span>
              <span>
                <span className="font-semibold">All clear.</span> <span className="text-ink-muted">No reports, ad requests, payouts or imported events are waiting.</span>
              </span>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <QueueCard label="Reports" count={q.openReports} urgent={q.urgentReports} href="/admin/reports" icon="flag" hint="Oldest first" />
              <QueueCard label="Ad requests" count={q.pendingAds} href="/admin/ads?view=requests" icon="megaphone" hint="Waiting for review" />
              <QueueCard label="Payouts" count={q.pendingPayouts} href="/admin/payouts" icon="coin" hint="Requested by communities" />
              <QueueCard label="Event inbox" count={q.pendingDrafts} href="/admin/inbox" icon="ticket" hint="Found by the event finder" />
            </div>
          )}
        </section>

        <section aria-labelledby="numbers">
          <h2 id="numbers" className="eyebrow mb-3">
            At a glance
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            <StatCard icon="users" label="People" value={o.people.total} href="/admin/people" hint={<>{o.people.new7d} joined this week · <Trend now={o.people.new7d} before={o.people.newPrev7d} unit="" /></>} />
            <StatCard icon="message" label="Active this week" value={o.people.active7d} hint={<Trend now={o.people.active7d} before={o.people.activePrev7d} />} />
            <StatCard icon="hash" label="Communities" value={o.communities.total} href="/admin/communities" hint={`${o.communities.new7d} new this week · ${o.communities.large} with ${o.hostMinMembers}+ members`} />
            <StatCard icon="calendar" label="Upcoming events" value={o.events.upcoming} href="/admin/events" hint={`${o.events.thisWeek} in the next 7 days · ${o.events.created7d} posted this week`} />
            {/* two wide where the row would otherwise leave it on its own */}
            <StatCard
              className="sm:col-span-2 2xl:col-span-1"
              icon="coin"
              label="Revenue this month"
              value={naira(r.total)}
              hint={
                <>
                  <span className="block">
                    Hype {naira(r.hype)} · Ads {naira(r.ads)} · Fees {naira(r.fees)}
                  </span>
                  <Trend now={r.total} before={r.prevTotal} unit="vs this point last month" />
                </>
              }
            />
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            <Link href="/admin/people?filter=suspended" className="hover:text-ink hover:underline">
              {pluralize(o.people.suspended, "suspended account")}
            </Link>{" "}
            ·{" "}
            <Link href="/admin/people?filter=unverified" className="hover:text-ink hover:underline">
              {pluralize(o.people.unverified, "unverified email")}
            </Link>{" "}
            · {pluralize(o.events.imported, "imported event")}
          </p>
        </section>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <Panel
            title="Activity"
            action={<span className="font-mono text-xs text-ink-muted">{`${periodTotal.toLocaleString()} ${s.unit} · ${o.days} days`}</span>}
          >
            <div className={cx("space-y-5 p-4 transition-opacity", loading && "opacity-60")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Segmented label="What to chart" value={series} onChange={setSeries} options={SERIES} />
                <Segmented label="Period" value={days} onChange={setDays} options={RANGES} />
              </div>
              <TrendChart data={points} unit={s.unit} />
            </div>
          </Panel>
          <Panel
            title="Recent admin activity"
            action={
              <Button size="sm" variant="ghost" href="/admin/audit">
                View all <Icon name="chevron-right" size={13} />
              </Button>
            }
          >
            {recent.length ? (
              <ul className="divide-y divide-line">
                {recent.map(({ e, count }) => (
                  <AuditRow key={e.id} e={e} count={count} compact />
                ))}
              </ul>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-ink-muted">Nothing yet. Everything admins do shows up here.</p>
            )}
          </Panel>
        </div>
      </div>
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
