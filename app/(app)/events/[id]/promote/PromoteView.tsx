"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { PromotionService } from "@/app/services/PromotionService";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { formatDateShort, formatPrice } from "@/lib/format";
import { useApi, useNow } from "@/lib/hooks/useApi";
import type { PromotionDTO } from "@/lib/types";

const DAY_HINT: Record<number, string> = { 3: "A quick push", 7: "5% off · most popular", 14: "10% off", 30: "20% off · best value" };

function Status({ p }: { p: PromotionDTO }) {
  const a = p.ad;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
      <div className="min-w-0">
        <p className="font-semibold">
          {p.days} days · {p.reachLabel}
        </p>
        <p className="text-xs text-ink-muted">
          Paid {formatPrice(p.amount, p.currency)}
          {p.paidAt ? ` on ${formatDateShort(p.paidAt)}` : ""}
          {a?.endsAt ? ` · ${a.live ? "runs until" : "ran until"} ${formatDateShort(a.endsAt)}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <span className="font-mono text-xs text-ink-muted">
          {a ? `${a.impressions.toLocaleString()} views · ${a.clicks.toLocaleString()} clicks` : ""}
        </span>
        <span className={cx("rounded-full px-2.5 py-1 text-[11px] font-semibold", a?.live ? "bg-success/15 text-success" : a?.pendingReview ? "bg-accent/15 text-accent-text" : "bg-raised text-ink-muted")}>
          {a?.live ? "Live" : a?.pendingReview ? "Waiting for approval" : "Finished"}
        </span>
      </div>
    </li>
  );
}

function Promote() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const reference = sp.get("reference") ?? sp.get("trxref");
  const { status } = useAuth();
  const { data: o, loading, error, reload } = useApi(status === "authed" ? () => PromotionService.options(id) : null, [id, status]);
  const [reach, setReach] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [paid, setPaid] = useState<PromotionDTO | null>(null);
  const [checking, setChecking] = useState(!!reference);
  const checked = useRef(false);
  const now = useNow(60_000);

  // back from Paystack: confirm the payment with the server, which asks Paystack itself
  useEffect(() => {
    if (!reference || checked.current || status !== "authed") return;
    checked.current = true;
    PromotionService.verify(reference)
      .then((r) => {
        setPaid(r.data);
        void reload();
      })
      .catch((e) => setProblem(errorMessage(e)))
      .finally(() => setChecking(false));
  }, [reference, status, reload]);

  if (status === "anon") return <EmptyState icon="lock" title="Sign in to promote your event" />;
  if (loading || status === "loading") return <Skeleton className="h-96 w-full rounded-card" />;
  if (error || !o) return <ErrorState message={error} onRetry={reload} />;

  const chosenReach = reach ?? o.reaches[0]?.scope ?? "";
  const price = o.prices[chosenReach]?.[String(days)] ?? 0;
  // until the clock is known after mount, allow every length (the server re-checks anyway)
  const daysLeft = now ? Math.ceil((new Date(o.event.startsAt).getTime() - now.getTime()) / 86_400_000) : Infinity;

  async function pay() {
    setBusy(true);
    setProblem(null);
    try {
      const { data } = await PromotionService.start(id, days, chosenReach);
      // off to Paystack's checkout; it sends them back here with ?reference=
      window.location.href = data.authorizationUrl;
    } catch (e) {
      setProblem(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link href={`/events/${id}`} className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
          <Icon name="arrowdown" size={14} className="rotate-90" /> Back to the event
        </Link>
        <p className="eyebrow mt-6">Promote</p>
        <h1 className="display mt-2 text-[clamp(1.9rem,4vw,2.6rem)]">{o.event.title}</h1>
        <p className="mt-2 max-w-xl text-[15px] text-ink-muted">Put your event first on the home page, in the Events list and in search for the people nearby. It&apos;s labelled &ldquo;Promoted&rdquo;, and you&apos;ll see how many people saw and tapped it.</p>
      </div>

      {checking && (
        <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 text-sm">
          <Icon name="clock" size={16} /> Checking your payment with Paystack…
        </div>
      )}
      {paid && paid.status === "paid" && (
        <div role="status" className="rounded-card border border-success/30 bg-success/10 p-4 text-sm">
          <p className="font-semibold text-success">Payment received. Thank you!</p>
          <p className="mt-1 text-ink-muted">{paid.ad?.pendingReview ? "Your promotion starts as soon as the klique team approves it, usually within a day." : `Your event is promoted until ${paid.ad?.endsAt ? formatDateShort(paid.ad.endsAt) : "the end of the run"}.`}</p>
        </div>
      )}
      {paid && paid.status !== "paid" && (
        <div role="alert" className="rounded-card border border-danger/30 bg-danger/5 p-4 text-sm">
          <p className="font-semibold text-danger">{paid.status === "failed" ? "The payment didn't go through." : "We haven't received the payment yet."}</p>
          <p className="mt-1 text-ink-muted">{paid.status === "failed" ? "Nothing was charged. You can try again below." : "If you paid, it can take a minute to arrive. Refresh this page shortly."}</p>
        </div>
      )}

      {!o.available ? (
        <EmptyState icon="megaphone" title="This event can't be promoted right now" compact>
          {o.reason}
        </EmptyState>
      ) : (
        <section className="space-y-6 rounded-card border border-line bg-surface p-5 sm:p-6">
          <div>
            <h2 className="text-sm font-semibold">Who should see it</h2>
            <div role="radiogroup" aria-label="Reach" className="mt-3 grid gap-2 sm:grid-cols-3">
              {o.reaches.map((r) => (
                <button key={r.scope} type="button" role="radio" aria-checked={chosenReach === r.scope} onClick={() => setReach(r.scope)} className={cx("rounded-control border px-3 py-3 text-left transition", chosenReach === r.scope ? "border-accent-text bg-raised" : "border-line hover:bg-raised/50")}>
                  <span className="block text-sm font-semibold">{r.label}</span>
                  <span className="block text-xs text-ink-muted">{r.hint}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-sm font-semibold">For how long</h2>
            <div role="radiogroup" aria-label="Days" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {o.days.map((d) => {
                const tooLong = d > Math.max(daysLeft, 1);
                return (
                  <button key={d} type="button" role="radio" aria-checked={days === d} disabled={tooLong} onClick={() => setDays(d)} className={cx("rounded-control border px-3 py-3 text-left transition disabled:opacity-40", days === d ? "border-accent-text bg-raised" : "border-line hover:bg-raised/50")}>
                    <span className="block text-sm font-semibold">{d} days</span>
                    <span className="block font-mono text-[13px]">{formatPrice(o.prices[chosenReach]?.[String(d)] ?? 0, o.currency)}</span>
                    <span className="block text-[11px] text-ink-muted">{tooLong ? "Longer than the time left" : DAY_HINT[d]}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
            <div className="text-sm">
              <p className="font-semibold">
                {formatPrice(price, o.currency)} · {days} days
              </p>
              <p className="text-xs text-ink-muted">{o.review ? "Starts once the klique team approves it." : "Starts as soon as you've paid."} Shown in the home feed, Events list and search.</p>
            </div>
            <Button variant="primary" size="lg" onClick={() => void pay()} loading={busy} disabled={days > Math.max(daysLeft, 1)}>
              Pay {formatPrice(price, o.currency)} with Paystack
            </Button>
          </div>
          {problem && (
            <p role="alert" className="text-sm text-danger">
              {problem}
            </p>
          )}
          <p className="text-xs text-ink-muted">Payments are handled by Paystack (card, bank transfer, USSD). klique never sees your card details.</p>
        </section>
      )}

      {o.promotions.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">Your promotions for this event</h2>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {o.promotions.map((p) => (
              <Status key={p.id} p={p} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function PromoteView() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-card" />}>
      <Promote />
    </Suspense>
  );
}
