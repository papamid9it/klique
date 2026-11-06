"use client";

import Link from "next/link";
import { CommunityService } from "@/app/services/CommunityService";
import { Panel, StatCard } from "@/components/domain/admin/AdminParts";
import { SignupChart } from "@/components/domain/admin/SignupChart";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApi } from "@/lib/hooks/useApi";
import { hourLabel, WEEKDAYS, weekChange } from "@/lib/growth";

/** How the community is doing: Lite sees who's active and the week; Pro also the best times and most active members. */
export function GrowthStats({ slug }: { slug: string }) {
  const { data: g, loading } = useApi(() => CommunityService.growth(slug), [slug], { key: `growth:${slug}` });
  if (loading && !g) return <Skeleton className="h-40 w-full rounded-card" />;
  if (!g) return null;
  if (g.tier === "none") {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-4">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-raised text-accent-text"><Icon name="topics" size={18} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">See how your community is growing</p>
          <p className="text-[13px] text-ink-muted">Lite shows who&apos;s active and your busiest channels. Pro adds the best times to post and your most active members.</p>
        </div>
        <Link href="/pricing" className="text-[13px] font-semibold text-accent-text hover:underline">See plans</Link>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Active members" value={g.activeMembers} hint={`${g.activeShare}% wrote in chat in the last 30 days`} icon="users" />
        <StatCard label="Messages this week" value={g.messages7} hint={weekChange(g.messages7, g.messagesLast7)} icon="topics" />
      </div>
      {g.messagesPerDay && (
        <Panel title="Chat, last 30 days">
          <div className="p-4"><SignupChart data={g.messagesPerDay} unit="messages" /></div>
        </Panel>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Busiest channels">
          {g.topChannels.length ? (
            <ul className="divide-y divide-line">
              {g.topChannels.map((x) => <li key={x.name} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"><span className="truncate font-medium">#{x.name}</span><span className="font-mono text-xs text-ink-muted">{x.messages.toLocaleString("en-NG")}</span></li>)}
            </ul>
          ) : <p className="p-4 text-sm text-ink-muted">Nobody has written yet.</p>}
        </Panel>
        {g.bestHours && (
          <Panel title="Best times to post">
            <div className="space-y-2 p-4 text-sm">
              {g.bestHours.length ? (
                <>
                  <p><span className="text-ink-muted">Busiest hours: </span><span className="font-semibold">{g.bestHours.map((h) => hourLabel(h.hour)).join(", ")}</span></p>
                  <p><span className="text-ink-muted">Busiest days: </span><span className="font-semibold">{(g.bestDays ?? []).map((d) => WEEKDAYS[d.day]).join(", ")}</span></p>
                </>
              ) : <span className="text-ink-muted">Not enough chat yet.</span>}
            </div>
          </Panel>
        )}
      </div>
      {g.topMembers && g.topMembers.length > 0 && (
        <Panel title="Most active members">
          <ul className="divide-y divide-line">
            {g.topMembers.map((m) => (
              <li key={m.user.id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar name={m.user.displayName} src={m.user.avatarUrl} size={32} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.user.displayName}</span>
                <span className="font-mono text-xs text-ink-muted">{m.messages.toLocaleString("en-NG")}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
