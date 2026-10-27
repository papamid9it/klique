"use client";

import { PointsService } from "@/app/services/PointsService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApi } from "@/lib/hooks/useApi";
import { POINT_ACTIONS } from "@/lib/points";

const n = (v: number) => v.toLocaleString("en-NG");
const ACTION_LABEL: Record<string, string> = Object.fromEntries(POINT_ACTIONS.map((a) => [a.id, a.label]));

/**
 * Your points: earned from other people, never bought. How much you have, what earns them (with what's left
 * of today's cap for each), and your latest.
 */
export function PointsCard() {
  const { status } = useAuth();
  const authed = status === "authed";
  const { data: p, reload } = useApi(authed ? () => PointsService.points() : null, [authed], { key: "my-points" });
  useRealtimeEvent(() => void reload(), { filter: (e) => e.type === "notify" && e.category === "points", debounceMs: 300 });
  if (!p) return <Skeleton className="h-56 w-full rounded-card" />;

  return (
    <section className="@container space-y-5 rounded-card border border-line bg-surface p-5" aria-label="Your points">
      <div>
        <p className="eyebrow">Your points</p>
        <p className="mt-1 flex items-center gap-2 text-4xl font-bold tracking-[-0.03em]">
          <Icon name="asterisk" size={26} className="text-accent-text" /> {n(p.points)}
        </p>
        <p className="mt-1.5 max-w-md text-sm text-ink-muted">Earned from other people, like karma. They can&apos;t be bought or spent, and some communities ask for a minimum to join or to post.</p>
      </div>

      {/* side by side only where the card itself is wide enough (Settings is narrow on tablets) */}
      <div className="grid gap-4 @lg:grid-cols-2">
        <div>
          <p className="mb-2 text-[13px] font-semibold">How you earn points</p>
          <ul className="space-y-1.5 text-[13px]">
            {p.actions.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3">
                <span>{a.label}</span>
                <span className="shrink-0 font-mono font-semibold">+{a.worth}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-[13px] font-semibold">Latest points</p>
          {p.recent.length === 0 ? (
            <p className="text-[13px] text-ink-muted">None yet. Post something your community likes, or go to an event and ask the host to tick you off as there.</p>
          ) : (
            <ul className="space-y-1 text-[13px]">
              {p.recent.slice(0, 8).map((r, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="truncate">{ACTION_LABEL[r.action] ?? "Earlier activity"}</span>
                  <span className="shrink-0 font-mono text-success">+{r.amount}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
