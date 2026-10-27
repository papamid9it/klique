"use client";

import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { PointsService } from "@/app/services/PointsService";
import { Badge, Panel, Segmented, StatCard } from "@/components/domain/admin/AdminParts";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { UserName } from "@/components/ui/UserName";
import { FRAMES, NAME_EFFECTS } from "@/lib/cosmetics";
import { formatPrice } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import { POINT_ACTIONS, type PointsConfig } from "@/lib/points";
import type { AdminWalletUserDTO } from "@/lib/types";
import { STYLE_KINDS, type StyleKey, type StyleKind, type WalletConfig } from "@/lib/wallet";

const n = (v: number) => v.toLocaleString("en-NG");
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
const num = (v: string, min = 0) => Math.max(min, Math.round(Number(v) || 0));

/** Sales: money in, Hype sold, Hype people hold, designs being worn, recent purchases. */
export function HypeOverview() {
  const { data, loading, error, reload } = useApi(() => PointsService.adminOverview(), [], { key: "admin-hype" });
  if (loading) return <Skeleton className="h-72 w-full rounded-card" />;
  if (error || !data) return <ErrorState message={error} onRetry={reload} />;
  const { sales } = data;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sold · 30 days" value={formatPrice(sales.last30.amount, "NGN")} hint={`${n(sales.last30.count)} packs · all time ${formatPrice(sales.all.amount, "NGN")}`} icon="coin" />
        <StatCard label="Hype sold · 30 days" value={sales.last30.hype} hint={`All time ${n(sales.all.hype)}`} icon="asterisk" />
        <StatCard label="Hype people hold" value={data.outstanding} hint="Bought or given, not yet spent" icon="users" />
        <StatCard label="Designs unlocked" value={data.activeUnlocks} hint="Paid with Hype, running now" icon="lock" />
      </div>
      <Panel title="Recent purchases">
        {data.recent.length === 0 ? (
          <div className="p-6">
            <EmptyState icon="coin" title="No purchases yet">When someone buys Hype, it shows here.</EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {data.recent.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar name={p.user?.displayName ?? "?"} src={p.user?.avatarUrl ?? null} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{p.user ? `@${p.user.handle}` : "Deleted account"}</span>
                  <span className="block font-mono text-[11px] text-ink-muted">{day(p.paidAt ?? p.createdAt)}</span>
                </span>
                <span className="font-mono text-sm">{n(p.hype)} Hype</span>
                <span className="w-20 text-right font-mono text-sm">{formatPrice(p.amount, "NGN")}</span>
                <Badge tone={p.status === "paid" ? "good" : "neutral"}>{p.status === "paid" ? "Paid" : "Not paid"}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/** Hype packs on sale, how long an unlock lasts, and what each design costs. */
export function HypePricing() {
  const toast = useToast();
  const { user } = useAuth();
  const { data, loading, error, reload, setData } = useApi(() => PointsService.adminConfig(), [], { key: "admin-wallet-config" });
  const [draft, setDraft] = useState<WalletConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const c = draft ?? data;
  if (loading) return <Skeleton className="h-96 w-full rounded-card" />;
  if (error || !c) return <ErrorState message={error} onRetry={reload} />;
  const set = (next: Partial<WalletConfig>) => setDraft({ ...c, ...next });
  const setPrice = (key: StyleKey, v: string) => {
    const prices = { ...c.prices };
    if (v === "") delete prices[key];
    else prices[key] = num(v);
    set({ prices });
  };

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await PointsService.setConfig(draft);
      setData(res.data);
      setDraft(null);
      toast("Saved. New unlocks and purchases use these; ones already bought keep their end date.", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  }

  const designs: { key: StyleKey; label: string; preview: React.ReactNode }[] = [
    ...FRAMES.map((f) => ({ key: `frame:${f.id}` as StyleKey, label: f.name, preview: <Avatar name={user?.displayName ?? "K"} src={user?.avatarUrl ?? null} size={34} frame={f.id} /> })),
    ...NAME_EFFECTS.map((e) => ({ key: `name:${e.id}` as StyleKey, label: e.name, preview: <span className="truncate text-sm font-semibold"><UserName name={e.name} effect={e.id} /></span> })),
    { key: "theme:custom", label: "Profile theme", preview: <span className="block h-7 w-12 rounded" style={{ background: "linear-gradient(165deg, #2b1055, #d53369)" }} /> },
    { key: "anim:profile", label: "Animated picture & banner", preview: <Icon name="image" size={18} className="text-accent-text" /> },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Hype packs (people buy these)"
          action={
            c.packs.length < 8 && (
              <Button size="sm" variant="ghost" onClick={() => set({ packs: [...c.packs, { id: `pack-${Date.now().toString(36).slice(-5)}`, hype: 1000, price: 2000 }] })}>
                <Icon name="plus" size={14} /> Add pack
              </Button>
            )
          }
        >
          <div className="space-y-3 p-4">
            {c.packs.map((p, i) => (
              <div key={p.id} className="flex items-end gap-2">
                <TextField label="Hype" type="number" min={1} value={String(p.hype)} onChange={(e) => set({ packs: c.packs.map((x, j) => (j === i ? { ...x, hype: num(e.target.value, 1) } : x)) })} />
                <TextField label="Price (₦)" type="number" min={100} value={String(p.price)} onChange={(e) => set({ packs: c.packs.map((x, j) => (j === i ? { ...x, price: num(e.target.value, 100) } : x)) })} />
                <Button variant="ghost" aria-label="Remove pack" disabled={c.packs.length === 1} onClick={() => set({ packs: c.packs.filter((_, j) => j !== i) })} className="mb-0.5">
                  <Icon name="trash" size={15} />
                </Button>
              </div>
            ))}
          </div>
        </Panel>
        <div className="space-y-4">
          <Panel title="Unlocks">
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
              <TextField label="Lasts (days)" type="number" min={1} max={365} value={String(c.unlockDays)} onChange={(e) => set({ unlockDays: Math.min(365, num(e.target.value, 1)) })} />
              {STYLE_KINDS.map((k) => (
                <TextField key={k.id} label={`${k.label} (Hype)`} hint="Default" type="number" min={0} value={String(c.defaultPrice[k.id])} onChange={(e) => set({ defaultPrice: { ...c.defaultPrice, [k.id]: num(e.target.value) } })} />
              ))}
            </div>
          </Panel>
          <p className="text-sm text-ink-muted">Still profile pictures and banners are always free (GIFs need &ldquo;Animated picture &amp; banner&rdquo;). A price of 0 makes a design free for everyone. Leave a design blank to use the default price.</p>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!draft}>
              Save
            </Button>
            {draft && (
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Undo
              </Button>
            )}
          </div>
        </div>
      </div>
      <Panel title="Price per design (Hype)">
        <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {designs.map((d) => {
            const kind = d.key.split(":")[0] as StyleKind;
            const kindLabel = STYLE_KINDS.find((k) => k.id === kind)?.label ?? "";
            const own = c.prices[d.key];
            return (
              <label key={d.key} className="flex items-center gap-3 rounded-control border border-line px-3 py-2">
                <span className="flex w-24 shrink-0 items-center">{d.preview}</span>
                <span className="min-w-0 flex-1 text-[13px] text-ink-muted">{kind === "theme" || kind === "anim" ? d.label : `${d.label} · ${kindLabel.toLowerCase()}`}</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  aria-label={`Price of ${d.label} (${kindLabel})`}
                  placeholder={String(c.defaultPrice[kind])}
                  value={own === undefined ? "" : String(own)}
                  onChange={(e) => setPrice(d.key, e.target.value)}
                  className="h-9 w-20 rounded-control border border-line bg-canvas px-2 text-right font-mono text-sm"
                />
              </label>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

/** Look someone up by @handle: their Hype (designs, history) and points; give or take either with a note. */
export function PointsPeople({ initial }: { initial?: string }) {
  const toast = useToast();
  const [who, setWho] = useState(initial ?? "");
  const [person, setPerson] = useState<AdminWalletUserDTO | null>(null);
  const [finding, setFinding] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [currency, setCurrency] = useState<"hype" | "points">("hype");
  const [busy, setBusy] = useState<"give" | "take" | null>(null);
  // opened from the audit log (?who=handle): show them straight away
  const opened = useRef(false);
  useEffect(() => {
    if (!initial || opened.current) return;
    opened.current = true;
    PointsService.adminUser(initial)
      .then((r) => setPerson(r.data))
      .catch(() => {});
  }, [initial]);

  async function find(e?: React.FormEvent) {
    e?.preventDefault();
    if (!who.trim()) return;
    setFinding(true);
    try {
      setPerson((await PointsService.adminUser(who.trim())).data);
    } catch (err) {
      setPerson(null);
      toast(errorMessage(err), "error");
    } finally {
      setFinding(false);
    }
  }

  async function adjust(sign: 1 | -1) {
    if (!person) return;
    const v = num(amount);
    const unit = currency === "hype" ? "Hype" : "points";
    if (!v) return toast(`Enter how much ${unit}.`, "error");
    setBusy(sign > 0 ? "give" : "take");
    try {
      const res = await PointsService.adjust(person.user.handle, currency, sign * v, note);
      setPerson(res.data);
      setAmount("");
      setNote("");
      toast(sign > 0 ? `Gave @${person.user.handle} ${n(v)} ${unit}` : `Took ${n(v)} ${unit} from @${person.user.handle}`, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={find} className="flex max-w-md items-end gap-2">
        <TextField label="Person" placeholder="@handle" value={who} onChange={(e) => setWho(e.target.value)} />
        <Button type="submit" loading={finding} className="mb-0.5">
          Find
        </Button>
      </form>
      {person && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Panel title="Hype history">
            {person.history.length === 0 ? (
              <p className="p-4 text-sm text-ink-muted">No Hype yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {person.history.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{t.note}</span>
                      <span className="block font-mono text-[11px] text-ink-muted">{day(t.createdAt)} · {t.kind} · balance {n(t.balanceAfter)}</span>
                    </span>
                    <span className={t.amount > 0 ? "font-mono text-sm font-semibold text-success" : "font-mono text-sm text-ink-muted"}>
                      {t.amount > 0 ? "+" : "−"}
                      {n(Math.abs(t.amount))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <div className="space-y-4">
            <Panel>
              <div className="flex items-center gap-3 p-4">
                <Avatar name={person.user.displayName} src={person.user.avatarUrl} size={44} frame={person.user.avatarFrame} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold"><UserName name={person.user.displayName} effect={person.user.nameEffect} /></span>
                  <span className="block text-sm text-ink-muted">@{person.user.handle}</span>
                </span>
              </div>
              <div className="grid grid-cols-2 divide-x divide-line border-t border-line text-center">
                <span className="px-4 py-2.5">
                  <span className="block font-mono text-lg font-semibold">{n(person.hype)}</span>
                  <span className="text-[11px] text-ink-muted">Hype (bought)</span>
                </span>
                <span className="px-4 py-2.5">
                  <span className="block font-mono text-lg font-semibold">{n(person.points)}</span>
                  <span className="text-[11px] text-ink-muted">points (earned)</span>
                </span>
              </div>
              {person.unlocks.length > 0 && (
                <ul className="space-y-1 border-t border-line px-4 py-3 text-[13px]">
                  {person.unlocks.map((u) => (
                    <li key={u.key} className="flex justify-between gap-2">
                      <span className="truncate">{u.name}{u.source === "gift" ? " (free)" : ""}</span>
                      <span className="shrink-0 font-mono text-ink-muted">→ {day(u.expiresAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Give or take">
              <div className="space-y-3 p-4">
                <Segmented
                  label="What"
                  value={currency}
                  onChange={setCurrency}
                  options={[
                    { id: "hype", label: "Hype" },
                    { id: "points", label: "Points" },
                  ]}
                />
                <TextField label={currency === "hype" ? "Hype" : "Points"} type="number" min={1} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <TextField label="Note (they'll see it)" placeholder="e.g. Winner of the Lagos skate jam" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="flex gap-2">
                  <Button variant="primary" loading={busy === "give"} disabled={!!busy} onClick={() => void adjust(1)}>
                    Give
                  </Button>
                  <Button variant="danger" loading={busy === "take"} disabled={!!busy} onClick={() => void adjust(-1)}>
                    Take
                  </Button>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

/** What each action earns in points, and the most anyone can earn from it in a day. */
export function EarningSettings() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useApi(() => PointsService.adminEarning(), [], { key: "admin-points-earning" });
  const [draft, setDraft] = useState<PointsConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const c = draft ?? data;
  if (loading) return <Skeleton className="h-96 w-full rounded-card" />;
  if (error || !c) return <ErrorState message={error} onRetry={reload} />;

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await PointsService.setEarning(draft);
      setData(res.data);
      setDraft(null);
      toast("Saved. Points already earned stay.", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Panel title="Points per action">
        <div className="divide-y divide-line">
          {POINT_ACTIONS.map((a) => (
            <div key={a.id} className="grid items-end gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_8rem_10rem]">
              <span className="min-w-0 pb-1.5">
                <span className="block text-sm font-semibold">{a.label}</span>
                <span className="block text-[12px] text-ink-muted">{a.hint}</span>
              </span>
              <TextField label="Points" type="number" min={0} value={String(c.actions[a.id])} onChange={(e) => setDraft({ ...c, actions: { ...c.actions, [a.id]: num(e.target.value) } })} />
              <TextField label="Most per day" type="number" min={0} value={String(c.caps[a.id])} onChange={(e) => setDraft({ ...c, caps: { ...c.caps, [a.id]: num(e.target.value) } })} />
            </div>
          ))}
        </div>
      </Panel>
      <p className="text-sm text-ink-muted">Only other people&apos;s actions count, each person counts once per post or message, and nothing takes points away by itself. 0 turns an action off.</p>
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!draft}>
          Save
        </Button>
        {draft && (
          <Button variant="ghost" onClick={() => setDraft(null)}>
            Undo
          </Button>
        )}
      </div>
    </div>
  );
}
