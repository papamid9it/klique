"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, isApiError } from "@/app/ApiCore";
import { CommunityService, type CauseInput } from "@/app/services/CommunityService";
import { GiftService } from "@/app/services/GiftService";
import { HypeCoin } from "@/components/domain/gifts/HypeCoin";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Switch, TextArea, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ImageField } from "@/components/ui/ImageField";
import { Modal } from "@/components/ui/Modal";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { useApi } from "@/lib/hooks/useApi";
import { CAUSE_PRESETS, MAX_CAUSE_GIFT } from "@/lib/money";
import { HYPE_NAIRA } from "@/lib/gifts";
import type { CauseDTO, CauseSupporterDTO, CommunityDTO } from "@/lib/types";

/*
 * Causes: what a community raises Hype for (they replaced donations). The main one sits in the community's left panel
 * (and beside its Posts); "All causes" lists up to 3; a cause opens a popup to give any amount of Hype. A gift is never
 * refunded, and Klique keeps its share (Admin → Money). The owner and admins make them in Settings → Causes.
 */

const hype = (n: number) => n.toLocaleString("en-NG");
const newKey = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

/** How far a cause is: a gold bar, and so much of its goal in Hype. */
export function CauseBar({ cause, compact, className }: { cause: Pick<CauseDTO, "raisedHype" | "goalHype">; compact?: boolean; className?: string }) {
  if (!cause.goalHype) return compact ? null : <p className={cx("font-mono text-[12px] text-ink-muted", className)}>{hype(cause.raisedHype)} Hype given</p>;
  const pct = Math.min(100, Math.round((cause.raisedHype / cause.goalHype) * 100));
  return (
    <div className={className}>
      <div className="h-1.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={cause.goalHype} aria-valuenow={cause.raisedHype} aria-label="Given so far">
        <div className="h-full rounded-full bg-[#F5B83D]" style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      {!compact && (
        <p className="mt-1 flex justify-between font-mono text-[12px] text-ink-muted">
          <span>{hype(cause.raisedHype)} of {hype(cause.goalHype)} Hype</span>
          <span>{pct}%</span>
        </p>
      )}
    </div>
  );
}

