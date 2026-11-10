"use client";

import { useEffect, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { GiftService } from "@/app/services/GiftService";
import { UploadService } from "@/app/services/UploadService";
import { GiftArt } from "@/components/domain/gifts/Gifts";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { GIFT_MAX_PRICE, GIFT_MIN_PRICE, giftHype, type GiftConfig } from "@/lib/gifts";
import { useApi } from "@/lib/hooks/useApi";
import type { AdminStuckTopupDTO, GiftDTO } from "@/lib/types";
import { Badge, Panel, StatCard } from "./AdminParts";

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
const day = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const PLATFORM = { web: "Website (Paystack)", apple: "iPhone (Apple)", google: "Android (Google)" } as const;
const TARGET = { post: "post", comment: "comment", topic: "board post", reply: "board reply" } as const;

/** Admin → Gifts → Dashboard: Hype bought, who bought it, gifts sent (anonymous senders shown), and the money split. */
/** Top-ups that may be paid without their Hype yet: shown only when there are some, with a button to check them now. */
function StuckTopups() {
  const toast = useToast();
  const { data, setData } = useApi(() => GiftService.adminStuckTopups(), []);
  const [busy, setBusy] = useState(false);
  if (!data?.length) return null;
  async function retry() {
    setBusy(true);
    try {
      const res = await GiftService.adminRetryTopups();
      setData(res.data.stuck);
      toast(res.data.credited ? `${res.data.credited} credited` : "Nothing new was paid", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      title={`Top-ups not credited yet (${data.length})`}
      action={
        <Button size="sm" loading={busy} onClick={() => void retry()}>
          Check again
        </Button>
      }
    >
      <ul className="divide-y divide-line text-sm">
        {data.map((t: AdminStuckTopupDTO) => (
          <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
            <span className="font-semibold">{t.user ? `${t.user.displayName} @${t.user.handle}` : "Deleted account"}</span>
            <span>
              {t.hype.toLocaleString("en-NG")} Hype · {naira(t.amount)}
            </span>
            <span className="text-ink-muted">{PLATFORM[t.platform]}</span>
            <Badge>Paid, Hype missing</Badge>
            <span className="ml-auto font-mono text-xs text-ink-muted">
              {t.reference} · {day(t.createdAt)}
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-4 py-2.5 text-xs text-ink-muted">Checked again every day too, along with website checkouts that never got an answer from Paystack.</p>
    </Panel>
  );
}

export function GiftsDashboard() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [group, setGroup] = useState<"day" | "month">("day");
  const q = { from: from || undefined, to: to || undefined, group };
  const { data, loading, error, reload } = useApi(() => GiftService.adminReport(q), [from, to, group], { keepPrevious: true });
  const csv = (kind: "purchases" | "sends") => `/api/admin/gifts/report?${new URLSearchParams({ csv: kind, ...(from ? { from } : {}), ...(to ? { to } : {}) })}`;
  const max = Math.max(1, ...(data?.bought.series.map((s) => s.amount) ?? [1]));
  return (
    <div className="space-y-5">
      <StuckTopups />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[13px]">
          <span className="mb-1 block font-medium">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-control border border-line bg-surface px-2" />
        </label>
        <label className="text-[13px]">
          <span className="mb-1 block font-medium">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-control border border-line bg-surface px-2" />
        </label>
        <label className="text-[13px]">
          <span className="mb-1 block font-medium">Group by</span>
          <select value={group} onChange={(e) => setGroup(e.target.value as "day" | "month")} className="h-9 rounded-control border border-line bg-surface px-2">
            <option value="day">Day</option>
            <option value="month">Month</option>
          </select>
        </label>
        <div className="ml-auto flex gap-2">
          <Button size="sm" href={csv("purchases")}>
            <Icon name="download" size={14} /> Purchases CSV
          </Button>
          <Button size="sm" href={csv("sends")}>
            <Icon name="download" size={14} /> Gifts CSV
          </Button>
        </div>
      </div>
      {loading && !data ? (
        <Skeleton className="h-72 w-full rounded-card" />
      ) : error || !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon="coin" label="Hype bought" value={naira(data.bought.total.amount)} hint={`${data.bought.total.count} purchases · ${data.bought.total.hype.toLocaleString("en-NG")} Hype`} />
            <StatCard icon="gift" label="Gifts sent" value={naira(data.split.giftValue)} hint={`${data.split.count} gifts`} />
            <StatCard icon="coin" label="Klique's share" value={naira(data.split.klique)} hint="Of gifts sent" />
            <StatCard icon="users" label="Owed to receivers" value={naira(data.split.receiversOwed)} hint={`${naira(data.split.receivers)} earned · ${naira(data.split.receiversPaid)} paid · ${naira(data.split.receiversRequested)} requested`} />
          </div>
          <Panel title="By platform">
            <ul className="divide-y divide-line">
              {data.bought.byPlatform.map((p) => (
                <li key={p.platform} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-44 font-medium">{PLATFORM[p.platform]}</span>
                  <span className="font-mono tabular-nums">{naira(p.amount)}</span>
                  <span className="text-ink-muted">{p.count} purchases</span>
                  <span className="text-ink-muted">store fees {naira(p.fees)}</span>
                  <span className="ml-auto font-mono text-ink-muted tabular-nums">net {naira(p.amount - p.fees)}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title={`Hype bought, by ${group}`}>
            {data.bought.series.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-muted">Nothing in this range.</p>
            ) : (
              <ul className="space-y-1 px-4 py-3">
                {data.bought.series.map((s) => (
                  <li key={s.period} className="flex items-center gap-3 text-[13px]">
                    <span className="w-24 font-mono text-ink-muted">{s.period}</span>
                    <span className="h-3 rounded-full bg-accent" style={{ width: `${Math.max(2, (s.amount / max) * 60)}%` }} />
                    <span className="font-mono tabular-nums">{naira(s.amount)}</span>
                    <span className="text-ink-muted">({s.count})</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Who bought Hype">
            {data.purchases.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-muted">No purchases in this range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead className="text-ink-muted">
                    <tr>
                      {["When", "Who", "Where", "Pack", "Hype", "Paid", "Store fee", "Reference"].map((h) => (
                        <th key={h} className="px-3 py-2 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.purchases.map((p) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2 whitespace-nowrap">{day(p.paidAt)}</td>
                        <td className="px-3 py-2">@{p.user.handle}</td>
                        <td className="px-3 py-2">{p.platform}{p.test && <Badge tone="bad">test</Badge>}</td>
                        <td className="px-3 py-2">{p.pack}</td>
                        <td className="px-3 py-2 font-mono">{p.hype.toLocaleString("en-NG")}</td>
                        <td className="px-3 py-2 font-mono">{naira(p.amount)}</td>
                        <td className="px-3 py-2 font-mono">{naira(p.storeFee)}</td>
                        <td className="max-w-48 truncate px-3 py-2 font-mono text-ink-muted">{p.reference}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <Panel title="Gifts sent">
            {data.sends.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-muted">No gifts in this range.</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.sends.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-[13px]">
                    <span className="text-lg leading-none">{g.gift.emoji}</span>
                    <span>
                      <span className="font-semibold">@{g.from.handle}</span>
                      {g.anonymous && <Badge>anonymous</Badge>} → <span className="font-semibold">@{g.to.handle}</span> · {g.gift.name} on a {TARGET[g.target.type]}
                      {g.community ? ` in ${g.community.name}` : ""}
                    </span>
                    <span className="ml-auto font-mono tabular-nums">{naira(g.price)}</span>
                    <span className="text-ink-muted">({naira(g.receiverAmount)} / {naira(g.kliqueAmount)})</span>
                    <span className="w-40 text-right text-ink-muted">{day(g.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

/** One gift's row: name, emoji or uploaded art, price (₦10 to ₦500,000), shown or hidden, order. */
function GiftEditor({ g, onSaved, onRemoved, onMove }: { g: GiftDTO | null; onSaved: (g: GiftDTO) => void; onRemoved?: () => void; onMove?: (dir: -1 | 1) => void }) {
  const toast = useToast();
  const [name, setName] = useState(g?.name ?? "");
  const [emoji, setEmoji] = useState(g?.emoji ?? "🎁");
  const [artUrl, setArtUrl] = useState<string | null>(g?.artUrl ?? null);
  const [price, setPrice] = useState(String(g?.price ?? 100));
  const [active, setActive] = useState(g?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const n = Math.round(Number(price) || 0);
  const ok = !!name.trim() && n >= GIFT_MIN_PRICE && n <= GIFT_MAX_PRICE;
  const dirty = !g || name !== g.name || emoji !== g.emoji || artUrl !== g.artUrl || n !== g.price || active !== g.active;

  async function save() {
    setBusy(true);
    try {
      const res = await GiftService.adminSave({ name: name.trim(), emoji, artUrl, price: n, active }, g?.id);
      onSaved(res.data);
      if (!g) {
        setName("");
        setArtUrl(null);
      }
      toast(g ? "Saved" : "Gift added", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }
  async function upload(f: File | undefined) {
    if (!f) return;
    setUploading(true);
    try {
      setArtUrl((await UploadService.upload("photo", f)).url);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setUploading(false);
    }
  }
  return (
    <li className={cx("flex flex-wrap items-end gap-2 px-4 py-3", g && !g.active && "opacity-60")}>
      <span className="flex size-11 items-center justify-center rounded-control bg-raised">
        <GiftArt gift={{ name, emoji, artUrl }} size={30} />
      </span>
      <div className="w-36">
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      </div>
      <div className="w-20">
        <TextField label="Emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={16} />
      </div>
      <div className="w-32">
        <TextField label="Price (₦)" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} hint={ok ? `${giftHype(n).toLocaleString("en-NG")} Hype` : `₦${GIFT_MIN_PRICE}–₦${GIFT_MAX_PRICE.toLocaleString("en-NG")}`} />
      </div>
      <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-control border border-line px-2.5 text-[13px] hover:bg-raised">
        <input type="file" hidden accept=".png,.webp,.gif,.jpg,.jpeg" onChange={(e) => void upload(e.target.files?.[0])} />
        <Icon name="image" size={14} /> {uploading ? "Uploading…" : artUrl ? "Change art" : "Upload art"}
      </label>
      {artUrl && (
        <Button size="sm" variant="ghost" onClick={() => setArtUrl(null)}>
          Use emoji
        </Button>
      )}
      <label className="inline-flex h-9 items-center gap-1.5 text-[13px]">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4" /> Shown
      </label>
      <Button size="sm" variant="primary" disabled={!ok || !dirty || uploading} loading={busy} onClick={() => void save()}>
        {g ? "Save" : "Add gift"}
      </Button>
      {g && onMove && (
        <span className="inline-flex">
          <Button size="sm" variant="ghost" onClick={() => onMove(-1)} aria-label="Move up">
            ↑
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onMove(1)} aria-label="Move down">
            ↓
          </Button>
        </span>
      )}
      {g && onRemoved && (
        <Button size="sm" variant="ghost" onClick={onRemoved} aria-label={`Remove ${g.name}`}>
          <Icon name="trash" size={14} />
        </Button>
      )}
    </li>
  );
}

/** Admin → Gifts → Catalogue: add, edit, hide, order and remove gifts. Gifts already sent keep their name and picture. */
export function GiftsCatalogue() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useApi(() => GiftService.adminList(), []);
  if (loading && !data) return <Skeleton className="h-72 w-full rounded-card" />;
  if (error || !data) return <ErrorState message={error} onRetry={reload} />;
  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= data.length) return;
    const next = [...data];
    [next[i], next[j]] = [next[j], next[i]];
    setData(next);
    try {
      setData((await GiftService.adminReorder(next.map((g) => g.id))).data);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };
  return (
    <div className="space-y-4">
      <Panel title="Gifts">
        <ul className="divide-y divide-line">
          {data.map((g, i) => (
            <GiftEditor
              key={g.id}
              g={g}
              onSaved={(n) => setData((d) => (d ?? []).map((x) => (x.id === n.id ? n : x)))}
              onMove={(dir) => void move(i, dir)}
              onRemoved={() =>
                void GiftService.adminRemove(g.id).then(
                  () => setData((d) => (d ?? []).filter((x) => x.id !== g.id)),
                  (e) => toast(errorMessage(e), "error"),
                )
              }
            />
          ))}
        </ul>
      </Panel>
      <Panel title="Add a gift">
        <ul>
          <GiftEditor g={null} onSaved={(n) => setData((d) => [...(d ?? []), n])} />
        </ul>
      </Panel>
      <p className="text-xs text-ink-muted">Art: a square PNG, WebP or GIF (animated is fine). Without art, the emoji shows.</p>
    </div>
  );
}

/** Admin → Gifts → Settings: the receiver's share, hold, smallest payout, top-up packs and store fees. */
export function GiftsSettings() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useApi(() => GiftService.adminConfig(), []);
  const [draft, setDraft] = useState<GiftConfig | null>(null);
  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);
  const [busy, setBusy] = useState(false);
  if (loading && !data) return <Skeleton className="h-72 w-full rounded-card" />;
  if (error || !data || !draft) return <ErrorState message={error} onRetry={reload} />;
  const num = (v: string) => Math.round(Number(v.replace(/[^\d]/g, "")) || 0);
  async function save() {
    setBusy(true);
    try {
      const res = await GiftService.adminSetConfig(draft!);
      setData(res.data);
      toast("Saved", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="max-w-2xl space-y-5">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} className="size-4" /> Gifts are on
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label="Receiver's share (%)" inputMode="numeric" value={String(draft.receiverPercent)} onChange={(e) => setDraft({ ...draft, receiverPercent: Math.min(100, num(e.target.value)) })} hint={`Klique keeps ${100 - draft.receiverPercent}%`} />
        <TextField label="Hold (days)" inputMode="numeric" value={String(draft.holdDays)} onChange={(e) => setDraft({ ...draft, holdDays: Math.min(90, num(e.target.value)) })} />
        <TextField label="Smallest payout (₦)" inputMode="numeric" value={String(draft.minPayout)} onChange={(e) => setDraft({ ...draft, minPayout: num(e.target.value) })} />
      </div>
      <TextField label="Website packs (₦, comma separated)" value={draft.webPacks.join(", ")} onChange={(e) => setDraft({ ...draft, webPacks: e.target.value.split(",").map((x) => num(x)).filter((x) => x > 0) })} hint="Any amount up to ₦500,000 can also be typed in." />
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Phone app packs (must match App Store Connect and Play Console)</legend>
        {draft.storePacks.map((p, i) => (
          <div key={p.productId} className="flex flex-wrap items-end gap-2">
            <span className="w-28 font-mono text-[13px]">{p.productId}</span>
            <div className="w-28">
              <TextField label="Hype" value={String(p.hype)} readOnly />
            </div>
            <div className="w-36">
              <TextField label="Store price (₦)" inputMode="numeric" value={String(p.price)} onChange={(e) => setDraft({ ...draft, storePacks: draft.storePacks.map((x, k) => (k === i ? { ...x, price: num(e.target.value) } : x)) })} hint={`web: ₦${(p.hype * 10).toLocaleString("en-NG")}`} />
            </div>
          </div>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Apple keeps (%)" inputMode="numeric" value={String(draft.storeFeePercent.apple)} onChange={(e) => setDraft({ ...draft, storeFeePercent: { ...draft.storeFeePercent, apple: Math.min(50, num(e.target.value)) } })} />
        <TextField label="Google keeps (%)" inputMode="numeric" value={String(draft.storeFeePercent.google)} onChange={(e) => setDraft({ ...draft, storeFeePercent: { ...draft.storeFeePercent, google: Math.min(50, num(e.target.value)) } })} />
      </div>
      <Button variant="primary" loading={busy} onClick={() => void save()}>
        Save settings
      </Button>
    </div>
  );
}
