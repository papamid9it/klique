"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { MoneyService } from "@/app/services/MoneyService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { cx } from "@/components/ui/cx";
import { useApi } from "@/lib/hooks/useApi";
import { DONATION_PRESETS, MAX_PAYMENT, MIN_PAYMENT } from "@/lib/money";
import type { DonationButtonDTO } from "@/lib/types";

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

/** How far a goal is: a bar, what's raised and the goal. */
export function GoalBar({ raised, goal, className }: { raised: number; goal: number; className?: string }) {
  const pct = Math.min(100, Math.round((raised / goal) * 100));
  return (
    <div className={className}>
      <div className="h-2 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={raised} aria-label="Raised so far">
        <div className="h-full rounded-full bg-gradient-to-r from-[#e8b923] to-[#f7d774]" style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <p className="mt-1 flex justify-between font-mono text-[11.5px] text-ink-muted">
        <span>
          <span className="font-semibold text-ink">{naira(raised)}</span> raised
        </span>
        <span>
          {pct}% of {naira(goal)}
        </span>
      </p>
    </div>
  );
}

/**
 * Back from Paystack (?payment=kdn_… or kct_…): check the payment with the server, say how it went, and tidy the
 * address. Calls `onPaid` so the page can refresh what it shows.
 */
let handled: string | null = null;
export function usePaymentReturn(onPaid?: () => void) {
  const toast = useToast();
  const paid = useRef(onPaid);
  useEffect(() => {
    paid.current = onPaid;
  });
  useEffect(() => {
    const url = new URL(window.location.href);
    const ref = url.searchParams.get("payment");
    // once per payment, however many places on the page ask
    if (!ref || handled === ref) return;
    handled = ref;
    url.searchParams.delete("payment");
    url.searchParams.delete("reference");
    url.searchParams.delete("trxref");
    void MoneyService.verify(ref)
      .then((r) => {
        if (r.data.paid) {
          toast(`Thank you! ${naira(r.data.amount)} ${r.data.kind === "donation" ? "donated" : "contributed"}.`, "success");
          paid.current?.();
        } else toast("We couldn't confirm that payment yet. If you paid, it'll show up in a minute.", "error");
      })
      .catch((e) => toast(errorMessage(e), "error"))
      .finally(() => window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash));
  }, [toast]);
}

/** One donation button's dialog: amounts, a note, the no-refunds terms, then Paystack. */
export function DonateModal({ slug, communityName, button, onClose }: { slug: string; communityName: string; button: DonationButtonDTO; onClose: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState<number>(DONATION_PRESETS[1]);
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const value = custom ? Math.round(Number(custom) || 0) : amount;
  const valid = value >= MIN_PAYMENT && value <= MAX_PAYMENT;

  async function pay() {
    setBusy(true);
    try {
      const res = await MoneyService.donate(slug, { buttonId: button.id, amount: value, message: message.trim() || undefined, agree: true });
      window.location.href = res.data.authorizationUrl;
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={button.title} description={button.description || `Support ${communityName}.`} size="sm">
      <div className="space-y-4">
        {button.goal ? <GoalBar raised={button.raised} goal={button.goal} /> : button.donors > 0 ? <p className="font-mono text-[12px] text-ink-muted">{naira(button.raised)} from {button.donors} {button.donors === 1 ? "person" : "people"}</p> : null}
        <div role="radiogroup" aria-label="Amount" className="grid grid-cols-4 gap-2">
          {DONATION_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={!custom && amount === n}
              onClick={() => (setAmount(n), setCustom(""))}
              className={cx("h-10 rounded-control border font-mono text-[13px] font-semibold transition", !custom && amount === n ? "border-[#e8b923] bg-[#e8b923]/15 text-ink" : "border-line text-ink-muted hover:bg-raised")}
            >
              {naira(n)}
            </button>
          ))}
        </div>
        <TextField label="Or another amount (₦)" type="number" inputMode="numeric" min={MIN_PAYMENT} max={MAX_PAYMENT} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={`${MIN_PAYMENT} to ${MAX_PAYMENT.toLocaleString("en-NG")}`} />
        <TextField label="Message (optional)" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={200} placeholder="Keep it going!" />
        <label className="flex items-start gap-2.5 text-[13px] text-ink-muted">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[#e8b923]" />
          <span>
            I understand donations can&apos;t be refunded, and Klique keeps a small fee to run payments.{" "}
            <Link href="/terms/payments" target="_blank" className="font-semibold text-ink underline">
              Terms
            </Link>
          </span>
        </label>
        <button type="button" disabled={!agree || !valid || busy} onClick={() => void pay()} className="btn-gold inline-flex h-11 w-full items-center justify-center gap-2 rounded-control text-[15px] font-bold disabled:opacity-50">
          {busy ? "Opening Paystack…" : <>Donate {valid ? naira(value) : ""}</>}
        </button>
        <p className="text-center text-[11.5px] text-ink-muted">Paid securely by card on Paystack.</p>
      </div>
    </Modal>
  );
}

/**
 * A community's donation buttons: gold, one per cause, with a progress bar for those with a goal. Nothing shows when
 * the community has none.
 */
export function SupportButtons({ slug, communityName, compact }: { slug: string; communityName: string; compact?: boolean }) {
  const { requireAuth } = useAuth();
  const { data, reload } = useApi(() => MoneyService.buttons(slug), [slug], { key: `donations:${slug}` });
  const [open, setOpen] = useState<DonationButtonDTO | null>(null);
  usePaymentReturn(() => void reload());
  const list = data ?? [];
  if (!list.length) return null;
  return (
    <section aria-label={`Support ${communityName}`} className="space-y-2">
      {list.map((b) => (
        <div key={b.id} className={cx(!compact && "rounded-card border border-line bg-surface p-3")}>
          <button type="button" onClick={() => requireAuth() && setOpen(b)}
            // the full name as a tooltip only when it's cut short
            onMouseEnter={(e) => {
              const label = e.currentTarget.lastElementChild as HTMLElement | null;
              e.currentTarget.title = label && label.scrollWidth > label.clientWidth ? b.title : "";
            }}
            className="donate-btn flex w-full items-center gap-2 rounded-[10px] px-3 py-[9px] text-left text-[14px] font-semibold">
            <Icon name="heart" size={15} className="shrink-0 fill-current" /> <span className="min-w-0 truncate">{b.title}</span>
          </button>
          {b.goal && !compact && <GoalBar raised={b.raised} goal={b.goal} className="mt-2" />}
        </div>
      ))}
      {open && <DonateModal slug={slug} communityName={communityName} button={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
