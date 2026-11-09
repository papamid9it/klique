"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { errorMessage, isApiError } from "@/app/ApiCore";
import { newClientKey } from "@/app/services/FeedService";
import { GiftService } from "@/app/services/GiftService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { cx } from "@/components/ui/cx";
import { cdn } from "@/lib/cdn";
import { giftTargetKey, type GiftTargetType } from "@/lib/gifts";
import type { GiftDTO, GiftSummaryDTO, GiftTrayDTO } from "@/lib/types";

export type GiftTarget = { type: GiftTargetType; id: string };

/* ------------------------------------------------------------------ */
/* The gifts on each item, asked for together (one request per screen) */
/* ------------------------------------------------------------------ */

const known = new Map<string, GiftSummaryDTO>();
const waiting = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function want(key: string) {
  if (known.has(key) || waiting.has(key)) return;
  waiting.add(key);
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    const batch = [...waiting].slice(0, 100);
    batch.forEach((k) => waiting.delete(k));
    try {
      const res = await GiftService.summaries(batch);
      for (const k of batch) known.set(k, res.data[k] ?? { total: 0, items: [] });
    } catch {
      for (const k of batch) known.set(k, { total: 0, items: [] });
    }
    listeners.forEach((l) => l());
    if (waiting.size) want([...waiting][0]);
  }, 40);
}

function setSummary(key: string, s: GiftSummaryDTO) {
  known.set(key, s);
  listeners.forEach((l) => l());
}

function useSummary(target: GiftTarget): GiftSummaryDTO | null {
  const key = giftTargetKey(target);
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    want(key);
    return () => void listeners.delete(l);
  }, [key]);
  return known.get(key) ?? null;
}

/** A gift's picture: its uploaded art, or its emoji. */
export function GiftArt({ gift, size }: { gift: Pick<GiftDTO, "name" | "emoji" | "artUrl">; size: number }) {
  if (gift.artUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={/\.gif(\?|$)/i.test(gift.artUrl) ? gift.artUrl : cdn(gift.artUrl, { w: size * 2 })} alt={gift.name} width={size} height={size} loading="lazy" className="inline-block object-contain" style={{ width: size, height: size }} />;
  }
  return (
    <span role="img" aria-label={gift.name} className="inline-flex items-center justify-center leading-none" style={{ width: size, height: size, fontSize: size * 0.82 }}>
      {gift.emoji}
    </span>
  );
}

/** The gifts on an item, compact: 🌹×3 👑×1 (never who sent them). */
/** The gift shown on an item's button: the one given most (a tie goes to the more valuable). */
function topGift(s: GiftSummaryDTO | null) {
  if (!s?.total) return null;
  return [...s.items].sort((x, y) => y.count - x.count || y.price - x.price)[0] ?? null;
}

/** Each gift hops on its own beat, from its id, so a feed never has them all moving at once (and no timers). */
const hopDelay = (id: string) => `-${[...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 9973, 7) % 16}s`;

/** Fixed to the screen, so a scrolling panel or a card's edge never cuts it off: below the button, or above when there's no room. */
function placeTray(el: HTMLElement): React.CSSProperties {
  const r = el.getBoundingClientRect();
  const left = Math.max(16, Math.min(r.left, window.innerWidth - 352));
  return window.innerHeight - r.bottom > 440 ? { top: r.bottom + 8, left } : { bottom: window.innerHeight - r.top + 8, left };
}

/* ------------------------------------------------------------------ */
/* The 🎁 button and its tray                                          */
/* ------------------------------------------------------------------ */

let trayCache: GiftTrayDTO | null = null;

/**
 * Send a gift, like an emoji picker: the gifts with their Hype price, your balance (and a link to top up), and "Send
 * anonymously". Pick one, then Send. Not shown on your own things, in explicit communities, or signed out.
 */
export function GiftButton({ target, authorId, off, size = "md", variant = "plain", icon, className, onlyGiven }: { /** shown only once it has gifts (a chat message's reaction area) */ onlyGiven?: boolean; /** the icon's size, to match the buttons beside it exactly */ icon?: number; target: GiftTarget; authorId: string; /** an explicit community, or anywhere gifts don't belong */ off?: boolean; size?: "sm" | "md"; /** "pill": beside the post's Comments and Share pills; "plain": beside the react (smile) button */ variant?: "pill" | "plain"; className?: string }) {
  const { user } = useAuth();
  const s = useSummary(target);
  const [open, setOpen] = useState<React.CSSProperties | null>(null);
  const top = topGift(s);
  const canGift = !!user && !off && user.id !== authorId;
  // Reddit's awards: no gifts yet, the plain gift icon; with gifts, the top gift and how many in all (no "×")
  if ((!canGift || onlyGiven) && !top) return null;
  const iconSize = icon ?? (variant === "pill" ? 17 : size === "sm" ? 14 : 16);
  const face = top ? (
    <>
      <span className="gift-hop" style={{ "--gift-delay": hopDelay(target.id) } as React.CSSProperties}>
        <GiftArt gift={top} size={iconSize + 3} />
      </span>
      <span className="font-mono text-[12.5px] font-semibold tabular-nums">{s!.total}</span>
    </>
  ) : (
    <Icon name="gift" size={iconSize} />
  );
  const box = cx("inline-flex items-center justify-center gap-1 rounded-full text-ink-muted", variant === "pill" ? "h-9 bg-raised/70 px-3.5" : top ? (size === "sm" ? "h-7 px-1.5" : "h-8 px-2") : size === "sm" ? "size-7" : "size-8");
  if (!canGift) return <span aria-label={`${s!.total} ${s!.total === 1 ? "gift" : "gifts"}`} className={cx(box, className)}>{face}</span>;
  return (
    <span className={cx("relative inline-flex", className)}>
      <button type="button" onClick={(e) => {
          // measured now: the event's element is gone by the time a state updater runs
          const at = open ? null : placeTray(e.currentTarget);
          setOpen(at);
        }} aria-label={top ? `${s!.total} ${s!.total === 1 ? "gift" : "gifts"}. Send a gift` : "Send a gift"} aria-expanded={!!open} title="Send a gift" className={cx(box, "transition hover:text-ink", variant === "pill" ? "hover:bg-raised" : "hover:bg-raised", open && "bg-raised text-ink")}>
        {/* the same line icon, size and colour as the buttons beside it; only the tray shows the colourful gifts */}
        {face}
      </button>
      {open && <GiftTray target={target} style={open} initial={top?.giftId} onClose={() => setOpen(null)} />}
    </span>
  );
}

