"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { errorMessage, isApiError } from "@/app/ApiCore";
import { SubscriptionService } from "@/app/services/SubscriptionService";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { Rosette } from "@/components/ui/Rosette";
import { formatDateLong } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import { PLAN_NAMES, planPerks, type PaidPlan, type PlanId } from "@/lib/plans";
import type { SubscriptionDTO } from "@/lib/types";
import { PointsCard } from "./PointsCard";

const ORDER: PlanId[] = ["free", "lite", "pro"];
const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

/** A limit was hit (a klique, a community, a group): say so kindly, with the way to more. */
export function UpgradePrompt({ message, onClose }: { message: string | null; onClose: () => void }) {
  return (
    <Modal open={!!message} onClose={onClose} title="You've hit your plan's limit" description={(message ?? "").replace(/:? see \/pricing\.?/i, ".")} size="sm">
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Not now</Button>
        <Button variant="primary" href="/pricing">
          See plans
        </Button>
      </div>
    </Modal>
  );
}

/**
 * For anything that can hit a plan limit: `handled(e)` opens the upgrade prompt when the error is a plan limit (and
 * says it handled it), so the caller only toasts other errors. Render `prompt` once.
 */
export function usePlanLimit() {
  const [message, setMessage] = useState<string | null>(null);
  const handled = (e: unknown) => {
    if (isApiError(e) && e.code === "plan_limit") {
      setMessage(errorMessage(e));
      return true;
    }
    return false;
  };
  return { handled, prompt: <UpgradePrompt message={message} onClose={() => setMessage(null)} /> };
}

/** A Lite or Pro member's badge by their name: a rosette with a check (blue for Pro, silver for Lite). */
export function PlanBadge({ plan, size = 15, className }: { plan: "lite" | "pro" | null | undefined; size?: number; className?: string }) {
  if (!plan) return null;
  return <Rosette tone={plan === "pro" ? "blue" : "silver"} size={size} label={plan === "pro" ? "Pro member" : "Lite member"} className={className} />;
}

/**
 * Settings → Plan: which plan you're on (and until when), what you've used of its klique limits, the three plans
 * side by side with Upgrade buttons (a Paystack checkout), and Cancel (it runs to the end of the paid month). Your
 * points sit underneath. Back from Paystack (?reference=ksb_…) the payment is checked before anything else.
 */
