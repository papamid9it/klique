"use client";

import { CommunityService } from "@/app/services/CommunityService";
import { GiftService } from "@/app/services/GiftService";
import { SubscriptionService } from "@/app/services/SubscriptionService";
import { useAuth } from "@/components/providers/AuthProvider";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { useApi } from "@/lib/hooks/useApi";
import { PLAN_NAMES, type PlanId } from "@/lib/plans";
import { PlanBadge } from "./PlanTab";

const ng = (n: number) => n.toLocaleString("en-NG");
const shortDay = (d: string | Date) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
/** kliques started reset on the 1st of each month */
const nextMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
};

/**
 * Settings → Your perks, the same as the app's: your plan with its badge, a bar for each limit, Hype (bought) beside
 * points (earned), and money paid to you. Lite and Pro come up as one quiet line at the bottom, never more.
 */
export function PerksTab({ go }: { go: (tab: "plan" | "hype" | "earnings") => void }) {
  const { user } = useAuth();
  const sub = useApi(() => SubscriptionService.mine(), [], { key: "my-plan" });
  const wallet = useApi(() => GiftService.wallet(), [], { key: "gift-wallet" });
  const mine = useApi(() => CommunityService.mine(), [], { key: "my-communities" });
  const earnings = useApi(() => GiftService.earnings(), [], { key: "gift-earnings" });
  const s = sub.data;
  if (sub.loading && !s) return <Skeleton className="h-96 w-full max-w-xl rounded-card" />;
  if (sub.error || !s) return <ErrorState message={sub.error} onRetry={sub.reload} />;
  const plan: PlanId = s.plan;
  const cfg = s.config;
  const owned = (mine.data ?? []).filter((c) => c.role === "owner").length;
  const e = earnings.data?.totals;
  const waiting = e ? e.available + e.onHold + e.requested : null;
  const badge = s.siteAdmin ? "team" : plan === "free" ? null : plan;
  const box = "rounded-[18px] border border-line bg-surface";

  const meter = (label: string, used: number, max: number | null, note?: string) => {
    const full = max !== null && used >= max;
    const share = max === null ? 0.12 : Math.min(1, max ? used / max : 1);
    return (
      <li key={label} className="grid gap-[7px] px-4 py-3">
        <div className="flex justify-between gap-3 text-[15px]">
          <span>{label}</span>
          <span className={full ? "font-semibold text-ink-muted tabular-nums" : "font-bold tabular-nums"}>{max === null ? `${used} · no limit` : full ? `Full · ${used} of ${max}` : `${used} of ${max}`}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-raised" role="presentation">
          <div className="h-full rounded-full bg-ink" style={{ width: `${share * 100}%` }} />
        </div>
        {note && <span className="text-[13px] text-ink-muted">{note}</span>}
      </li>
    );
  };
  const tile = (icon: IconName, amount: string, unit: string, line: string, action: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className={`${box} flex min-w-0 flex-col gap-2.5 p-3.5 text-left transition hover:bg-raised`}>
      <Icon name={icon} size={21} />
      <span className="text-[15px] text-ink-muted"><span className="text-[22px] font-bold text-ink tabular-nums">{amount}</span> {unit}</span>
      <span className="text-[13px] leading-snug text-ink-muted">{line}</span>
      <span className="text-sm font-bold">{action} ›</span>
    </button>
  );

  return (
    <div className="grid max-w-xl gap-3.5">
      {/* your plan, with your badge */}
      <div className={`${box} flex items-center gap-3.5 p-4`}>
        <span className="inline-flex size-[52px] shrink-0 items-center justify-center rounded-full bg-raised">
          {badge ? <PlanBadge plan={badge} size={30} /> : <Icon name="user" size={24} />}
        </span>
        <div className="min-w-0">
          <p className="text-[22px] font-bold">{s.siteAdmin ? "Klique Team" : PLAN_NAMES[plan]}</p>
          <p className="text-sm text-ink-muted">
            {s.siteAdmin ? "Everything is on" : plan === "free" ? "Free forever" : s.until ? `${s.renews ? "Renews" : "Ends"} ${shortDay(s.until)} · ₦${ng(cfg.prices[plan])} a month` : ""}
          </p>
        </div>
      </div>

      {/* what's used of each limit */}
      <p className="-mb-1.5 px-1 text-[13px] font-semibold text-ink-muted">What you&apos;ve used</p>
      <ul className={`${box} divide-y divide-line overflow-hidden`}>
        {meter("Kliques started", s.usage.started, cfg.create[plan], `This month · resets ${shortDay(nextMonth())}`)}
        {meter("Kliques you're in", s.usage.inNow, cfg.join[plan], "Not counting ones you host")}
        {meter("Gallery", user?.media?.length ?? 0, cfg.mediaSlots[plan])}
        {meter("Communities you own", owned, cfg.communitiesCreate[plan])}
      </ul>

      {/* bought beside earned */}
      <div className="grid grid-cols-2 gap-2.5">
        {tile("gift", ng(wallet.data?.balance ?? 0), "Hype", "For sending awards. You buy it.", "Top up", () => go("hype"))}
        {tile("heart", ng(user?.points ?? 0), "points", "From likes and awards. Can't be bought.", "How to earn", () => go("plan"))}
      </div>

      <button type="button" onClick={() => go("earnings")} className={`${box} flex items-center gap-3 px-4 py-3.5 text-left transition hover:bg-raised`}>
        <Icon name="coin" size={21} className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold">Earnings</span>
          <span className="block text-[13px] text-ink-muted">{waiting === null ? "Awards and contributions paid to you" : `₦${ng(waiting)} waiting · awards paid to you`}</span>
        </span>
        <Icon name="chevron-right" size={16} className="text-ink-muted" />
      </button>

      {/* Lite and Pro: one quiet line, never a banner */}
      <button type="button" onClick={() => go("plan")} className="h-10 text-sm text-ink-muted hover:text-ink">
        {plan === "free" && !s.siteAdmin ? <>Want more? <span className="font-semibold text-ink">See Lite and Pro</span></> : <span className="font-semibold text-ink">Manage your plan</span>}
      </button>
    </div>
  );
}
