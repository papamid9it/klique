"use client";

import Link from "next/link";
import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { MoneyService } from "@/app/services/MoneyService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { relativeStamp } from "@/lib/format";
import { useApi, useNow } from "@/lib/hooks/useApi";
import type { EventDTO, PaymentDTO } from "@/lib/types";

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

/**
 * Chip in toward an event: so many units at its price, the refund terms ticked, then Paystack. Shows what's been
 * raised, what you've put in, and "Withdrawn" once the community has been paid.
 */
export function ContributeCard({ event }: { event: EventDTO }) {
  const { requireAuth } = useAuth();
  const toast = useToast();
  const c = event.contribution;
  const [qty, setQty] = useState(1);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!c) return null;
  const open = !event.isPast && !event.review && !(event as EventDTO & { cancelled?: boolean }).cancelled && !c.withdrawn;

  async function pay() {
    if (!requireAuth()) return;
    setBusy(true);
    try {
      const res = await MoneyService.contribute(event.id, qty);
      window.location.href = res.data.authorizationUrl;
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(false);
    }
  }

  return (
    <section aria-label="Chip in" className="space-y-3 rounded-card border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Chip in</p>
          <p className="mt-1 text-[15px] font-semibold">{c.label || "Contribution"}</p>
          <p className="font-mono text-[12px] text-ink-muted">{naira(c.unitPrice)} each</p>
        </div>
        {c.withdrawn && (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11.5px] font-semibold text-success">
            <Icon name="check" size={12} /> Withdrawn
          </span>
        )}
      </div>
      <p className="font-mono text-[12px] text-ink-muted">
        <span className="font-semibold text-ink">{naira(c.raised)}</span> from {c.contributors} {c.contributors === 1 ? "person" : "people"}
        {c.mine > 0 && <> · you: {c.mine}</>}
      </p>
      {c.withdrawn ? (
        <p className="text-[12.5px] text-ink-muted">The community has been paid what was raised.</p>
      ) : open ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center rounded-full border border-line" role="group" aria-label="How many">
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="One fewer" className="inline-flex size-9 items-center justify-center rounded-full text-ink-muted hover:text-ink disabled:opacity-40">
                −
              </button>
              <span className="min-w-8 text-center font-mono text-sm font-semibold" aria-live="polite">
                {qty}
              </span>
              <button type="button" onClick={() => setQty((q) => Math.min(c.maxQuantity, q + 1))} disabled={qty >= c.maxQuantity} aria-label="One more" className="inline-flex size-9 items-center justify-center rounded-full text-ink-muted hover:text-ink disabled:opacity-40">
                +
              </button>
            </div>
            <span className="font-mono text-base font-semibold">{naira(qty * c.unitPrice)}</span>
          </div>
          <label className="flex items-start gap-2.5 text-[12.5px] text-ink-muted">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--accent-text)]" />
            <span>
              The host can refund me before the money is withdrawn, minus Klique&apos;s fee. After that, no refunds.{" "}
              <Link href="/terms/payments" target="_blank" className="font-semibold text-ink underline">
                Terms
              </Link>
            </span>
          </label>
          <Button variant="primary" className="w-full" disabled={!agree} loading={busy} onClick={() => void pay()}>
            Pay {naira(qty * c.unitPrice)}
          </Button>
        </>
      ) : (
        <p className="text-[12.5px] text-ink-muted">Not taking contributions right now.</p>
      )}
    </section>
  );
}

