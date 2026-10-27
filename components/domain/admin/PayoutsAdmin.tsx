"use client";

import Link from "next/link";
import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { MoneyService } from "@/app/services/MoneyService";
import { Badge, Panel } from "@/components/domain/admin/AdminParts";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useApi } from "@/lib/hooks/useApi";
import type { MoneyConfig } from "@/lib/money";
import type { PayoutDTO } from "@/lib/types";

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });

/** One payout request: who, how much, where to send it; then Mark paid (with the transfer reference) or Turn down. */
function PayoutRow({ p, onDone }: { p: PayoutDTO; onDone: (p: PayoutDTO) => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<"paid" | "rejected" | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function decide() {
    if (!mode) return;
    setBusy(true);
    try {
      const res = await MoneyService.decidePayout(p.id, mode, mode === "paid" ? { reference: text } : { note: text });
      toast(mode === "paid" ? "Marked paid. The owner has been told." : "Turned down. The money is back in their balance.", "success");
      onDone(res.data);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-lg font-semibold">{naira(p.amount)}</p>
          <p className="text-[13px] text-ink-muted">
            <Link href={`/communities/${p.community?.slug}`} className="font-semibold text-ink hover:underline">
              {p.community?.name}
            </Link>{" "}
            · asked by @{p.requestedBy?.handle} · {day(p.createdAt)}
          </p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-control border border-line bg-raised/40 px-3 py-2 text-[13px]">
          <dt className="text-ink-muted">Bank</dt>
          <dd className="font-semibold">{p.bank.bankName}</dd>
          <dt className="text-ink-muted">Account</dt>
          <dd className="font-mono font-semibold select-all">{p.bank.accountNumber}</dd>
          <dt className="text-ink-muted">Name</dt>
          <dd className="font-semibold">{p.bank.accountName}</dd>
        </dl>
      </div>
      {p.status === "requested" ? (
        mode ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1">
              <TextField label={mode === "paid" ? "Transfer reference" : "Why (the owner sees this)"} value={text} onChange={(e) => setText(e.target.value)} maxLength={mode === "paid" ? 120 : 300} autoFocus />
            </div>
            <Button variant={mode === "paid" ? "primary" : "danger"} loading={busy} disabled={!text.trim()} onClick={() => void decide()} className="mb-0.5">
              {mode === "paid" ? "Mark paid" : "Turn down"}
            </Button>
            <Button onClick={() => (setMode(null), setText(""))} className="mb-0.5">
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={() => setMode("paid")}>
              I&apos;ve sent it
            </Button>
            <Button size="sm" onClick={() => setMode("rejected")}>
              Turn down
            </Button>
          </div>
        )
      ) : (
        <p className="flex items-center gap-2 text-[13px] text-ink-muted">
          <Badge tone={p.status === "paid" ? "good" : "bad"}>{p.status === "paid" ? "Paid" : "Turned down"}</Badge>
          {p.decidedAt && day(p.decidedAt)}
          {p.reference && <span className="font-mono">ref {p.reference}</span>}
          {p.note && <span>· {p.note}</span>}
        </p>
      )}
    </li>
  );
}

/** Payout requests by status. Waiting ones come oldest first. */
export function PayoutsList({ status }: { status: "requested" | "paid" | "rejected" }) {
  const { data, loading, error, reload, setData } = useApi(() => MoneyService.adminPayouts(status), [status], { key: `admin-payouts:${status}` });
  if (loading && !data) return <Skeleton className="h-64 w-full rounded-card" />;
  if (error || !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data.length)
    return (
      <EmptyState icon="coin" title={status === "requested" ? "Nothing waiting" : "None yet"}>
        {status === "requested" ? "When a community owner asks for their balance, it shows here with the bank details." : "Payouts show here once they're decided."}
      </EmptyState>
    );
  return (
    <Panel>
      <ul className="divide-y divide-line">
        {data.map((p) => (
          <PayoutRow key={p.id} p={p} onDone={(next) => setData((list) => (status === "requested" ? (list ?? []).filter((x) => x.id !== next.id) : (list ?? []).map((x) => (x.id === next.id ? next : x))))} />
        ))}
      </ul>
    </Panel>
  );
}

/** Klique's fees and the smallest payout. */
export function FeesSettings() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useApi(() => MoneyService.config(), [], { key: "admin-money-config" });
  const [draft, setDraft] = useState<MoneyConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const c = draft ?? data;
  if (loading && !c) return <Skeleton className="h-48 w-full rounded-card" />;
  if (error || !c) return <ErrorState message={error} onRetry={reload} />;
  const n = (v: string) => Number(v) || 0;

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      setData((await MoneyService.setConfig(draft)).data);
      setDraft(null);
      toast("Saved. Payments already made keep the fee they had.", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Fees">
      <div className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField label="Donations (%)" type="number" min={0} max={50} step={0.5} value={String(c.donationFeePercent)} onChange={(e) => setDraft({ ...c, donationFeePercent: n(e.target.value) })} />
          <TextField label="Contributions (%)" type="number" min={0} max={50} step={0.5} value={String(c.contributionFeePercent)} onChange={(e) => setDraft({ ...c, contributionFeePercent: n(e.target.value) })} />
          <TextField label="Smallest payout (₦)" type="number" min={100} value={String(c.minPayout)} onChange={(e) => setDraft({ ...c, minPayout: n(e.target.value) })} />
        </div>
        <p className="text-sm text-ink-muted">Klique&apos;s share of each payment. It&apos;s fixed when someone pays, so changing it never touches money already paid. A refunded contribution goes back minus this fee.</p>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => void save()} loading={busy} disabled={!draft}>
            Save
          </Button>
          {draft && <Button variant="ghost" onClick={() => setDraft(null)}>Undo</Button>}
        </div>
      </div>
    </Panel>
  );
}
