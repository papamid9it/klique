"use client";

import { ProfileEffect } from "@/components/ui/ProfileEffect";
import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { PointsService } from "@/app/services/PointsService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { UserName } from "@/components/ui/UserName";
import { cx } from "@/components/ui/cx";
import { formatPrice } from "@/lib/format";
import { useApi, useNow } from "@/lib/hooks/useApi";
import type { HypeTxnDTO, HypeWalletDTO, StyleUnlockDTO, UserMe } from "@/lib/types";
import { styleName, stylePrice, type StyleKey } from "@/lib/wallet";
import { PointsCard } from "./PointsCard";

const DAY = 24 * 60 * 60 * 1000;
const n = (v: number) => v.toLocaleString("en-NG");
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });
const daysLeft = (iso: string, now: Date) => Math.max(0, Math.ceil((+new Date(iso) - +now) / DAY));

/**
 * Your Hype wallet, shared by the Hype & points tab and the Profile style picker (same cache key, so both stay in step).
 * Anything that changes it (buying, unlocking, an admin gift, a renewal) also updates the balance on your account.
 */
export function useHypeWallet() {
  const { status, user, setUser } = useAuth();
  const authed = status === "authed";
  const api = useApi(authed ? () => PointsService.wallet() : null, [authed], { key: "hype-wallet" });
  // Hype arrived, a design renewed or ended: refresh
  useRealtimeEvent(() => void api.reload(), { filter: (e) => e.type === "notify" && e.category === "points", debounceMs: 300 });
  const balance = api.data?.balance;
  useEffect(() => {
    if (user && balance !== undefined && user.hype !== balance) setUser({ ...user, hype: balance });
  }, [balance, user, setUser]);
  return api;
}

/** What one design costs you right now: free, yours until a date, or locked at a price. */
export function styleAccess(w: HypeWalletDTO | null, key: StyleKey): { price: number; until: string | null; locked: boolean } {
  if (!w || w.allFree) return { price: 0, until: null, locked: false };
  const price = stylePrice(w.config, key);
  const until = w.unlocks.find((u) => u.key === key)?.expiresAt ?? null;
  return { price, until, locked: price > 0 && !until };
}

export function StylePreview({ k, me, size = 44 }: { k: string; me: Pick<UserMe, "displayName" | "avatarUrl" | "profileTheme">; size?: number }) {
  const [kind, id] = k.split(":");
  if (kind === "frame") return <Avatar name={me.displayName} src={me.avatarUrl ?? null} size={size} frame={id} />;
  if (kind === "name") return <span className="max-w-[9rem] truncate text-[15px] font-semibold"><UserName name={me.displayName} effect={id} /></span>;
  const box = { width: size * 1.6, height: size };
  if (kind === "theme") return <span className="block rounded-control" style={{ ...box, background: me.profileTheme ? `linear-gradient(165deg, ${me.profileTheme.primary}, ${me.profileTheme.accent})` : "linear-gradient(165deg, #2b1055, #d53369)" }} />;
  if (kind === "effect") return <span className="relative block overflow-hidden rounded-control bg-raised" style={box}><ProfileEffect id={id} /></span>;
  return <span className="inline-flex items-center justify-center rounded-control bg-raised text-accent-text" style={box}><Icon name="image" size={Math.round(size / 2.2)} /></span>;
}

function HypePill({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 font-mono font-semibold", className)}>
      <Icon name="coin" size={14} /> {n(value)}
    </span>
  );
}

