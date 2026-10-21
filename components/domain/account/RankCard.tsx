"use client";

import { RankService } from "@/app/services/RankService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { Icon } from "@/components/ui/Icon";
import { useRanks } from "@/components/ui/RankBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { cx } from "@/components/ui/cx";
import { useApi } from "@/lib/hooks/useApi";
import { HYPE_ACTIONS } from "@/lib/ranks";

const n = (v: number) => v.toLocaleString("en-NG");
const ACTION_LABEL = Object.fromEntries(HYPE_ACTIONS.map((a) => [a.id, a.label]));

/**
 * Your rank: where you are, a bar to the next rank and what it pays, how Hype is earned (with today's room
 * under the cap), the whole ladder, and your latest Hype.
 */
export function RankCard() {
  const { status } = useAuth();
  const authed = status === "authed";
  const ranks = useRanks();
  const { data: p, reload } = useApi(authed ? () => RankService.mine() : null, [authed], { key: "my-rank" });
  // ranked up (or points arrived): refresh
  useRealtimeEvent(() => void reload(), { filter: (e) => e.type === "notify" && e.category === "points", debounceMs: 300 });
  if (!p) return <Skeleton className="h-56 w-full rounded-card" />;

  const span = p.next ? p.next.hype - p.current : 1;
  const done = p.next ? Math.min(1, Math.max(0, (p.hype - p.current) / span)) : 1;

  return (
    <section className="space-y-5 rounded-card border border-line bg-surface p-5" aria-label="Your rank">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Your rank</p>
          <p className="mt-1.5 text-2xl font-bold tracking-[-0.02em]">
            {p.name} <span className="font-mono text-sm font-medium text-ink-muted">rank {p.rank}</span>
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {n(p.hype)} Hype{p.next ? ` · ${n(p.next.hype - p.hype)} more to ${p.next.name}` : " · top rank"}
          </p>
        </div>
        {p.next && p.next.points > 0 && (
          <p className="rounded-control border border-line bg-raised px-3 py-2 text-right text-xs text-ink-muted">
            Reaching {p.next.name} pays
            <span className="mt-0.5 flex items-center justify-end gap-1 font-mono text-sm font-semibold text-ink">
              <Icon name="coin" size={13} /> {n(p.next.points)}
            </span>
          </p>
        )}
      </div>

      <div>
        <div className="h-2.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(done * 100)} aria-label={p.next ? `Progress to ${p.next.name}` : "Top rank"}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.max(3, done * 100)}%` }} />
        </div>
        <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px]">
          {ranks.ranks.map((r, i) => (
            <li key={r.name} className={cx("flex items-center gap-1.5", i + 1 <= p.rank ? "text-ink" : "text-ink-muted")}>
              <span className={cx("inline-flex size-4 items-center justify-center rounded-full text-[9px] font-bold", i + 1 <= p.rank ? "bg-accent text-accent-ink" : "border border-line")}>{i + 1 <= p.rank ? <Icon name="check" size={10} /> : i + 1}</span>
              {r.name}
              <span className="font-mono text-ink-muted">{n(r.hype)}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-[13px] font-semibold">How you earn Hype</p>
          <ul className="space-y-1.5 text-[13px]">
            {HYPE_ACTIONS.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3">
                <span>
                  {a.label}
                  <span className="block text-[11.5px] text-ink-muted">{a.hint}</span>
                </span>
                <span className="shrink-0 font-mono font-semibold">+{ranks.actions[a.id]}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] text-ink-muted">Up to {n(ranks.dailyCap)} Hype a day ({n(p.todayLeft)} left today). Buying points never changes your rank.</p>
        </div>
        <div>
          <p className="mb-2 text-[13px] font-semibold">Latest Hype</p>
          {p.recent.length === 0 ? (
            <p className="text-[13px] text-ink-muted">None yet. Go to an event and ask the host to tick you off as there.</p>
          ) : (
            <ul className="space-y-1 text-[13px]">
              {p.recent.slice(0, 6).map((r, i) => (
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
