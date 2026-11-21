"use client";

import { ANDROID_APP_URL } from "@/lib/constants";
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
import { usePayWith } from "@/components/domain/payments/PayWith";
import { PointsCard } from "./PointsCard";

const ORDER: PlanId[] = ["free", "lite", "pro"];
const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

type Limit = "create" | "join" | "mediaSlots" | "communitiesCreate" | "communitiesJoin" | "webhooks" | "emojiSlots";
const WHAT: Record<Limit, { title: string; unit: string; icon: "pin" | "image" | "users" | "link" | "smile" }> = {
  create: { title: "You've started all your kliques this month", unit: "a month", icon: "pin" },
  join: { title: "You're in as many kliques as you can be", unit: "at once", icon: "pin" },
  mediaSlots: { title: "Your gallery is full", unit: "slots", icon: "image" },
  communitiesCreate: { title: "You own as many communities as you can", unit: "in total", icon: "users" },
  communitiesJoin: { title: "You're in as many communities as you can be", unit: "in total", icon: "users" },
  webhooks: { title: "This community has all its bots", unit: "per community", icon: "link" },
  emojiSlots: { title: "This community has all its emoji", unit: "per community", icon: "smile" },
};
/** which limit the server's message is about (its wording is fixed in klique-limits, space-limits and friends) */
function limitOf(message: string): Limit | null {
  const m = message.toLowerCase();
  // a perk, not a number: no Free/Lite/Pro table for it
  if (m.includes("all communities")) return null;
  if (m.includes("started") && m.includes("klique")) return "create";
  if (m.includes("klique")) return "join";
  if (m.includes("slot")) return "mediaSlots";
  if (m.includes("you own")) return "communitiesCreate";
  if (m.includes("communities")) return "communitiesJoin";
  if (m.includes("emoji")) return "emojiSlots";
  if (m.includes("webhook") || m.includes("bot")) return "webhooks";
  return null;
}

/**
 * A limit was hit (a klique, a community, a group, the gallery): the same sheet as the app's. What you reached, what
 * Free, Lite and Pro give for that exact thing, and a way to more. Only ever shown at a limit, never before.
 */