export function PlanTab() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useApi(() => SubscriptionService.mine(), [], { key: "my-plan" });
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const checked = useRef<string | null>(null);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const ref = sp.get("reference") ?? sp.get("trxref");
    if (!ref || !ref.startsWith("ksb_") || checked.current === ref) return;
    checked.current = ref;
    void SubscriptionService.verify(ref)
      .then((res) => {
        setData(res.data.subscription);
        toast(res.data.paid ? `You're on ${PLAN_NAMES[res.data.subscription.plan]}. Thank you!` : "We couldn't confirm that payment yet. If you paid, your plan turns on in a minute.", res.data.paid ? "success" : "error");
      })
      .catch((e) => toast(errorMessage(e), "error"))
      .finally(() => window.history.replaceState(null, "", "/settings?tab=plan"));
  }, [setData, toast]);

  async function upgrade(plan: PaidPlan) {
    setBusy(plan);
    try {
      const res = await SubscriptionService.checkout(plan);
      window.location.assign(res.data.authorizationUrl);
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(null);
    }
  }

  if (loading && !data) return <Skeleton className="h-80 w-full rounded-card" />;
  if (error || !data) return <ErrorState message={error} onRetry={reload} />;
  const s: SubscriptionDTO = data;
  const c = s.config;
  const rank = (p: PlanId) => ORDER.indexOf(p);

  return (
    <div className="space-y-8">
      <section className="rounded-card border border-line bg-surface p-5">
        <p className="eyebrow">Your plan</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">{s.siteAdmin ? "Everything (site admin)" : PLAN_NAMES[s.plan]}</h2>
          {s.plan !== "free" && !s.siteAdmin && <PlanBadge plan={s.plan} />}
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {s.siteAdmin
            ? "Site admins have no limits and pay nothing."
            : s.plan === "free"
              ? "Upgrade any time for more kliques and profile slots."
              : s.status === "non_renewing"
                ? `Cancelled. You keep ${PLAN_NAMES[s.plan]} until ${formatDateLong(s.until!)}, then you're on Free.`
                : s.status === "attention"
                  ? `Your last renewal didn't go through. Paystack will try again; your plan lasts until ${formatDateLong(s.until!)}.`
                  : s.renews
                    ? `Renews on ${formatDateLong(s.until!)}.`
                    : `Until ${formatDateLong(s.until!)}${s.source === "hype" ? " (from your leftover Hype)" : s.source === "grant" ? " (a gift from Klique)" : ""}.`}
        </p>
        {!s.siteAdmin && (
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-control border border-line bg-raised p-3">
              <dt className="text-xs text-ink-muted">Kliques started this month</dt>
              <dd className="mt-0.5 text-lg font-semibold">
                {s.usage.started} <span className="text-sm font-normal text-ink-muted">of {c.create[s.plan]}</span>
              </dd>
            </div>
            <div className="rounded-control border border-line bg-raised p-3">
              <dt className="text-xs text-ink-muted">Kliques you&apos;re in now</dt>
              <dd className="mt-0.5 text-lg font-semibold">
                {s.usage.inNow} <span className="text-sm font-normal text-ink-muted">{c.join[s.plan] === null ? "· no limit" : `of ${c.join[s.plan]}`}</span>
              </dd>
            </div>
          </dl>
        )}
        {s.renews && (
          <Button size="sm" variant="ghost" className="mt-4" onClick={() => setCancelling(true)}>
            Cancel subscription
          </Button>
        )}
      </section>

      {!s.siteAdmin && (
        <section aria-label="Plans" className="grid gap-4 md:grid-cols-3">
          {ORDER.map((p) => {
            const current = p === s.plan;
            const paid = p !== "free";
            return (
              <article key={p} className={cx("flex flex-col rounded-card border bg-surface p-5", current ? "border-accent-text" : "border-line", p === "pro" && "shadow-[0_0_0_1px_var(--accent)]")}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold">{PLAN_NAMES[p]}</h3>
                  {current && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-ink">Current</span>}
                </div>
                <p className="mt-1 text-2xl font-semibold tracking-tight">
                  {paid ? naira(c.prices[p as PaidPlan]) : "₦0"}
                  <span className="text-sm font-normal text-ink-muted"> / month</span>
                </p>
                <ul className="mt-4 flex-1 space-y-2 text-sm">
                  {planPerks(p, c).map((line) => (
                    <li key={line} className="flex items-start gap-2">
                      <Icon name="check" size={15} className="mt-0.5 shrink-0 text-accent-text" />
                      {line}
                    </li>
                  ))}
                </ul>
                {paid && !current && rank(p) > rank(s.plan) && (
                  <Button variant="primary" className="mt-5 w-full" loading={busy === p} disabled={!s.canBuy} onClick={() => void upgrade(p as PaidPlan)}>
                    {s.canBuy ? `Get ${PLAN_NAMES[p]}` : "Coming soon"}
                  </Button>
                )}
                {paid && current && !s.renews && s.status !== "attention" && (
                  <Button className="mt-5 w-full" loading={busy === p} disabled={!s.canBuy} onClick={() => void upgrade(p as PaidPlan)}>
                    Subscribe monthly
                  </Button>
                )}
              </article>
            );
          })}
        </section>
      )}
      {!s.siteAdmin && (
        <p className="text-xs text-ink-muted">
          Paid by card on Paystack. <strong className="text-ink">Renews monthly until you cancel.</strong> Cancel any time here; you keep the plan until the end of the month you paid for. No refunds for part of a month. Moving to another plan starts a new month on it and stops the old one renewing. See our <Link href="/terms/payments#plans" className="font-medium text-accent-text underline">Payment terms</Link>.
        </p>
      )}

      <PointsCard />

      <Modal open={cancelling} onClose={() => setCancelling(false)} title={`Cancel ${PLAN_NAMES[s.plan]}?`} description={`It won't renew. You keep everything until ${s.until ? formatDateLong(s.until) : "the end of the month"}, then you're on Free. Your kliques and photos stay.`} size="sm">
        <p className="mb-4 text-xs text-ink-muted">Days already paid for aren&apos;t refunded. See our <Link href="/terms/payments#plans" className="font-medium text-accent-text underline">Payment terms</Link>.</p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setCancelling(false)}>Keep it</Button>
          <Button
            variant="danger"
            loading={busy === "cancel"}
            onClick={async () => {
              setBusy("cancel");
              try {
                setData((await SubscriptionService.cancel()).data);
                toast("Cancelled. It won't renew.", "success");
                setCancelling(false);
              } catch (e) {
                toast(errorMessage(e), "error");
              } finally {
                setBusy(null);
              }
            }}
          >
            Cancel subscription
          </Button>
        </div>
      </Modal>
    </div>
  );
}
