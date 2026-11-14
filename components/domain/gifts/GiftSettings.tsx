"use client";

import { useEffect, useState } from "react";
import { errorMessage, isApiError } from "@/app/ApiCore";
import { GiftService } from "@/app/services/GiftService";
import { MoneyService } from "@/app/services/MoneyService";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { formatDateShort } from "@/lib/format";
import { HYPE_NAIRA, earningText, hypeForNaira, payoutDayLabel } from "@/lib/gifts";
import { useApi } from "@/lib/hooks/useApi";
import type { GiftEarningsDTO, GiftReceivedDTO, GiftWalletDTO } from "@/lib/types";
import { GiftArt } from "./Gifts";

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
const hype = (n: number) => `${n.toLocaleString("en-NG")} Hype`;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-3.5">
      <p className="text-[12px] font-semibold tracking-wide text-ink-muted uppercase">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

/**
 * Settings → Hype: your balance for gifts, topping up with Paystack (a pack or any amount up to ₦500,000), and the
 * history. Hype is only for gifts: it can't be cashed out or refunded.
 */
export function HypeTab() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useApi(() => GiftService.wallet(), [], { key: "gift-wallet" });
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  // back from Paystack: check the payment and show the new balance
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("hype_ref");
    if (!ref) return;
    GiftService.verify(ref).then(
      (r) => {
        toast(r.data.paid ? `${hype(r.data.hype)} added` : "Your payment hasn't come through yet. It'll show here once it does.", r.data.paid ? "success" : undefined);
        void reload();
      },
      (e) => toast(errorMessage(e), "error"),
    );
    window.history.replaceState(null, "", window.location.pathname + "?tab=hype");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function buy(n: number) {
    setBusy(n);
    try {
      const res = await GiftService.topup(n);
      window.location.href = res.data.authorizationUrl;
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(null);
    }
  }

  async function more(d: GiftWalletDTO) {
    const last = d.history[d.history.length - 1];
    if (!last) return;
    const res = await GiftService.wallet(last.createdAt);
    setData({ ...d, history: [...d.history, ...res.data.history], hasMore: res.data.hasMore });
  }

  if (loading && !data) return <Skeleton className="h-64 w-full rounded-card" />;
  if (error || !data) return <ErrorState message={error} onRetry={reload} />;
  const typed = Math.round(Number(amount) || 0);
  const typedOk = typed >= data.customMin && typed <= data.customMax && typed % HYPE_NAIRA === 0;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Your Hype" value={hype(data.balance)} hint={`1 Hype is ₦${HYPE_NAIRA}. Hype is only for sending awards.`} />
        <Stat label="Worth in awards" value={naira(data.balance * data.hypeNaira)} hint="Send awards to posts, comments and board posts you love." />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Top up</h2>
        {!data.canBuyWeb && <p className="text-sm text-ink-muted">Buying Hype isn&apos;t set up yet.</p>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {data.webPacks.map((p) => (
            <button key={p.naira} type="button" disabled={!data.canBuyWeb || busy !== null} onClick={() => void buy(p.naira)} className={cx("rounded-card border border-line bg-surface p-3 text-left transition hover:border-ink-muted/50 disabled:opacity-50", busy === p.naira && "opacity-60")}>
              <p className="font-mono text-[15px] font-semibold tabular-nums">{hype(p.hype)}</p>
              <p className="text-xs text-ink-muted">{naira(p.naira)}</p>
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (typedOk) void buy(typed);
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="w-48">
            <TextField label="Or any amount (₦)" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} placeholder="2500" />
          </div>
          <Button type="submit" variant="primary" disabled={!data.canBuyWeb || !typedOk || busy !== null} loading={busy === typed && typedOk}>
            {typedOk ? `Buy ${hype(hypeForNaira(typed))}` : "Buy"}
          </Button>
          <p className="w-full text-xs text-ink-muted">
            {naira(data.customMin)} to {naira(data.customMax)}, in steps of ₦{HYPE_NAIRA}. Paid securely with Paystack. Hype can&apos;t be refunded or cashed out. See the{" "}
            <a href="/terms/payments#gifts" className="underline">
              payment terms
            </a>
            .
          </p>
        </form>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">History</h2>
        {data.history.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {data.history.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{h.note}</span>
                <span className={cx("font-mono tabular-nums", h.amount > 0 ? "text-success" : "text-ink-muted")}>
                  {h.amount > 0 ? "+" : ""}
                  {h.amount.toLocaleString("en-NG")}
                </span>
                <span className="w-24 text-right text-xs text-ink-muted">{formatDateShort(h.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
        {data.hasMore && (
          <Button size="sm" className="mt-2" onClick={() => void more(data)}>
            Show more
          </Button>
        )}
      </section>
    </div>
  );
}

function GiftLine({ g }: { g: GiftReceivedDTO }) {
  return (
    <li className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
      <GiftArt gift={{ name: g.giftName, emoji: g.emoji, artUrl: g.artUrl }} size={24} />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold">{g.from ? g.from.displayName : "Someone"}</span> sent a {g.giftName}
      </span>
      <span className="font-mono text-success tabular-nums">+{naira(g.earned)}</span>
      <span className="w-24 text-right text-xs text-ink-muted">{new Date(g.holdUntil) > new Date() ? `On hold` : formatDateShort(g.createdAt)}</span>
    </li>
  );
}

const STATUS: Record<string, string> = { requested: "Waiting", paid: "Paid", rejected: "Turned down" };

/**
 * Settings → Earnings: what gifts earned you (your share of each gift's value), what's on hold, available, asked for
 * and paid, and a "Request payout" (₦1,000 or more, to your bank). Requests made by the end of a month are paid on the
 * 3rd of the next.
 */
export function EarningsTab() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useApi(() => GiftService.earnings(), [], { key: "gift-earnings" });
  const banks = useApi(() => MoneyService.banks(), [], { key: "banks" });
  const [asking, setAsking] = useState(false);
  const [useSaved, setUseSaved] = useState(true);
  const [bankCode, setBankCode] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const list = banks.data ?? [];

  async function submit(e: React.FormEvent, d: GiftEarningsDTO) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const saved = useSaved && !!d.bank;
      const res = await GiftService.requestPayout(saved ? { useSaved: true } : { bankCode: bankCode || undefined, bankName: bankName.trim(), accountNumber: accountNumber.trim(), accountName: accountName.trim() || undefined });
      setData(res.data);
      setAsking(false);
      toast(`Payout requested. It will be paid on ${payoutDayLabel(res.data.nextPayoutOn)}.`, "success");
    } catch (err) {
      if (isApiError(err) && err.errors) setErrors(err.errors);
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function more(d: GiftEarningsDTO) {
    const last = d.history[d.history.length - 1];
    if (!last) return;
    const res = await GiftService.earnings(last.createdAt);
    setData({ ...d, history: [...d.history, ...res.data.history], hasMore: res.data.hasMore });
  }

  if (loading && !data) return <Skeleton className="h-64 w-full rounded-card" />;
  if (error || !data) return <ErrorState message={error} onRetry={reload} />;
  const t = data.totals;
  return (
    <div className="space-y-6">
      {earningText(data.earning) && (
        <p role="status" className="rounded-control border border-line bg-raised/60 px-4 py-3 text-sm">
          {earningText(data.earning)}
        </p>
      )}
      <p className="text-sm text-ink-muted">
        Once you qualify, when someone sends you an award, you earn {data.receiverPercent}% of its value. It&apos;s on hold for {data.holdDays} days, then you can ask for it to be paid to your bank. Requests made by the end of a month are paid on the 3rd of the next month.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Earned" value={naira(t.earned)} hint="All time" />
        <Stat label="On hold" value={naira(t.onHold)} hint={`${data.holdDays}-day hold`} />
        <Stat label="Available" value={naira(t.available)} hint={`From ${naira(data.minPayout)}`} />
        <Stat label="Paid so far" value={naira(t.paid)} hint={t.requested ? `${naira(t.requested)} waiting` : undefined} />
      </div>

      <section className="space-y-3 rounded-card border border-line bg-surface p-4">
        {data.waiting ? (
          <p className="text-sm">
            <span className="font-semibold">{naira(data.waiting.amount)}</span> will be paid on <span className="font-semibold">{payoutDayLabel(data.waiting.dueOn ?? data.nextPayoutOn)}</span> to {data.waiting.bank.bankName} {data.waiting.bank.accountNumber}.
          </p>
        ) : (
          <p className="text-sm">
            Next payout: <span className="font-semibold">{payoutDayLabel(data.nextPayoutOn)}</span>.{" "}
            {data.canRequest ? `Ask now and ${naira(t.available)} is paid then.` : data.earning.missing.country ? "Payouts aren't open where you live yet." : t.available > 0 ? `You need ${naira(data.minPayout - t.available)} more. Payouts start from ${naira(data.minPayout)}.` : "Nothing available yet."}
          </p>
        )}
        {!asking ? (
          <Button variant="primary" disabled={!data.canRequest} onClick={() => setAsking(true)}>
            Request payout
          </Button>
        ) : (
          <form onSubmit={(e) => void submit(e, data)} className="space-y-3">
            {data.bank && (
              <label className="flex items-center gap-2.5 text-sm">
                <input type="checkbox" checked={useSaved} onChange={(e) => setUseSaved(e.target.checked)} className="size-4 accent-[var(--accent-text)]" />
                <span>
                  Pay to {data.bank.accountName} · {data.bank.bankName} {data.bank.accountNumber}
                </span>
              </label>
            )}
            {(!useSaved || !data.bank) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {list.length ? (
                  <SelectField
                    label="Bank"
                    value={bankCode}
                    onChange={(e) => {
                      setBankCode(e.target.value);
                      setBankName(list.find((b) => b.code === e.target.value)?.name ?? "");
                    }}
                    error={errors.bankCode}
                  >
                    <option value="">Pick your bank</option>
                    {list.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.name}
                      </option>
                    ))}
                  </SelectField>
                ) : (
                  <TextField label="Bank" value={bankName} onChange={(e) => setBankName(e.target.value)} maxLength={80} error={errors.bankCode} />
                )}
                <TextField label="Account number" inputMode="numeric" maxLength={10} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))} error={errors.accountNumber} />
                {!list.length && <TextField label="Name on the account" value={accountName} onChange={(e) => setAccountName(e.target.value)} maxLength={120} error={errors.accountName} />}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setAsking(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={busy}>
                Ask for {naira(t.available)}
              </Button>
            </div>
          </form>
        )}
      </section>

      {data.payouts.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Payouts</h2>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {data.payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5 text-sm">
                <span className="font-mono font-semibold tabular-nums">{naira(p.amount)}</span>
                <span className={cx("rounded-full px-2 py-0.5 text-[12px] font-semibold", p.status === "paid" ? "bg-success/15 text-success" : p.status === "rejected" ? "bg-danger/15 text-danger" : "bg-raised text-ink-muted")}>{STATUS[p.status]}</span>
                <span className="min-w-0 flex-1 truncate text-ink-muted">{p.status === "requested" && p.dueOn ? `Paid on ${payoutDayLabel(p.dueOn)}` : p.status === "rejected" ? p.note : p.reference ? `Ref ${p.reference}` : ""}</span>
                <span className="text-xs text-ink-muted">{formatDateShort(p.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold">Awards you got</h2>
        {data.history.length === 0 ? (
          <p className="text-sm text-ink-muted">No awards yet. When someone sends one to your post, comment or board post, it shows here.</p>
        ) : (
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {data.history.map((g) => (
              <GiftLine key={g.id} g={g} />
            ))}
          </ul>
        )}
        {data.hasMore && (
          <Button size="sm" className="mt-2" onClick={() => void more(data)}>
            Show more
          </Button>
        )}
      </section>
    </div>
  );
}
