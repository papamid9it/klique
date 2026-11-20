"use client";

import { CommunityService } from "@/app/services/CommunityService";
import { GiftService } from "@/app/services/GiftService";
import { SubscriptionService } from "@/app/services/SubscriptionService";
import { useAuth } from "@/components/providers/AuthProvider";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { formatDateLong } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import { PLAN_NAMES, type PlanId } from "@/lib/plans";

const ng = (n: number) => n.toLocaleString("en-NG");

/**
 * Settings → Your perks, the same as the app's: your plan and what's left of it, Hype (bought, for sending awards)
 * and points (earned from people, never bought), with Plan, Hype and Earnings a click away.
 */
export function PerksTab({ go }: { go: (tab: "plan" | "hype" | "earnings") => void }) {
  const { user } = useAuth();
  const sub = useApi(() => SubscriptionService.mine(), [], { key: "my-plan" });
  const wallet = useApi(() => GiftService.wallet(), [], { key: "gift-wallet" });
  const mine = useApi(() => CommunityService.mine(), [], { key: "my-communities" });
  const s = sub.data;
  if (sub.loading && !s) return <Skeleton className="h-80 w-full rounded-card" />;
  if (sub.error || !s) return <ErrorState message={sub.error} onRetry={sub.reload} />;
  const plan: PlanId = s.plan;
  const cfg = s.config;
  const owned = (mine.data ?? []).filter((c) => c.role === "owner").length;
  const left = (n: number | null, used: number) => (n === null ? "No limit" : `${Math.max(0, n - used)} of ${n} left`);
  const of = (used: number, n: number | null) => (n === null ? `${used}` : `${used} of ${n}`);
  const row = (label: string, value: string, hint?: string) => (
    <li key={label} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{label}</span>
        {hint && <span className="block text-[13px] text-ink-muted">{hint}</span>}
      </span>
      <span className="text-[15px] font-semibold tabular-nums">{value}</span>
    </li>
  );
  const link = (label: string, hint: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-raised">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{label}</span>
        <span className="block text-[13px] text-ink-muted">{hint}</span>
      </span>
      <Icon name="chevron-right" size={16} className="text-ink-muted" />
    </button>
  );
  const heading = (text: string) => <h3 className="eyebrow mt-6 mb-2">{text}</h3>;
  const box = "overflow-hidden rounded-card border border-line bg-surface";
  return (
    <div className="max-w-xl">
      <div className="rounded-card border border-line bg-surface p-4">
        <p className="eyebrow">Your plan</p>
        <p className="mt-0.5 text-2xl font-bold">{PLAN_NAMES[plan]}</p>
        <p className="text-sm text-ink-muted">
          {s.siteAdmin ? "Klique team: everything is on" : plan === "free" ? "Free forever" : s.until ? `${s.renews ? "Renews" : "Ends"} ${formatDateLong(s.until)} · ₦${ng(cfg.prices[plan])} a month` : ""}
        </p>
      </div>
      <ul className={`mt-3 divide-y divide-line ${box}`}>
        {row("Kliques you can start", left(cfg.create[plan], s.usage.started), "This month")}
        {row("Kliques you're in", of(s.usage.inNow, cfg.join[plan]), "Not counting ones you host")}
        {row("Gallery slots", of(user?.media?.length ?? 0, cfg.mediaSlots[plan]), "Photos and videos on your profile")}
        {row("Communities you own", of(owned, cfg.communitiesCreate[plan]))}
      </ul>
      <div className={`mt-3 ${box}`}>{link(plan === "pro" ? "Your plan" : plan === "lite" ? "See Pro" : "See Lite and Pro", plan === "pro" ? "Manage or renew it" : "More of everything, and a badge by your name", () => go("plan"))}</div>

      {heading("Hype · for sending awards")}
      <div className={box}>{link(`${ng(wallet.data?.balance ?? 0)} Hype`, "You buy it to send awards on posts and comments. Top up and see your history", () => go("hype"))}</div>

      {heading("Points · earned, not bought")}
      <div className="rounded-card border border-line bg-surface px-4 py-3">
        <p className="text-[15px] font-semibold">{ng(user?.points ?? 0)} points</p>
        <p className="text-[13px] text-ink-muted">From likes and awards people give you. Some communities ask for points to join or post. They can&apos;t be bought.</p>
      </div>

      {heading("Money you've received")}
      <div className={box}>{link("Earnings", "Awards and contributions paid to you", () => go("earnings"))}</div>
    </div>
  );
}
