"use client";

import Link from "next/link";
import { useState } from "react";
import { errorMessage, isApiError } from "@/app/ApiCore";
import { MoneyService } from "@/app/services/MoneyService";
import { Panel, StatCard } from "@/components/domain/admin/AdminParts";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/domain/admin/AdminParts";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { relativeStamp } from "@/lib/format";
import { useApi, useNow } from "@/lib/hooks/useApi";
import type { CommunityMoneyDTO } from "@/lib/types";

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
const useMoney = (slug: string) => useApi(() => MoneyService.money(slug), [slug], { key: `money:${slug}` });

/** How far a goal is: a bar, what's raised and the goal. */
function GoalBar({ raised, goal, className }: { raised: number; goal: number; className?: string }) {
  const pct = Math.min(100, Math.round((raised / goal) * 100));
  return (
    <div className={className}>
      <div className="h-2 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={raised} aria-label="Raised so far">
        <div className="h-full rounded-full bg-gradient-to-r from-[#e8b923] to-[#f7d774]" style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <p className="mt-1 flex justify-between font-mono text-[12px] text-ink-muted">
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

/** The payout form: the saved account, or a new one (its name comes from the bank when payments are set up). */
function PayoutForm({ slug, data, onDone }: { slug: string; data: CommunityMoneyDTO; onDone: (d: CommunityMoneyDTO) => void }) {
  const toast = useToast();
  const banks = useApi(() => MoneyService.banks(), [], { key: "banks" });
  const [useSaved, setUseSaved] = useState(!!data.bank);
  const [bankCode, setBankCode] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const list = banks.data ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const res = await MoneyService.requestPayout(slug, useSaved ? { useSaved: true } : { bankCode: bankCode || undefined, bankName: bankName.trim(), accountNumber: accountNumber.trim(), accountName: accountName.trim() || undefined });
      toast(`Payout of ${naira(data.available)} requested. We'll tell you when it's sent.`, "success");
      onDone(res.data);
    } catch (err) {
      if (isApiError(err) && err.errors) setErrors(err.errors);
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {data.bank && (
        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" checked={useSaved} onChange={(e) => setUseSaved(e.target.checked)} className="size-4 accent-[var(--accent-text)]" />
          <span>
            Pay to {data.bank.accountName} · {data.bank.bankName} {data.bank.accountNumber}
          </span>
        </label>
      )}
      {!useSaved && (
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
      {!useSaved && list.length > 0 && <p className="text-xs text-ink-muted">We check the account name with your bank before anything is sent.</p>}
      <Button type="submit" variant="primary" loading={busy} disabled={data.available < data.minPayout}>
        Ask for {naira(data.available)}
      </Button>
      {data.available < data.minPayout && <p className="text-xs text-ink-muted">The smallest payout is {naira(data.minPayout)}.</p>}
    </form>
  );
}

const STATUS: Record<string, { label: string; tone: "good" | "neutral" | "bad" }> = { requested: { label: "Waiting", tone: "neutral" }, paid: { label: "Paid", tone: "good" }, rejected: { label: "Turned down", tone: "bad" } };

/** Settings → Payouts: the balance, asking for it to be paid to a bank (the owner), and every payout so far. */
export function PayoutsSettings({ slug }: { slug: string }) {
  const { data, loading, error, reload, setData } = useMoney(slug);
  const now = useNow();
  if (loading && !data) return <Skeleton className="h-64 w-full rounded-card" />;
  if (error || !data) return <ErrorState message={error} onRetry={reload} />;
  const waiting = data.payouts.some((p) => p.status === "requested");
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Available" value={naira(data.available)} hint="After Klique's fee" icon="coin" />
        <StatCard label="Requested" value={naira(data.requested)} hint="Waiting to be sent" icon="clock" />
        <StatCard label="Paid out" value={naira(data.paidOut)} hint="So far" icon="check" />
      </div>
      <Panel title="Ask for a payout">
        <div className="p-4">
          {!data.canRequestPayout ? (
            <p className="text-sm text-ink-muted">Only the community&apos;s owner can ask for a payout.</p>
          ) : data.payoutsPaused ? (
            <p className="text-sm text-ink-muted">Payouts are paused by Klique for now. What your community raised is kept, and you can ask once they&apos;re back.</p>
          ) : waiting ? (
            <p className="text-sm text-ink-muted">A payout is on its way. You can ask again once it&apos;s been sent.</p>
          ) : (
            <PayoutForm slug={slug} data={data} onDone={setData} />
          )}
        </div>
      </Panel>
      <Panel title="Payouts">
        {data.payouts.length === 0 ? (
          <p className="p-4 text-sm text-ink-muted">None yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[14px] font-semibold">{naira(p.amount)}</span>
                  <span className="block truncate text-[12px] text-ink-muted">
                    {p.bank.bankName} {p.bank.accountNumber} · {now ? relativeStamp(p.createdAt, now) : ""}
                    {p.reference && ` · ref ${p.reference}`}
                  </span>
                  {p.status === "rejected" && p.note && <span className="block text-[12px] text-danger">{p.note}</span>}
                </span>
                <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <p className="text-xs text-ink-muted">
        Klique keeps {data.fees.donationPercent}% of donations and {data.fees.contributionPercent}% of contributions.{" "}
        <Link href="/terms/payments" className="font-semibold text-ink underline">
          Payment terms
        </Link>
      </p>
    </div>
  );
}

/** On the dashboard: what's come in, the balance, and the latest payments. */
export function MoneySummary({ slug }: { slug: string }) {
  const { data, loading } = useMoney(slug);
  const now = useNow();
  if (loading && !data) return <Skeleton className="h-40 w-full rounded-card" />;
  if (!data) return null;
  return (
    <Panel
      title="Money"
      action={
        <Link href={`/communities/${slug}?settings=payouts`} className="text-[13px] font-semibold text-accent-text hover:underline">
          Payouts
        </Link>
      }
    >
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        <StatCard label="Available" value={naira(data.available)} hint={data.requested ? `${naira(data.requested)} requested` : "After Klique's fee"} icon="coin" />
        <StatCard label="Causes" value={naira(data.totals.donations)} hint={`${data.buttons.filter((b) => b.active).length} running`} icon="heart" />
        <StatCard label="Contributions" value={naira(data.totals.contributions)} hint={`${naira(data.totals.last30)} in 30 days, all kinds`} icon="ticket" />
      </div>
      {data.buttons.some((b) => b.goal && b.active) && (
        <div className="space-y-3 border-t border-line px-4 py-3">
          {data.buttons
            .filter((b) => b.goal && b.active)
            .map((b) => (
              <div key={b.id}>
                <p className="text-[13px] font-semibold">{b.title}</p>
                <GoalBar raised={b.raised} goal={b.goal!} className="mt-1" />
              </div>
            ))}
        </div>
      )}
      {data.recent.length > 0 ? (
        <ul className="divide-y divide-line border-t border-line">
          {data.recent.slice(0, 8).map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar name={p.user.displayName} src={p.user.avatarUrl} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">
                  <span className="font-semibold">{p.user.displayName}</span> <span className="text-ink-muted">{p.kind === "donation" ? "gave to" : "chipped in for"}</span> {p.forTitle}
                </span>
                <span className="block font-mono text-[12px] text-ink-muted">{now ? relativeStamp(p.createdAt, now) : ""}</span>
              </span>
              <span className="font-mono text-[13px] font-semibold">{p.status === "refunded" ? <s className="text-ink-muted">{naira(p.amount)}</s> : naira(p.net)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-line p-4 text-sm text-ink-muted">
          Nothing yet.{" "}
          <Link href={`/communities/${slug}?settings=donations`} className="font-semibold text-accent-text hover:underline">
            Start a cause
          </Link>{" "}
          that members can give Hype to.
        </p>
      )}
    </Panel>
  );
}