/** Who chipped in, for the host and the community's owners and admins, with Refund (minus the fee) until it's paid out. */
export function ContributionsPanel({ event }: { event: EventDTO }) {
  const toast = useToast();
  const now = useNow();
  const { data, loading, setData } = useApi(() => MoneyService.contributions(event.id), [event.id], { key: `contributions:${event.id}` });
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState<PaymentDTO | null>(null);

  async function refund(p: PaymentDTO) {
    setBusy(p.id);
    try {
      const res = await MoneyService.refund(p.id);
      setData((list) => (list ?? []).map((x) => (x.id === p.id ? res.data : x)));
      toast(`Refunded ${naira(p.amount - p.fee)} to ${p.user.displayName}`, "success");
      setAsking(null);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) return <Skeleton className="h-32 w-full rounded-card" />;
  const list = data ?? [];
  return (
    <section aria-label="Contributions" className="rounded-card border border-line bg-surface">
      <h2 className="border-b border-line px-4 py-3 text-[15px] font-semibold">Contributions · {list.filter((p) => p.status === "paid").length}</h2>
      {list.length === 0 ? (
        <p className="p-4 text-sm text-ink-muted">Nobody has chipped in yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <Avatar name={p.user.displayName} src={p.user.avatarUrl} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold">{p.user.displayName}</span>
                <span className="block font-mono text-[11px] text-ink-muted">
                  {p.quantity} × · {now ? relativeStamp(p.createdAt, now) : ""}
                </span>
              </span>
              <span className="text-right font-mono text-[13px]">
                {naira(p.amount)}
                <span className="block text-[10.5px] text-ink-muted">{naira(p.net)} after fee</span>
              </span>
              {p.status === "refunded" ? (
                <span className="text-[12px] font-semibold text-ink-muted">Refunded</span>
              ) : p.refundable ? (
                <Button size="sm" onClick={() => setAsking(p)} loading={busy === p.id}>
                  Refund
                </Button>
              ) : (
                <span className="text-[12px] text-ink-muted">Withdrawn</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {asking && (
        <div role="alertdialog" aria-label="Refund" className="flex flex-wrap items-center gap-3 border-t border-line bg-raised/50 px-4 py-3 text-[13px]">
          <span className="min-w-0 flex-1">
            Refund {naira(asking.amount - asking.fee)} to {asking.user.displayName}? Klique keeps its {naira(asking.fee)} fee.
          </span>
          <Button size="sm" onClick={() => setAsking(null)}>
            Cancel
          </Button>
          <Button size="sm" variant="danger" loading={busy === asking.id} onClick={() => void refund(asking)}>
            Refund
          </Button>
        </div>
      )}
    </section>
  );
}

export interface ContributionDraft {
  on: boolean;
  label: string;
  unitPrice: string;
  maxQuantity: string;
}
export const contributionDraftOf = (c: EventDTO["contribution"] | null | undefined): ContributionDraft => ({ on: !!c, label: c?.label ?? "", unitPrice: c ? String(c.unitPrice) : "2000", maxQuantity: c ? String(c.maxQuantity) : "1" });
/** What the form sends: null switches it off. Throws a message for a price below ₦100. */
export function contributionInput(d: ContributionDraft): { label: string; unitPrice: number; maxQuantity: number } | null {
  if (!d.on) return null;
  const unitPrice = Math.round(Number(d.unitPrice) || 0);
  const maxQuantity = Math.min(100, Math.max(1, Math.round(Number(d.maxQuantity) || 1)));
  if (unitPrice < 100) throw new Error("A unit has to cost at least ₦100.");
  return { label: d.label.trim(), unitPrice, maxQuantity };
}

/** In the event form: let people chip in toward it through Paystack (the money goes to the community). */
export function ContributionFields({ value, onChange, error }: { value: ContributionDraft; onChange: (v: ContributionDraft) => void; error?: string }) {
  const set = (p: Partial<ContributionDraft>) => onChange({ ...value, ...p });
  return (
    <fieldset className="space-y-3 rounded-card border border-line bg-surface p-4">
      <legend className="px-1 text-[13px] font-medium">Chip in</legend>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" checked={value.on} onChange={(e) => set({ on: e.target.checked })} className="mt-0.5 size-4 accent-[var(--accent-text)]" />
        <span>
          Let people chip in toward this event
          <span className="block text-xs text-ink-muted">Paid by card on Paystack, into the community&apos;s balance. Klique keeps a small fee. You can refund someone (minus the fee) until it&apos;s paid out.</span>
        </span>
      </label>
      {value.on && (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-[13px] font-medium sm:col-span-3">
            What it&apos;s for
            <input value={value.label} onChange={(e) => set({ label: e.target.value })} maxLength={60} placeholder="e.g. Board rental, Food & drinks" className="mt-1 h-11 w-full rounded-control border border-line bg-canvas px-3 text-sm" />
          </label>
          <label className="block text-[13px] font-medium">
            Price per unit (₦)
            <input type="number" inputMode="numeric" min={100} value={value.unitPrice} onChange={(e) => set({ unitPrice: e.target.value })} className="mt-1 h-11 w-full rounded-control border border-line bg-canvas px-3 font-mono text-sm" />
          </label>
          <label className="block text-[13px] font-medium">
            Most at once
            <input type="number" inputMode="numeric" min={1} max={100} value={value.maxQuantity} onChange={(e) => set({ maxQuantity: e.target.value })} className="mt-1 h-11 w-full rounded-control border border-line bg-canvas px-3 font-mono text-sm" />
          </label>
        </div>
      )}
      {error && <p className="text-[13px] font-medium text-danger">{error}</p>}
    </fieldset>
  );
}
