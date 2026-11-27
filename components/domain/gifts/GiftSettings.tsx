"use client";
import { ANDROID_APP_URL } from "@/lib/constants";

import { Icon } from "@/components/ui/Icon";
import { useEffect, useState } from "react";
import { usePayNames, usePayWith } from "@/components/domain/payments/PayWith";
import { errorMessage, isApiError } from "@/app/ApiCore";
import { GiftService } from "@/app/services/GiftService";
import { MoneyService } from "@/app/services/MoneyService";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { HypeCoin } from "./HypeCoin";
import { ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { formatDateShort } from "@/lib/format";
import { CRYPTO_NETWORKS, HYPE_NAIRA, hypeForNaira, payoutDayLabel, toUsd } from "@/lib/gifts";
import { useApi } from "@/lib/hooks/useApi";
import type { GiftEarningsDTO, GiftWalletDTO } from "@/lib/types";

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
  const [pick, setPick] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const payWith = usePayWith();
  const payNames = usePayNames();

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
      const res = await GiftService.topup(n, payWith.provider);
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
  // the pack picked (the second, usually 100 Hype, to start with); a typed amount takes over while it's valid
  const chosenNaira = pick ?? data.webPacks[1]?.naira ?? data.webPacks[0]?.naira ?? null;
  const buyNaira = typedOk ? typed : amount ? null : chosenNaira;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Your Hype" value={hype(data.balance)} hint={`1 Hype is ₦${HYPE_NAIRA}. Hype is only for sending awards.`} />
        <Stat label="Worth in awards" value={naira(data.balance * data.hypeNaira)} hint="Send awards to posts, comments and board posts you love." />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Top up</h2>
        {/* paying on the website is off (Admin → System): Hype is bought in the phone app */}
        {!data.canBuyWeb && (
          <p className="text-sm text-ink-muted">
            For now, buy Hype in the Klique app.{" "}
            <a href={ANDROID_APP_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent-text hover:underline">Get the app</a>
          </p>
        )}
        {/* pick a pack (or type an amount); nothing is charged until the button below, as on Plans */}
        <div role="radiogroup" aria-label="Choose a Hype pack" className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          {data.webPacks.map((p) => {
            const on = !typedOk && chosenNaira === p.naira;
            return (
              <button
                key={p.naira}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={busy !== null}
                onClick={() => (setAmount(""), setPick(p.naira))}
                className={cx("relative flex min-h-24 flex-col justify-between rounded-card border-2 p-3 text-left transition disabled:opacity-50", on ? "border-accent-text bg-raised" : "border-line bg-surface hover:border-ink-muted/50")}
              >
                <span className="flex items-start justify-between">
                  <span className="eyebrow">Hype</span>
                  <span className={cx("inline-flex size-5 items-center justify-center rounded-full", on ? "bg-accent-text text-canvas" : "border-2 border-line")} aria-hidden="true">
                    {on && <Icon name="check" size={12} />}
                  </span>
                </span>
                <span>
                  <span className="block font-mono text-xl font-semibold tabular-nums">{p.hype.toLocaleString("en-NG")}</span>
                  <span className="block text-xs text-ink-muted">{naira(p.naira)}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="w-48">
          <TextField label="Or any amount (₦)" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} placeholder="2500" />
        </div>
        {data.canBuyWeb && payWith.picker}
        <Button type="button" variant="primary" className="w-full" disabled={!data.canBuyWeb || !buyNaira || busy !== null} loading={busy !== null} onClick={() => buyNaira && void buy(buyNaira)}>
          {buyNaira ? `Get ${hype(hypeForNaira(buyNaira))} · ${naira(buyNaira)}` : "Pick a pack"}
        </Button>
        <p className="text-xs text-ink-muted">
          Any amount from {naira(data.customMin)} to {naira(data.customMax)}, in steps of ₦{HYPE_NAIRA}. Paid securely with {payNames}. Hype can&apos;t be refunded or cashed out. See the{" "}
          <a href="/terms/payments#gifts" className="underline">
            payment terms
          </a>
          .
        </p>
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
  // outside Nigeria: USDT to a wallet
  const [network, setNetwork] = useState<string>(CRYPTO_NETWORKS[0].id);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rules, setRules] = useState(false);
  const list = banks.data ?? [];

  async function submit(e: React.FormEvent, d: GiftEarningsDTO) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const saved = useSaved && !!d.bank;
      const res = await GiftService.requestPayout(saved ? { useSaved: true } : d.abroad ? { network: network as "usdt-trc20" | "usdt-bep20", address: address.trim() } : { bankCode: bankCode || undefined, bankName: bankName.trim(), accountNumber: accountNumber.trim(), accountName: accountName.trim() || undefined });
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

  if (loading && !data) return <Skeleton className="h-64 w-full rounded-card" />;
  if (error || !data) return <ErrorState message={error} onRetry={reload} />;
  const t = data.totals;
  // outside Nigeria everything shows in dollars (Google Play's rate) and is paid in USDT to a wallet
  const abroad = !!data.abroad;
  const money = (n: number) => (abroad && data.usdRate ? `$${toUsd(n, data.usdRate).toFixed(2)}` : naira(n));
  const e = data.earning;
  const tone = data.paused ? "muted" : e.eligible ? "good" : "wait";
  const line = data.waiting
    ? `${data.waiting.usd ? `$${data.waiting.usd.toFixed(2)}` : naira(data.waiting.amount)} is being paid on ${payoutDayLabel(data.waiting.dueOn ?? data.nextPayoutOn)}`
    : abroad && !data.usdRate
      ? "Dollar payouts aren't set up yet"
      : data.canRequest
        ? `Paid on ${payoutDayLabel(data.nextPayoutOn)} if you ask now`
        : e.missing.country
          ? "Payouts aren't open where you live yet"
          : t.available > 0
            ? `Payouts start from ${money(data.minPayout)}`
            : "Nothing ready yet";
  return (
    <div className="mx-auto max-w-xl space-y-6">
      {/* the balance, big, in the middle (like Cash App): where you stand, what's ready, when it's paid, one button */}
      <section className="flex flex-col items-center pt-2 text-center">
        <button
          type="button"
          onClick={() => setRules(true)}
          className={cx(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold",
            tone === "good" ? "bg-success/15 text-success" : tone === "wait" ? "bg-[#F5B83D]/15 text-[#C98B12]" : "bg-raised text-ink-muted",
          )}
        >
          <span className={cx("size-[7px] rounded-full", tone === "good" ? "bg-success" : tone === "wait" ? "bg-[#F5B83D]" : "bg-ink-muted")} />
          {data.paused ? "Earning is paused" : e.eligible ? `You're earning · ${data.receiverPercent}% of each award` : "Not earning yet · see why"}
        </button>
        <p className="mt-5 text-sm text-ink-muted">Available to pay out</p>
        <p className="mt-1 flex items-center gap-2.5">
          <HypeCoin size={34} />
          <span className="text-[44px] leading-none font-extrabold tracking-tight tabular-nums">{money(t.available)}</span>
        </p>
        <p className="mt-2 text-sm text-ink-muted">{line}</p>
        <button type="button" onClick={() => setRules(true)} className="mt-1 text-[13px] font-semibold text-ink-muted underline underline-offset-2 hover:text-ink">
          How earning works
        </button>
      </section>

      {!asking ? (
        <Button variant="primary" size="lg" className="w-full" disabled={!data.canRequest} onClick={() => setAsking(true)}>
          Request payout
        </Button>
      ) : (
        <section className="space-y-3 rounded-card border border-line bg-surface p-4">
          <h2 className="text-[15px] font-semibold">Request {money(t.available)}</h2>
          <form onSubmit={(e) => void submit(e, data)} className="space-y-3">
              {data.bank && (
                <label className="flex items-center gap-2.5 text-sm">
                  <input type="checkbox" checked={useSaved} onChange={(e) => setUseSaved(e.target.checked)} className="size-4 accent-[var(--accent-text)]" />
                  <span>
                    Pay to {data.bank.accountName} · {data.bank.bankName} {data.bank.accountNumber}
                  </span>
                </label>
              )}
              {(!useSaved || !data.bank) && abroad ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField label="Network" value={network} onChange={(e) => setNetwork(e.target.value)} error={errors.network}>
                    {CRYPTO_NETWORKS.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                  </SelectField>
                  <TextField label="Your wallet address" value={address} onChange={(e) => setAddress(e.target.value.trim())} maxLength={64} placeholder={CRYPTO_NETWORKS.find((n) => n.id === network)?.example} error={errors.address} hint="Copy it from your wallet or exchange. Check the network matches: USDT sent on the wrong network can be lost." />
                </div>
              ) : (!useSaved || !data.bank) && (
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
                  Ask for {money(t.available)}
                </Button>
              </div>
            </form>
        </section>
      )}

      {/* the rest in one strip */}
      <div className="grid grid-cols-3 divide-x divide-line rounded-card border border-line">
        {[
          { label: "On hold", value: money(t.onHold), hint: `${data.holdDays}-day hold` },
          { label: "Paid so far", value: money(t.paid), hint: t.requested ? `${money(t.requested)} waiting` : "\u00a0" },
          { label: "All time", value: money(t.earned), hint: "Earned" },
        ].map((x) => (
          <div key={x.label} className="min-w-0 p-3">
            <p className="text-[12px] text-ink-muted">{x.label}</p>
            <p className="mt-0.5 truncate text-[17px] font-bold tabular-nums">{x.value}</p>
            <p className="truncate text-[12px] text-ink-muted">{x.hint}</p>
          </div>
        ))}
      </div>

      {data.payouts.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Payouts</h2>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {data.payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5 text-sm">
                <span className="font-mono font-semibold tabular-nums">{(p.usd ? `$${p.usd.toFixed(2)}` : naira(p.amount))}</span>
                <span className={cx("rounded-full px-2 py-0.5 text-[12px] font-semibold", p.status === "paid" ? "bg-success/15 text-success" : p.status === "rejected" ? "bg-danger/15 text-danger" : "bg-raised text-ink-muted")}>{STATUS[p.status]}</span>
                <span className="min-w-0 flex-1 truncate text-ink-muted">{p.status === "requested" && p.dueOn ? `Paid on ${payoutDayLabel(p.dueOn)}` : p.status === "rejected" ? p.note : p.reference ? `Ref ${p.reference}` : ""}</span>
                <span className="text-xs text-ink-muted">{formatDateShort(p.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <EarningRules open={rules} d={data} onClose={() => setRules(false)} />
    </div>
  );
}

/** "How earning works": your checklist (points, time on Klique, country), then the rules in short lines. */
function EarningRules({ open, d, onClose }: { open: boolean; d: GiftEarningsDTO; onClose: () => void }) {
  const e = d.earning;
  const abroad = !!d.abroad;
  const money = (n: number) => (abroad && d.usdRate ? `$${toUsd(n, d.usdRate).toFixed(2)}` : naira(n));
  const where = e.countries.length === 1 && e.countries[0] === "NG" ? "Nigeria" : `${e.countries.length} countries`;
  const checks = [
    { ok: !e.missing.points, label: `${e.minPoints.toLocaleString("en-NG")} points`, have: `You have ${e.points.toLocaleString("en-NG")}` },
    { ok: !e.missing.months, label: `${e.minMonths} ${e.minMonths === 1 ? "month" : "months"} on Klique`, have: e.months === 0 ? "You joined less than a month ago" : `You joined ${e.months} ${e.months === 1 ? "month" : "months"} ago` },
    { ok: !e.missing.country, label: `Living in ${where}`, have: "Your country is in Settings, Profile" },
  ];
  const rules = [
    `You earn ${d.receiverPercent}% of every award people send you: on posts, comments, board posts and live streams.`,
    "Awards you get before you qualify still show, but they never earn, even after you qualify.",
    `What you earn is on hold for ${d.holdDays} days, then it's available.`,
    `Ask for a payout from ${money(d.minPayout)}. One request at a time.`,
    `Requests made by the end of a month are paid on the 3rd of the next month, ${abroad ? "in USDT to your crypto wallet (TRC-20 or BEP-20), in dollars at Google Play's rate" : "to your Nigerian bank account"}.`,
    "Awards can't be refunded once they're sent.",
    "Klique can pause earning for everyone. What you've earned is always kept.",
  ];
  return (
    <Modal open={open} onClose={onClose} title="How earning works">
      <div className="space-y-5">
        {d.paused && <p className="text-sm">Earning from awards is paused for now. Awards still show, but they don&apos;t earn, and payouts can&apos;t be asked for. What you&apos;ve earned so far is kept.</p>}
        <div>
          <p className="mb-1 text-[13px] font-semibold text-ink-muted">To earn, you need</p>
          <ul>
            {checks.map((c) => (
              <li key={c.label} className="flex items-center gap-3 py-2">
                <span className={cx("inline-flex size-6 shrink-0 items-center justify-center rounded-full", c.ok ? "bg-success text-white" : "bg-raised text-ink-muted")}>
                  <Icon name={c.ok ? "check" : "x"} size={13} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold">{c.label}</span>
                  <span className="block text-[13px] text-ink-muted">{c.have}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink-muted">The rules</p>
          <ol className="space-y-2">
            {rules.map((r, i) => (
              <li key={i} className="flex gap-2.5 text-[14px] leading-[20px]">
                <span className="font-bold text-ink-muted">{i + 1}.</span>
                <span>{r}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose}>Got it</Button>
        </div>
      </div>
    </Modal>
  );
}