/** Spend Hype on one design: what it is, what it costs, for how long, and renew-by-itself. */
export function UnlockDialog({ k, wallet, me, onClose, onDone, onGetHype }: { k: StyleKey | null; wallet: HypeWalletDTO | null; me: UserMe; onClose: () => void; onDone: (w: HypeWalletDTO) => void; onGetHype?: () => void }) {
  const toast = useToast();
  const [autoRenew, setAutoRenew] = useState(false);
  const [busy, setBusy] = useState(false);
  const now = useNow();
  if (!k || !wallet) return null;
  const { price, until } = styleAccess(wallet, k);
  const short = Math.max(0, price - wallet.balance);
  const days = wallet.config.unlockDays;

  async function unlock() {
    if (!k) return;
    setBusy(true);
    try {
      const res = await PointsService.unlock(k, until ? undefined : autoRenew);
      onDone(res.data);
      toast(until ? `Added ${days} days` : `${styleName(k)} unlocked for ${days} days`, "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={until ? `Keep ${styleName(k)}` : `Unlock ${styleName(k)}`} size="sm">
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-2 rounded-card border border-line bg-raised/40 px-4 py-5">
          <span className="kq-live">
            <StylePreview k={k} me={me} size={64} />
          </span>
          <p className="text-sm text-ink-muted">{until && now ? `Yours until ${dayLabel(until)} · ${daysLeft(until, now)} days left` : `Wear it for ${days} days`}</p>
        </div>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">{until ? `Another ${days} days` : `${days} days`}</dt>
            <dd><HypePill value={price} /></dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">Your Hype</dt>
            <dd><HypePill value={wallet.balance} className={short ? "text-danger" : undefined} /></dd>
          </div>
        </dl>
        {!until && <Switch checked={autoRenew} onChange={setAutoRenew} label="Renew by itself" hint={`Every ${days} days from your Hype. We'll tell you 3 days before if you're short.`} />}
        {short > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-danger">You need {n(short)} more Hype.</p>
            {onGetHype && (
              <Button variant="primary" className="w-full" onClick={onGetHype}>
                <Icon name="coin" size={15} /> Get Hype
              </Button>
            )}
          </div>
        ) : (
          <Button variant="primary" className="w-full" loading={busy} onClick={() => void unlock()}>
            {until ? `Add ${days} days` : "Unlock"} · {n(price)} Hype
          </Button>
        )}
        <p className="text-center text-xs text-ink-muted">Your picture and banner are always free.</p>
      </div>
    </Modal>
  );
}

function UnlockRow({ u, me, now, onAdd, onRenew }: { u: StyleUnlockDTO; me: UserMe; now: Date | null; onAdd: () => void; onRenew: (v: boolean) => void }) {
  const left = now ? daysLeft(u.expiresAt, now) : null;
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="flex w-14 shrink-0 justify-center">
        <StylePreview k={u.key} me={me} size={40} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold">
          {u.name}
          {u.source === "gift" && <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent-text">Free</span>}
        </span>
        <span className={cx("block text-[12px]", left !== null && left <= 3 ? "font-semibold text-danger" : "text-ink-muted")}>
          Until {dayLabel(u.expiresAt)}
          {left !== null && ` · ${left <= 1 ? "last day" : `${left} days left`}`}
        </span>
      </span>
      <span className="flex w-full items-center justify-end gap-3 sm:w-auto">
        <label className="inline-flex items-center gap-2 text-[12px] font-medium text-ink-muted">
          <input type="checkbox" checked={u.autoRenew} onChange={(e) => onRenew(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
          Renew by itself ({n(u.price)})
        </label>
        <Button size="sm" onClick={onAdd} disabled={u.price === 0}>
          Add days
        </Button>
      </span>
    </li>
  );
}

const KIND_ICON: Record<HypeTxnDTO["kind"], "coin" | "asterisk" | "clock" | "heart" | "x"> = { purchase: "coin", earn: "coin", grant: "heart", revoke: "x", unlock: "asterisk", renew: "clock" };

/**
 * Settings → Hype & points: your points (earned) on top, then your Hype (bought): balance, packs to buy, the
 * designs you have, and every change to your Hype.
 */
export function HypeTab({ me, onStyle }: { me: UserMe; onStyle: () => void }) {
  const toast = useToast();
  const now = useNow();
  const { data: w, loading, error, reload, setData } = useHypeWallet();
  const [buying, setBuying] = useState<string | null>(null);
  const [adding, setAdding] = useState<StyleKey | null>(null);
  const [older, setOlder] = useState<HypeTxnDTO[]>([]);
  const [hasMore, setHasMore] = useState<boolean | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // back from Paystack (?reference=…): confirm the payment, then tidy the address
  const checked = useRef<string | null>(null);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const ref = sp.get("reference") ?? sp.get("trxref");
    if (!ref || checked.current === ref) return;
    checked.current = ref;
    void PointsService.verify(ref)
      .then((res) => {
        setData(res.data.wallet);
        toast(res.data.paid ? `${n(res.data.hype)} Hype added` : "We couldn't confirm that payment yet. If you paid, your Hype arrives in a minute.", res.data.paid ? "success" : "error");
      })
      .catch((e) => toast(errorMessage(e), "error"))
      .finally(() => window.history.replaceState(null, "", "/settings#hype"));
  }, [setData, toast]);

  if (loading) return <Skeleton className="h-80 w-full rounded-card" />;
  if (error || !w) return <ErrorState message={error} onRetry={reload} />;

  const txns = [...w.history, ...older];
  const more = hasMore ?? w.hasMoreHistory;

  async function buy(packId: string) {
    setBuying(packId);
    try {
      const res = await PointsService.buy(packId);
      window.location.href = res.data.authorizationUrl;
    } catch (e) {
      toast(errorMessage(e), "error");
      setBuying(null);
    }
  }

  async function renew(key: string, on: boolean) {
    setData((d) => (d ? { ...d, unlocks: d.unlocks.map((u) => (u.key === key ? { ...u, autoRenew: on } : u)) } : d));
    try {
      setData((await PointsService.autoRenew(key, on)).data);
    } catch (e) {
      toast(errorMessage(e), "error");
      void reload();
    }
  }

  async function loadOlder() {
    const last = txns[txns.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const res = await PointsService.history(last.createdAt);
      setOlder((o) => [...o, ...res.data.items]);
      setHasMore(res.data.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  const best = Math.max(...w.config.packs.map((p) => p.hype / p.price));

  return (
    <div className="space-y-8">
      <PointsCard />
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-surface p-5">
        <div>
          <p className="eyebrow">Your Hype</p>
          <p className="mt-1 flex items-center gap-2 text-4xl font-bold tracking-[-0.03em]">
            <Icon name="coin" size={28} className="text-accent-text" /> {n(w.balance)}
          </p>
          <p className="mt-1.5 max-w-md text-sm text-ink-muted">
            {w.allFree ? "You're a site admin, so every frame and name style is free for you. Just pick one in Profile style." : `Hype is what you buy and spend: picture frames and name styles. Each one lasts ${w.config.unlockDays} days. Your picture and banner are always free.`}
          </p>
        </div>
        <Button onClick={onStyle}>
          <Icon name="asterisk" size={15} /> Browse designs
        </Button>
      </section>

      <section>
        <h3 className="eyebrow mb-3">Get Hype</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {w.config.packs.map((p) => (
            <div key={p.id} className="relative flex flex-col items-start gap-1 rounded-card border border-line bg-surface p-4">
              {w.config.packs.length > 1 && p.hype / p.price === best && <span className="absolute top-3 right-3 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-ink">Best value</span>}
              <HypePill value={p.hype} className="text-xl" />
              <span className="text-sm text-ink-muted">{formatPrice(p.price, "NGN")}</span>
              <Button size="sm" variant="primary" className="mt-2 w-full" loading={buying === p.id} disabled={!w.canBuy || (!!buying && buying !== p.id)} onClick={() => void buy(p.id)}>
                Buy
              </Button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-muted">{w.canBuy ? "Paid by card on Paystack. Hype can't be cashed out or sent to someone else, and it never adds to your points." : "Buying Hype isn't switched on yet."}</p>
      </section>

      <section>
        <h3 className="eyebrow mb-3">Your designs</h3>
        {w.unlocks.length === 0 ? (
          <div className="rounded-card border border-dashed border-line p-5 text-sm text-ink-muted">
            Nothing unlocked yet.{" "}
            <button type="button" onClick={onStyle} className="font-semibold text-ink underline">
              Pick a frame or name style
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {w.unlocks.map((u) => (
              <UnlockRow key={u.key} u={u} me={me} now={now} onAdd={() => setAdding(u.key as StyleKey)} onRenew={(v) => void renew(u.key, v)} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="eyebrow mb-3">Hype history</h3>
        {txns.length === 0 ? (
          <p className="text-sm text-ink-muted">No Hype yet.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {txns.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-raised text-ink-muted">
                  <Icon name={KIND_ICON[t.kind]} size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px]">{t.note}</span>
                  <span className="block font-mono text-[11px] text-ink-muted">{dayLabel(t.createdAt)} · balance {n(t.balanceAfter)}</span>
                </span>
                <span className={cx("font-mono text-[14px] font-semibold", t.amount > 0 ? "text-success" : "text-ink-muted")}>
                  {t.amount > 0 ? "+" : "−"}
                  {n(Math.abs(t.amount))}
                </span>
              </li>
            ))}
          </ul>
        )}
        {more && (
          <div className="mt-3 flex justify-center">
            <Button size="sm" onClick={() => void loadOlder()} loading={loadingMore}>
              Load older
            </Button>
          </div>
        )}
      </section>

      {adding && <UnlockDialog key={adding} k={adding} wallet={w} me={me} onClose={() => setAdding(null)} onDone={(next) => (setData(next), setAdding(null))} />}
    </div>
  );
}
