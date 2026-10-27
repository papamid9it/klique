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
import { SelectField, Switch, TextArea, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { relativeStamp } from "@/lib/format";
import { useApi, useNow } from "@/lib/hooks/useApi";
import type { CommunityMoneyDTO, DonationButtonDTO } from "@/lib/types";
import { GoalBar } from "./Donate";

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
const useMoney = (slug: string) => useApi(() => MoneyService.money(slug), [slug], { key: `money:${slug}` });

/** One donation button being added or changed. */
function ButtonForm({ slug, initial, onSaved, onCancel }: { slug: string; initial?: DonationButtonDTO; onSaved: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [goal, setGoal] = useState(initial?.goal ? String(initial.goal) : "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const input = { title: title.trim(), description: description.trim(), goal: goal.trim() ? Math.round(Number(goal)) : null, active };
      if (initial) await MoneyService.editButton(slug, initial.id, input);
      else await MoneyService.addButton(slug, input);
      toast("Saved", "success");
      onSaved();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3 rounded-card border border-line bg-raised/40 p-4">
      <TextField label="Button name" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="e.g. Ramp fund" hint="Long names are cut short on the button; the full name shows when someone opens it." required />
      <TextArea label="What it's for (optional)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} counter={300} />
      <TextField label="Goal (₦, optional)" type="number" inputMode="numeric" min={100} value={goal} onChange={(e) => setGoal(e.target.value)} hint="With a goal, people see a progress bar." />
      {initial && <Switch checked={active} onChange={setActive} label="Showing" hint="Hidden buttons keep what they raised." />}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={busy} disabled={!title.trim()}>
          {initial ? "Save" : "Add button"}
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

/** Settings → Donations: the community's donation buttons (up to 6), each with an optional goal. */
export function DonationsSettings({ slug }: { slug: string }) {
  const toast = useToast();
  const { data, loading, error, reload } = useMoney(slug);
  const [editing, setEditing] = useState<DonationButtonDTO | "new" | null>(null);
  if (loading && !data) return <Skeleton className="h-64 w-full rounded-card" />;
  if (error || !data) return <ErrorState message={error} onRetry={reload} />;

  async function remove(b: DonationButtonDTO) {
    try {
      await MoneyService.removeButton(slug, b.id);
      toast(b.raised ? "Hidden (it keeps what it raised)" : "Removed", "success");
      void reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        Gold Donate buttons show on your community for anyone who can see it. Donations can&apos;t be refunded. Klique keeps {data.fees.donationPercent}% and the rest builds your balance, which the owner can ask to have paid out.
        {!data.canTakePayments && <span className="mt-1 block font-semibold text-ink">Card payments aren&apos;t switched on yet, so people can&apos;t donate until they are.</span>}
      </p>
      {data.buttons.length === 0 && editing === null && (
        <EmptyState icon="heart" title="No donation buttons yet" compact action={<Button variant="primary" onClick={() => setEditing("new")}>Add a button</Button>}>
          One for general support, or one per cause with its own goal.
        </EmptyState>
      )}
      <ul className="space-y-2">
        {data.buttons.map((b) =>
          editing !== "new" && editing?.id === b.id ? (
            <li key={b.id}>
              <ButtonForm slug={slug} initial={b} onSaved={() => (setEditing(null), void reload())} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={b.id} className="rounded-card border border-line bg-surface p-4">
              <div className="flex items-start gap-3">
                <span className="btn-gold inline-flex size-9 shrink-0 items-center justify-center rounded-full">
                  <Icon name="heart" size={15} className="fill-current" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[15px] font-semibold">
                    {b.title} {!b.active && <Badge tone="neutral">Hidden</Badge>}
                  </p>
                  {b.description && <p className="text-[13px] text-ink-muted">{b.description}</p>}
                  {b.goal ? <GoalBar raised={b.raised} goal={b.goal} className="mt-2" /> : <p className="mt-1 font-mono text-[12px] text-ink-muted">{naira(b.raised)} from {b.donors} {b.donors === 1 ? "person" : "people"}</p>}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(b)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void remove(b)} aria-label={`Remove ${b.title}`}>
                    <Icon name="trash" size={14} />
                  </Button>
                </div>
              </div>
            </li>
          ),
        )}
      </ul>
      {editing === "new" ? (
        <ButtonForm slug={slug} onSaved={() => (setEditing(null), void reload())} onCancel={() => setEditing(null)} />
      ) : (
        data.buttons.length > 0 &&
        data.buttons.length < 6 && (
          <Button onClick={() => setEditing("new")}>
            <Icon name="plus" size={15} /> Add another button
          </Button>
        )
      )}
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
        <StatCard label="Donations" value={naira(data.totals.donations)} hint={`${data.buttons.filter((b) => b.active).length} buttons`} icon="heart" />
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
                  <span className="font-semibold">{p.user.displayName}</span> <span className="text-ink-muted">{p.kind === "donation" ? "donated to" : "chipped in for"}</span> {p.forTitle}
                </span>
                <span className="block font-mono text-[11px] text-ink-muted">{now ? relativeStamp(p.createdAt, now) : ""}</span>
              </span>
              <span className="font-mono text-[13px] font-semibold">{p.status === "refunded" ? <s className="text-ink-muted">{naira(p.amount)}</s> : naira(p.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-line p-4 text-sm text-ink-muted">
          Nothing yet.{" "}
          <Link href={`/communities/${slug}?settings=donations`} className="font-semibold text-accent-text hover:underline">
            Add a donation button
          </Link>{" "}
          or let people chip in toward an event.
        </p>
      )}
    </Panel>
  );
}
