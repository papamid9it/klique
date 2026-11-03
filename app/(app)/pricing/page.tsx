"use client";

import Link from "next/link";
import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { SubscriptionService } from "@/app/services/SubscriptionService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { useApi } from "@/lib/hooks/useApi";
import { PLAN_NAMES, planPerks, type PaidPlan, type PlanId } from "@/lib/plans";

const ORDER: PlanId[] = ["free", "lite", "pro"];
const BLURB: Record<PlanId, string> = {
  free: "Everything you need to get out there.",
  lite: "For people who go out every week.",
  pro: "For hosts and regulars who bring people together.",
};
const FAQ: { q: string; a: string }[] = [
  { q: "How do I pay?", a: "By card through Paystack. It renews monthly until you cancel. We don't refund part of a month; see our Payment terms (/terms/payments)." },
  { q: "Can I cancel any time?", a: "Yes, in Settings → Plan & points. It won't renew, and you keep your plan until the end of the month you paid for. Then you're back on Free." },
  { q: "What happens to my kliques and photos if I go back to Free?", a: "Nothing is deleted. Kliques you're in carry on; you just can't start or join more than Free allows. Your photos and videos all stay on your profile; you just can't add or replace any until you're within Free's slots." },
  { q: "Can I switch from Lite to Pro?", a: "Yes. Get Pro and it starts a new month straight away; Lite stops renewing." },
  { q: "I had Hype. What happened to it?", a: "Hype was replaced by plans. Any Hype you had left was turned into days of Lite, at the price you paid for it." },
];
const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

/**
 * /pricing: Free, Lite and Pro side by side, from Admin → Plans (prices and limits). Signed in, your plan is
 * marked and the buttons go straight to the Paystack checkout; signed out, they ask you to sign in first.
 */
export default function PricingPage() {
  const toast = useToast();
  const { status, requireAuth } = useAuth();
  const plans = useApi(() => SubscriptionService.plans(), [], { key: "plans" });
  const mine = useApi(status === "authed" ? () => SubscriptionService.mine() : null, [status], { key: "my-plan" });
  const [busy, setBusy] = useState<PaidPlan | null>(null);
  const current: PlanId | null = mine.data ? mine.data.plan : null;

  async function get(plan: PaidPlan) {
    if (!requireAuth()) return;
    setBusy(plan);
    try {
      window.location.assign((await SubscriptionService.checkout(plan)).data.authorizationUrl);
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(null);
    }
  }

  if (plans.loading && !plans.data) return <Skeleton className="h-[30rem] w-full rounded-card" />;
  if (plans.error || !plans.data) return <ErrorState message={plans.error} onRetry={plans.reload} />;
  const c = plans.data.config;
  const rank = (p: PlanId) => ORDER.indexOf(p);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mx-auto mb-8 max-w-xl text-center">
        <p className="eyebrow">Plans</p>
        <h1 className="mt-2 text-[clamp(1.8rem,4vw,2.6rem)] leading-tight font-semibold tracking-[-0.03em]">Go out more. Pay only if you want extra.</h1>
        <p className="mt-2 text-[15px] text-ink-muted">Free gets you joining kliques and finding events. Lite and Pro give you room for more.</p>
      </header>

      <section aria-label="Plans" className="grid gap-4 md:grid-cols-3">
        {ORDER.map((p) => {
          const paid = p !== "free";
          const isCurrent = current === p && !mine.data?.siteAdmin;
          return (
            <article key={p} className={cx("flex flex-col rounded-card border bg-surface p-6", p === "pro" ? "border-ink" : "border-line")}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{PLAN_NAMES[p]}</h2>
                {isCurrent ? <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-ink">Your plan</span> : p === "pro" ? <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold">Most room</span> : null}
              </div>
              <p className="mt-1 text-sm text-ink-muted">{BLURB[p]}</p>
              <p className="mt-4 text-3xl font-semibold tracking-tight">
                {paid ? naira(c.prices[p as PaidPlan]) : "₦0"}
                <span className="text-sm font-normal text-ink-muted"> / month</span>
              </p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {planPerks(p, c).map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <Icon name="check" size={15} className="mt-0.5 shrink-0" />
                    {line}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                {!paid ? (
                  <Button className="w-full" href={status === "authed" ? "/kliques" : "/signup"}>
                    {status === "authed" ? "Find a klique" : "Join free"}
                  </Button>
                ) : isCurrent ? (
                  <Button className="w-full" href="/settings?tab=plan">
                    Manage plan
                  </Button>
                ) : current && rank(current) > rank(p) ? (
                  <Button className="w-full" disabled>
                    Included in your plan
                  </Button>
                ) : (
                  <Button variant={p === "pro" ? "primary" : "secondary"} className="w-full" loading={busy === p} disabled={!plans.data!.canBuy || !!mine.data?.siteAdmin} onClick={() => void get(p as PaidPlan)}>
                    {!plans.data!.canBuy ? "Coming soon" : `Get ${PLAN_NAMES[p]}`}
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </section>
      <p className="mt-4 text-center text-xs text-ink-muted">
        Lite and Pro are paid by card through Paystack and <strong className="text-ink">renew monthly until you cancel</strong>. Cancel any time in Settings → Plan &amp; points. No refunds for part of a month. See our <Link href="/terms/payments#plans" className="font-medium text-accent-text underline">Payment terms</Link>.
      </p>
      {mine.data?.siteAdmin && <p className="mt-3 text-center text-xs text-ink-muted">You&apos;re a site admin: everything is included, free.</p>}

      <section aria-labelledby="faq" className="mx-auto mt-12 max-w-2xl">
        <h2 id="faq" className="mb-3 text-lg font-semibold">Questions</h2>
        <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {FAQ.map((x) => (
            <details key={x.q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-medium">
                {x.q}
                <Icon name="chevron-down" size={16} className="shrink-0 text-ink-muted transition group-open:rotate-180" />
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{x.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