/** The main cause as a button (its own words and its bar), and "All causes" when there are more. */
export function CauseButtons({ c, compact }: { c: CommunityDTO; compact?: boolean }) {
  const { requireAuth } = useAuth();
  const [open, setOpen] = useState<CauseDTO | "all" | null>(null);
  const main = c.mainCause;
  if (!main || c.locked || c.explicit) return null;
  return (
    <section aria-label={`Support ${c.name}`} className={cx(!compact && "rounded-card border border-line bg-surface p-3")}>
      <button type="button" onClick={() => requireAuth() && setOpen(main)} className="flex w-full items-center gap-2.5 rounded-[10px] border border-line bg-raised/60 px-3 py-2 text-left transition hover:bg-raised">
        <HypeCoin size={18} className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold">{main.label}</span>
          <CauseBar cause={main} compact className="mt-1" />
        </span>
        <span className="shrink-0 rounded-full bg-ink px-2.5 py-1 text-[12px] font-semibold text-canvas">{main.verb}</span>
      </button>
      {(c.causeCount ?? 0) > 1 && (
        <button type="button" onClick={() => setOpen("all")} className="mt-1.5 px-1 text-[12.5px] font-semibold text-ink-muted hover:text-ink">
          All causes ({c.causeCount})
        </button>
      )}
      {open === "all" ? <CausesModal c={c} onPick={(x) => setOpen(x)} onClose={() => setOpen(null)} /> : open ? <GiveModal c={c} cause={open} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}

/** Up to 3 causes; one opens its give popup. */
function CausesModal({ c, onPick, onClose }: { c: CommunityDTO; onPick: (x: CauseDTO) => void; onClose: () => void }) {
  const { data, loading, error, reload } = useApi(() => CommunityService.causes(c.slug), [c.slug], { key: `causes:${c.slug}` });
  return (
    <Modal open onClose={onClose} title="Causes" description={`What ${c.name} is raising Hype for`} size="sm">
      {loading && !data ? <RowSkeleton rows={3} /> : error || !data ? <ErrorState message={error} onRetry={reload} /> : (
        <ul className="space-y-2">
          {data.items.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => onPick(x)} className={cx("w-full rounded-card border p-3 text-left transition hover:bg-raised", x.main ? "border-ink" : "border-line")}>
                <span className="flex items-center gap-3">
                  {x.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={x.imageUrl} alt="" className="size-11 shrink-0 rounded-control object-cover" />
                  ) : (
                    <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-control bg-raised"><HypeCoin size={20} /></span>
                  )}
                  <span className="min-w-0 flex-1">
                    {x.main && <span className="mb-0.5 inline-block rounded-[5px] bg-ink px-1.5 font-mono text-[10.5px] font-semibold text-canvas">MAIN</span>}
                    <span className="block truncate text-[14px] font-semibold">{x.title}</span>

                  </span>
                </span>
                <CauseBar cause={x} className="mt-2.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/** One cause: what it's for, how far it is, and giving any amount of Hype (with a way to get more). */
function GiveModal({ c, cause: start, onClose }: { c: CommunityDTO; cause: CauseDTO; onClose: () => void }) {
  const toast = useToast();
  const info = useApi(() => CommunityService.causes(c.slug), [c.slug], { key: `causes:${c.slug}` });
  const wallet = useApi(() => GiftService.wallet(), [], { key: "hype-wallet" });
  const [cause, setCause] = useState(start);
  const [amount, setAmount] = useState("250");
  const [anonymous, setAnonymous] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const key = useRef(newKey());
  const n = Math.floor(Number(amount.replace(/[^\d]/g, "")) || 0);
  const balance = info.data?.balance ?? null;
  const fee = info.data?.feePercent ?? 20;
  const short = balance !== null && n > balance;
  const bad = n < 1 ? "Give at least 1 Hype." : n > MAX_CAUSE_GIFT ? `Up to ${hype(MAX_CAUSE_GIFT)} Hype at once.` : null;

  async function give() {
    if (bad || busy || !agree) return;
    setBusy(true);
    try {
      const res = await CommunityService.giveToCause(c.slug, cause.id, { hype: n, clientKey: key.current, anonymous, agree: true });
      setCause(res.data.cause);
      info.setData((d) => (d ? { ...d, balance: res.data.balance } : d));
      toast(`Thank you: ${hype(n)} Hype to ${cause.title}`, "success");
      key.current = newKey();
      onClose();
    } catch (e) {
      key.current = newKey();
      toast(isApiError(e) && e.code === "not_enough_hype" ? "Not enough Hype. Get some below." : errorMessage(e), "error");
    }
    setBusy(false);
  }
  // short: the smallest pack that covers it (or exactly what's missing), on the payment page; back here after
  async function getHype() {
    const w = wallet.data;
    if (!w || balance === null) return;
    const need = n - balance;
    const pack = w.webPacks.find((p) => p.hype >= need);
    const naira = pack?.naira ?? Math.min(w.customMax, Math.max(w.customMin, need * HYPE_NAIRA));
    try {
      const res = await GiftService.topup(naira, undefined, window.location.pathname + window.location.search);
      window.location.href = res.data.authorizationUrl;
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <Modal open onClose={onClose} title={cause.title} description={c.name} size="md">
      <div className="space-y-4">
        {cause.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cause.imageUrl} alt="" className="h-40 w-full rounded-card object-cover" />
        )}
        {cause.description && <p className="text-[14px] leading-relaxed whitespace-pre-line text-ink-muted">{cause.description}</p>}
        <CauseBar cause={cause} />
        <div>
          <label htmlFor="cause-amount" className="mb-1.5 block text-[13px] font-medium">Hype to give</label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-control border border-line bg-raised px-3">
              <HypeCoin size={18} />
              <input id="cause-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, "").slice(0, 6))} className="min-w-0 flex-1 bg-transparent font-mono text-[16px] font-semibold outline-none" aria-describedby="cause-note" />
            </div>
            {CAUSE_PRESETS.map((p) => (
              <button key={p} type="button" onClick={() => setAmount(String(p))} aria-pressed={n === p} className={cx("h-11 rounded-control border px-3 font-mono text-[13px] font-semibold transition", n === p ? "border-ink bg-ink text-canvas" : "border-line hover:bg-raised")}>
                {hype(p)}
              </button>
            ))}
          </div>
          <p id="cause-note" className="mt-1.5 flex flex-wrap justify-between gap-2 text-[12.5px] text-ink-muted">
            <span>{balance === null ? "" : `Your balance: ${hype(balance)} Hype`}</span>
            <span>{bad ?? (info.data?.toKlique ? "All of it supports Klique" : `The community gets ${hype(Math.floor((n * (100 - fee)) / 100))} of it (${100 - fee}%)`)}</span>
          </p>
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="size-4 accent-[var(--color-accent-text)]" />
          Give anonymously
        </label>
        <label className="flex items-start gap-2 text-[13px]">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-accent-text)]" />
          <span>
            {info.data?.toKlique ? "I understand this is a gift to support Klique, not a purchase: it can't be refunded." : `I understand this is a gift to the community, not a purchase: it can't be refunded. Klique keeps ${fee}%.`}{" "}
            <Link href="/terms/payments#causes" className="underline">Terms</Link>
          </span>
        </label>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          {short ? (
            <Button variant="primary" disabled={!wallet.data?.canBuyWeb || !!bad} onClick={() => void getHype()}>
              {wallet.data && !wallet.data.canBuyWeb ? "Buy Hype in the app" : `Get ${hype(Math.max(1, n - (balance ?? 0)))} more Hype`}
            </Button>
          ) : (
            <Button variant="primary" loading={busy} disabled={!!bad || !agree} onClick={() => void give()}>
              {cause.verb} {hype(n)} Hype
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Settings → Causes (owner and admins): up to 3, one main; locked until the community is big and old enough. */
export function CausesSettings({ c }: { c: CommunityDTO }) {
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => CommunityService.causes(c.slug), [c.slug], { key: `causes:${c.slug}` });
  const [editing, setEditing] = useState<CauseDTO | "new" | null>(null);
  const [supportersOf, setSupportersOf] = useState<CauseDTO | null>(null);
  if (loading && !data) return <RowSkeleton rows={3} />;
  if (error || !data) return <ErrorState message={error} onRetry={reload} />;
  async function end(x: CauseDTO) {
    if (!window.confirm(`End “${x.title}”? People can't give to it any more. What was given stays yours.`)) return;
    try {
      await CommunityService.endCause(c.slug, x.id);
      toast("Cause ended", "success");
      void reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-[13.5px] leading-relaxed text-ink-muted">
        {data.toKlique ? "Klique HQ's causes support Klique itself: everything given is Klique's, with nothing to pay out." : `Members give Hype to what you're raising for. Your community gets ${100 - data.feePercent}% of it, paid to your bank with your other payouts.`} Up to {data.max} causes; the main one shows in the community&apos;s left panel and beside its posts. Gifts can&apos;t be refunded.
      </p>
      {!data.unlocked ? (
        <EmptyState icon="lock" title="Not open yet">
          Causes open once your community has {hype(data.unlock.members)} members and is {data.unlock.days} days old.
        </EmptyState>
      ) : (
        <>
          {data.items.length === 0 ? (
            <EmptyState icon="heart" title="No causes yet">Start one: a venue fund, new gear, or just keeping the community going.</EmptyState>
          ) : (
            <ul className="divide-y divide-line rounded-card border border-line bg-surface">
              {data.items.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold">{x.main && <span className="mr-1.5 rounded-[5px] bg-ink px-1.5 font-mono text-[10.5px] text-canvas">MAIN</span>}{x.title}</p>
                    <p className="truncate text-[12.5px] text-ink-muted">Button: {x.label} · {x.verb}</p>
                    <CauseBar cause={x} className="mt-1.5" />
                    {/* only the people who run it see who gave */}
                    <button type="button" onClick={() => setSupportersOf(x)} className="mt-1.5 text-[12.5px] font-semibold text-ink-muted hover:text-ink">
                      {x.supporters ?? 0} {x.supporters === 1 ? "supporter" : "supporters"} ›
                    </button>
                  </div>
                  <Button size="sm" onClick={() => setEditing(x)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => void end(x)}>End</Button>
                </li>
              ))}
            </ul>
          )}
          {data.items.length < data.max && (
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Icon name="plus" size={15} /> Start a cause
            </Button>
          )}
        </>
      )}
      {supportersOf && <SupportersModal c={c} cause={supportersOf} onClose={() => setSupportersOf(null)} />}
      {editing && <CauseForm c={c} cause={editing === "new" ? null : editing} first={!data.items.length} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), void reload())} />}
    </div>
  );
}

function CauseForm({ c, cause, first, onClose, onSaved }: { c: CommunityDTO; cause: CauseDTO | null; first: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [label, setLabel] = useState(cause?.label ?? "");
  const [verb, setVerb] = useState(cause?.verb ?? "Give");
  const [title, setTitle] = useState(cause?.title ?? "");
  const [description, setDescription] = useState(cause?.description ?? "");
  const [imageUrl, setImageUrl] = useState(cause?.imageUrl ?? "");
  const [hasGoal, setHasGoal] = useState(cause ? cause.goalHype !== null : true);
  const [goal, setGoal] = useState(cause?.goalHype ? String(cause.goalHype) : "");
  const [main, setMain] = useState(cause?.main ?? first);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const goalHype = hasGoal ? Math.floor(Number(goal.replace(/[^\d]/g, "")) || 0) : null;
    if (hasGoal && (!goalHype || goalHype < 10)) return setErrors({ goalHype: "A goal of at least 10 Hype, or pick No goal." });
    if (!/^\p{L}{2,12}$/u.test(verb.trim())) return setErrors({ verb: "One word, letters only (up to 12)." });
    const input: CauseInput = { label: label.trim(), verb: verb.trim(), title: title.trim(), description: description.trim(), imageUrl: imageUrl || null, goalHype, main };
    setBusy(true);
    setErrors({});
    try {
      await CommunityService.saveCause(c.slug, input, cause?.id);
      toast(cause ? "Cause saved" : "Cause started", "success");
      onSaved();
    } catch (err) {
      if (isApiError(err) && err.errors) setErrors(err.errors);
      toast(errorMessage(err), "error");
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={cause ? "Edit cause" : "Start a cause"} size="md">
      <form onSubmit={save} className="space-y-4" noValidate>
        <TextField label="Button name" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder="Support the venue fund" error={errors.label} hint="What the button says, in your community's left panel." />
        <div>
          <TextField label="Button word" value={verb} onChange={(e) => setVerb(e.target.value.replace(/\s/g, "").slice(0, 12))} maxLength={12} error={errors.verb} hint="One word on the button people press." />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["Give", "Donate", "Support", "Back", "Fund"].map((w) => (
              <button key={w} type="button" onClick={() => setVerb(w)} aria-pressed={verb === w} className={cx("h-8 rounded-full border px-3 text-[13px] font-semibold transition", verb === w ? "border-ink bg-ink text-canvas" : "border-line hover:bg-raised")}>
                {w}
              </button>
            ))}
          </div>
        </div>
        <TextField label="What it's for" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="Venue fund for December" error={errors.title} />
        <TextArea label="Tell people about it" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} counter={300} error={errors.description} />
        <ImageField kind="photo" label="Picture (optional)" value={imageUrl} onChange={setImageUrl} error={errors.imageUrl} reposition={{ aspect: 16 / 9 }} />
        <div>
          <p className="mb-1.5 text-[13px] font-medium">Goal</p>
          <div role="radiogroup" aria-label="Goal" className="flex gap-2">
            {[true, false].map((g) => (
              <button key={String(g)} type="button" role="radio" aria-checked={hasGoal === g} onClick={() => setHasGoal(g)} className={cx("h-9 rounded-full border px-4 text-sm font-semibold transition", hasGoal === g ? "border-ink bg-ink text-canvas" : "border-line hover:bg-raised")}>
                {g ? "A goal" : "No goal"}
              </button>
            ))}
          </div>
          {hasGoal && <TextField label="Goal in Hype" inputMode="numeric" value={goal} onChange={(e) => setGoal(e.target.value.replace(/[^\d]/g, "").slice(0, 9))} placeholder="10000" error={errors.goalHype} className="mt-2" />}
        </div>
        <Switch checked={main} onChange={setMain} label="Main cause" hint="Shown in your community's left panel. Only one can be the main one." />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>{cause ? "Save" : "Start this cause"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Who gave to a cause (owner and admins only), newest first; more load as you scroll to the end. */
function SupportersModal({ c, cause, onClose }: { c: CommunityDTO; cause: CauseDTO; onClose: () => void }) {
  const toast = useToast();
  const [items, setItems] = useState<CauseSupporterDTO[]>([]);
  const [next, setNext] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (after?: string | null) => {
    setBusy(true);
    try {
      const r = (await CommunityService.causeSupporters(c.slug, cause.id, after)).data;
      setItems((list) => [...list, ...r.items.filter((x) => !list.some((y) => y.id === x.id))]);
      setNext(r.nextCursor);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    setBusy(false);
  }, [c.slug, cause.id, toast]);
  useEffect(() => void load(), [load]);
  const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <Modal open onClose={onClose} title="Supporters" description={`${cause.title} · ${cause.supporters ?? 0} ${cause.supporters === 1 ? "person" : "people"}`} size="sm">
      <div
        className="max-h-[60vh] overflow-y-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (next && !busy && el.scrollTop + el.clientHeight > el.scrollHeight - 80) void load(next);
        }}
      >
        {items.length === 0 && busy ? <RowSkeleton rows={4} /> : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">Nobody has given yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((x) => (
              <li key={x.id} className="flex items-center gap-3 py-2.5">
                {x.user ? <Avatar name={x.user.displayName} src={x.user.avatarUrl} size={32} /> : <span className="inline-flex size-8 items-center justify-center rounded-full bg-raised text-ink-muted"><Icon name="user" size={15} /></span>}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{x.user ? x.user.displayName : "Someone"}</span>
                  <span className="block text-[12px] text-ink-muted">{x.anonymous ? "Gave anonymously · " : ""}{when(x.at)}</span>
                </span>
                <span className="flex items-center gap-1 font-mono text-sm font-semibold"><HypeCoin size={14} />{hype(x.hype)}</span>
              </li>
            ))}
          </ul>
        )}
        {busy && items.length > 0 && <p className="py-3 text-center text-[12.5px] text-ink-muted">Loading more…</p>}
      </div>
    </Modal>
  );
}