export function UpgradePrompt({ message, onClose }: { message: string | null; onClose: () => void }) {
  const toast = useToast();
  const [sub, setSub] = useState<SubscriptionDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const payWith = usePayWith();
  useEffect(() => {
    if (message && !sub) SubscriptionService.mine().then((r) => setSub(r.data), () => {});
  }, [message, sub]);
  const limit = message ? limitOf(message) : null;
  const now: PlanId = sub?.plan ?? "free";
  const next: PaidPlan | null = now === "free" ? "lite" : now === "lite" ? "pro" : null;
  const value = (p: PlanId) => {
    if (!sub || !limit) return null;
    const v = (sub.config[limit] as Record<PlanId, number | null>)[p];
    return v === null ? "No limit" : String(v);
  };
  async function buy() {
    if (!next) return;
    setBusy(true);
    try {
      const res = await SubscriptionService.checkout(next, payWith.provider);
      window.location.assign(res.data.authorizationUrl);
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(false);
    }
  }
  const text = (message ?? "").replace(/:? see \/pricing\.?/i, ".").replace(/\s*Upgrade to (Lite or Pro|Pro) for more\.?/i, "");
  return (
    <Modal open={!!message} onClose={onClose} title={limit ? WHAT[limit].title : /all communities/i.test(message ?? "") ? "All communities is for Lite and Pro" : "You've hit your plan's limit"} size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-raised"><Icon name={limit ? WHAT[limit].icon : "shield"} size={21} /></span>
          <p className="text-sm text-ink-muted">{text}</p>
        </div>
        {limit && (
          !sub ? <Skeleton className="h-20" /> : (
            <div className="grid grid-cols-3 gap-2">
              {ORDER.map((p) => (
                <div key={p} className={cx("rounded-control py-2.5 text-center", p === next ? "border-2 border-ink py-[9px]" : "border border-line", p === now ? "bg-raised" : "bg-surface")}>
                  <p className="text-[12px] font-semibold tracking-wide text-ink-muted uppercase">{PLAN_NAMES[p]}{p === now ? " · you" : ""}</p>
                  <p className="text-xl font-bold">{value(p)}</p>
                  <p className="text-[12px] text-ink-muted">{p === "free" ? WHAT[limit].unit : `${naira(sub.config.prices[p])}/mo`}</p>
                </div>
              ))}
            </div>
          )
        )}
        <div className="space-y-2">
          {sub && next && sub.canBuy && !sub.renews && !sub.siteAdmin && (
            <>
              {payWith.picker}
              <Button variant="primary" className="w-full" loading={busy} onClick={() => void buy()}>
                Get {PLAN_NAMES[next]} · {naira(sub.config.prices[next])} a month
              </Button>
            </>
          )}
          <Button className="w-full" href="/settings?tab=plan">{next ? "See everything in Lite and Pro" : "See your plan"}</Button>
          <button type="button" onClick={onClose} className="h-10 w-full text-sm font-semibold text-ink-muted hover:text-ink">Not now</button>
        </div>
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

/**
 * The badge by someone's name: Klique Team (an ink rosette with a crown), or a Lite or Pro member (a rosette with a
 * check: blue for Pro, silver for Lite). The server gives each person one at most.
 */
export function PlanBadge({ plan, size = 15, className }: { plan: "team" | "lite" | "pro" | null | undefined; size?: number; className?: string }) {
  if (!plan) return null;
  if (plan === "team") return <Rosette tone="team" size={size} label="Klique Team" className={className} />;
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
  const payWith = usePayWith();
  // Paystack renews monthly; Flutterwave and OPay are 30 days at a time
  const monthly = !payWith.provider || payWith.provider === "paystack";
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
      const res = await SubscriptionService.checkout(plan, payWith.provider);
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
                    : `Until ${formatDateLong(s.until!)}${s.source === "hype" ? " (from your leftover Hype)" : s.source === "grant" ? " (a gift from Klique)" : s.source === "store" ? " (bought in the Klique app)" : ""}.`}
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

      {!s.siteAdmin && s.canBuy && payWith.picker}
      {!s.siteAdmin && (
        <section aria-label="Plans" className="grid gap-4 md:grid-cols-3">
          {ORDER.map((p) => {
            const current = p === s.plan;
            const paid = p !== "free";
            return (
              <article key={p} className={cx("flex flex-col rounded-card border bg-surface p-5", current ? "border-accent-text" : "border-line", p === "pro" && "shadow-[0_0_0_1px_var(--accent)]")}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold">{PLAN_NAMES[p]}</h3>
                  {current && <span className="rounded-full bg-accent px-2 py-0.5 text-[12px] font-semibold text-accent-ink">Current</span>}
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
                  !s.canBuy ? (
                    // paying on the website is paused: Lite and Pro are bought in the phone app for now
                    <Button variant="primary" className="mt-5 w-full" href={ANDROID_APP_URL}>
                      Get {PLAN_NAMES[p]} in the app
                    </Button>
                  ) : (
                  <Button variant="primary" className="mt-5 w-full" loading={busy === p} disabled={!s.canBuy} onClick={() => void upgrade(p as PaidPlan)}>
                    {s.canBuy ? `Get ${PLAN_NAMES[p]}` : "Coming soon"}
                  </Button>
                  )
                )}
                {paid && current && !s.renews && s.status !== "attention" && s.canBuy && (
                  <Button className="mt-5 w-full" loading={busy === p} disabled={!s.canBuy} onClick={() => void upgrade(p as PaidPlan)}>
                    {monthly ? "Subscribe monthly" : "Add 30 days"}
                  </Button>
                )}
              </article>
            );
          })}
        </section>
      )}
      {!s.siteAdmin && (
        <p className="text-xs text-ink-muted">
          {monthly ? (
            <>
              Paid by card on Paystack. <strong className="text-ink">Renews monthly until you cancel.</strong> Cancel any time here; you keep the plan until the end of the month you paid for. No refunds for part of a month. Moving to another plan starts a new month on it and stops the old one renewing.
            </>
          ) : (
            <>
              Paid on {payWith.provider === "opay" ? "OPay" : "Flutterwave"}. <strong className="text-ink">30 days, doesn&apos;t renew by itself.</strong> Buying again adds another 30 days. A Paystack plan that renews is stopped so you aren&apos;t charged twice. No refunds for part of a month.
            </>
          )}{" "}
          See our <Link href="/terms/payments#plans" className="font-medium text-accent-text underline">Payment terms</Link>.
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