/** What this has been given so far, at the top of the tray: 🌹 3  ❤️ 1 (never who). */
function TrayReceived({ target }: { target: GiftTarget }) {
  const s = useSummary(target);
  if (!s?.total) return null;
  return (
    <ul aria-label="Gifts so far" className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line pb-2">
      {s.items.map((g) => (
        <li key={g.giftId} title={g.name} className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-muted">
          <GiftArt gift={g} size={18} />
          <span className="font-mono tabular-nums">{g.count}</span>
        </li>
      ))}
    </ul>
  );
}

function GiftTray({ target, style, initial, onClose }: { target: GiftTarget; style: React.CSSProperties; /** a gift to start picked (tapped in a gift row) */ initial?: string; onClose: () => void }) {
  const toast = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<GiftTrayDTO | null>(trayCache);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<GiftDTO | null>(() => trayCache?.gifts.find((g) => g.id === initial) ?? null);
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  // one key per gift picked here: the same send twice (a double click, a slow network) is one gift
  const key = useRef(newClientKey());

  useEffect(() => {
    GiftService.tray().then(
      (r) => {
        trayCache = r.data;
        setData(r.data);
        if (initial) setPicked((p) => p ?? r.data.gifts.find((g) => g.id === initial) ?? null);
      },
      (e) => setError(errorMessage(e)),
    );
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send() {
    if (!picked || busy) return;
    setBusy(true);
    try {
      const res = await GiftService.send({ giftId: picked.id, target, anonymous, clientKey: key.current });
      setSummary(giftTargetKey(target), res.data.summary);
      const next = data ? { ...data, balance: res.data.balance } : data;
      trayCache = next;
      setData(next);
      toast(`${picked.name} sent${anonymous ? " anonymously" : ""}`, "success");
      key.current = newClientKey();
      onClose();
    } catch (e) {
      key.current = newClientKey();
      toast(isApiError(e) && e.code === "not_enough_hype" ? e.message : errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  const short = picked && data ? picked.hype > data.balance : false;
  return (
    <div ref={ref} role="dialog" aria-label="Send a gift" style={style} className="fixed z-50 w-[21rem] max-w-[calc(100vw-2rem)] rounded-card border border-line bg-surface p-3 shadow-xl">
      <TrayReceived target={target} />
      <div className="mb-2 flex items-center gap-2">
        <p className="flex-1 text-sm font-semibold">Send a gift</p>
        <span className="font-mono text-[12px] text-ink-muted">{data ? `${data.balance.toLocaleString("en-NG")} Hype` : ""}</span>
        <Link href="/settings?tab=hype" className="rounded-full bg-raised px-2.5 py-1 text-[12px] font-semibold hover:bg-line">
          Top up
        </Link>
      </div>
      {!data ? (
        error ? <p className="p-2 text-sm text-danger">{error}</p> : <Skeleton className="h-40" />
      ) : !data.enabled ? (
        <p className="p-2 text-sm text-ink-muted">Gifts are switched off for now.</p>
      ) : (
        <>
          <div className="-mx-1 grid max-h-[min(24rem,55vh)] grid-cols-4 gap-1.5 overflow-y-auto p-1.5 [scrollbar-width:thin]">
            {data.gifts.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setPicked(g)}
                aria-pressed={picked?.id === g.id}
                title={`${g.name}: ${g.hype.toLocaleString("en-NG")} Hype (₦${g.price.toLocaleString("en-NG")})`}
                className={cx("flex flex-col items-center gap-0.5 rounded-control p-1.5 transition hover:bg-raised", picked?.id === g.id && "bg-raised ring-2 ring-accent-text")}
              >
                <GiftArt gift={g} size={32} />
                <span className="w-full truncate text-center text-[11px] font-medium">{g.name}</span>
                <span className="font-mono text-[10.5px] text-ink-muted">{g.hype.toLocaleString("en-NG")} Hype</span>
              </button>
            ))}
          </div>
          <label className="mt-2 flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="size-4 accent-[var(--color-accent-text)]" />
            Send anonymously
            <span className="text-ink-muted">(they see “Someone”)</span>
          </label>
          {short && (
            <p className="mt-2 text-[12.5px] text-ink-muted">
              You need {(picked!.hype - data.balance).toLocaleString("en-NG")} more Hype.{" "}
              <Link href="/settings?tab=hype" className="font-semibold text-accent-text underline">
                Top up
              </Link>
            </p>
          )}
          <button type="button" onClick={() => void send()} disabled={!picked || busy || short} className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-full bg-accent text-sm font-semibold text-accent-ink transition disabled:opacity-40">
            {busy ? "Sending…" : picked ? `Send ${picked.name} · ${picked.hype.toLocaleString("en-NG")} Hype` : "Pick a gift"}
          </button>
        </>
      )}
    </div>
  );
}
