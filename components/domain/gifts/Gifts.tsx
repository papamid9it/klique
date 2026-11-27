"use client";

import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { createPortal } from "react-dom";
import { HypeCoin } from "./HypeCoin";
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
import { compactCount } from "@/lib/format";
import { cdn } from "@/lib/cdn";
import { HYPE_NAIRA, burstTier, giftArtStill, giftTargetKey, hypeForNaira, type GiftTargetType } from "@/lib/gifts";
import type { GiftDTO, GiftSummaryDTO, GiftTrayDTO, GiftWalletDTO } from "@/lib/types";
import { rememberAward } from "./HypeReturn";

export type GiftTarget = { type: GiftTargetType; id: string };

/* ------------------------------------------------------------------ */
/* The gifts on each item, asked for together (one request per screen) */
/* ------------------------------------------------------------------ */

const known = new Map<string, GiftSummaryDTO>();
const waiting = new Set<string>();
/** items whose request failed once already */
const retried = new Set<string>();
// per item: only the buttons showing that item redraw when its gifts change (not every gift on the screen)
const listeners = new Map<string, Set<() => void>>();
let timer: ReturnType<typeof setTimeout> | null = null;

const tell = (key: string) => listeners.get(key)?.forEach((l) => l());

/** Ask for everything wanted in the last moment in one request (100 at a time; the rest go in the next one). */
function flush() {
  timer = null;
  const batch = [...waiting].slice(0, 100);
  batch.forEach((k) => waiting.delete(k));
  GiftService.summaries(batch).then((r) => r.data).then(
    (res) => batch.forEach((k) => known.set(k, res[k] ?? { total: 0, items: [] })),
    () => {
      // a failed request is tried once more, quietly, a moment later; only a second failure shows no gifts
      const again = batch.filter((k) => !retried.has(k));
      again.forEach((k) => retried.add(k));
      batch.forEach((k) => !again.includes(k) && known.set(k, { total: 0, items: [] }));
      if (again.length) setTimeout(() => again.forEach(want), 2000);
    },
  ).finally(() => {
    batch.forEach((k) => known.has(k) && tell(k));
    if (waiting.size && !timer) timer = setTimeout(flush, 40);
  });
}

/** An award just landed on it (a live event): ask again, keeping what's shown until the new count arrives. */
function refetch(key: string) {
  if (waiting.has(key)) return;
  waiting.add(key);
  if (!timer) timer = setTimeout(flush, 40);
}

function want(key: string) {
  if (known.has(key) || waiting.has(key)) return;
  waiting.add(key);
  if (!timer) timer = setTimeout(flush, 40);
}

/** An award sent from somewhere else (after a top-up): show it on its post or comment */
export function noteSent(target: GiftTarget, s: GiftSummaryDTO) {
  setSummary(giftTargetKey(target), s);
}

function setSummary(key: string, s: GiftSummaryDTO) {
  known.set(key, s);
  tell(key);
}

function useSummary(target: GiftTarget): GiftSummaryDTO | null {
  const key = giftTargetKey(target);
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    const set = listeners.get(key) ?? new Set();
    listeners.set(key, set.add(l));
    want(key);
    return () => {
      set.delete(l);
      if (!set.size) listeners.delete(key);
    };
  }, [key]);
  // someone else sent an award to it: the count updates at once (the person it's for too)
  useRealtimeEvent(() => refetch(key), { filter: (e) => e.type === "gift" && e.key === key, debounceMs: 300 });
  return known.get(key) ?? null;
}

/** A gift's picture: its uploaded art, or its emoji. */
/** A gift's picture. Our drawn gifts move a little only where `animate` is set (the tray); elsewhere they're still. */
export function GiftArt({ gift, size, animate }: { gift: Pick<GiftDTO, "name" | "emoji" | "artUrl">; size: number; animate?: boolean }) {
  if (gift.artUrl) {
    const url = animate ? gift.artUrl : (giftArtStill(gift.artUrl) ?? gift.artUrl);
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={/\.gif(\?|$)/i.test(url) ? url : cdn(url, { w: size * 2 })} alt={gift.name} width={size} height={size} loading="lazy" className="inline-block object-contain" style={{ width: size, height: size }} />;
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

/**
 * Placed like Discord's emoji picker: beside the message's hover bar (to its left, else its right), level with it, slid up or down
 * just enough to fit the window. Where there's no room beside it (a post's button, a narrow window) it sits below the
 * button, or above it, and still never past the window's edges. A fixed height, so Send always shows.
 */
function placeTray(el: HTMLElement): React.CSSProperties {
  const edge = 12;
  const gap = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(336, vw - 2 * edge);
  const height = Math.min(460, vh - 2 * edge);
  const fit = (top: number) => Math.max(edge, Math.min(top, vh - edge - height));
  const bar = (el.closest("[data-hover-bar]") as HTMLElement | null) ?? el;
  const b = bar.getBoundingClientRect();
  if (b.left - gap - width >= edge) return { left: b.left - gap - width, top: fit(b.top), height };
  if (bar !== el && b.right + gap + width <= vw - edge) return { left: b.right + gap, top: fit(b.top), height };
  const r = el.getBoundingClientRect();
  const left = Math.max(edge, Math.min(r.right - width, vw - width - edge));
  const top = vh - r.bottom - gap - edge >= height ? r.bottom + gap : r.top - gap - height >= edge ? r.top - gap - height : fit(r.bottom + gap);
  return { left, top, height };
}

/* ------------------------------------------------------------------ */
/* The 🎁 button and its tray                                          */
/* ------------------------------------------------------------------ */

let trayCache: GiftTrayDTO | null = null;

/**
 * Send a gift, like an emoji picker: the gifts with their Hype price, your balance (and a link to top up), and "Send
 * anonymously". Pick one, then Send. Not shown on your own things, in explicit communities, or signed out.
 */
export function GiftButton({ target, authorId, off, size = "md", variant = "plain", icon, className, onlyGiven, plainIcon }: { /** always the plain gift icon, never the top award (a message's hover bar: its awards already show under it) */ plainIcon?: boolean; /** shown only once it has gifts (a chat message's reaction area) */ onlyGiven?: boolean; /** the icon's size, to match the buttons beside it exactly */ icon?: number; target: GiftTarget; authorId: string; /** an explicit community, or anywhere gifts don't belong */ off?: boolean; size?: "sm" | "md"; /** "pill": beside the post's Comments and Share pills; "plain": beside the react (smile) button */ variant?: "pill" | "plain" | "summary"; className?: string }) {
  const { user } = useAuth();
  const s = useSummary(target);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const top = topGift(s);
  const canGift = !!user && !off && user.id !== authorId;
  // Reddit's awards: no gifts yet, the plain gift icon; with gifts, the top gift and how many in all (no "×")
  if ((!canGift || onlyGiven) && !top) return null;
  // the plain icon is only a way to send one: nothing to show where you can't
  if (plainIcon && !canGift) return null;
  const iconSize = icon ?? (variant === "pill" ? 21 : variant === "summary" ? 13 : size === "sm" ? 14 : 16);
  // the summary under a chat message: up to three awards overlapping, then "N awards" in gold
  const face = top && variant === "summary" ? (
    <>
      <span className="flex -space-x-1.5">
        {[...s!.items].sort((x, y) => y.count - x.count || y.price - x.price).slice(0, 3).map((g) => (
          <span key={g.giftId} className="inline-flex size-[18px] items-center justify-center rounded-full bg-surface ring-2 ring-[color-mix(in_oklab,#d4a72c_20%,var(--raised))]">
            <GiftArt gift={g} size={16} />
          </span>
        ))}
      </span>
      <span className="text-[12.5px] font-semibold text-[color-mix(in_oklab,#d4a72c_72%,var(--ink))]">{compactCount(s!.total)}</span>
    </>
  ) : top && !plainIcon ? (
    <>
      <span className="gift-hop" style={{ "--gift-delay": hopDelay(target.id) } as React.CSSProperties}>
        <GiftArt gift={top} size={iconSize + 3} />
      </span>
      <span className={cx("font-semibold tabular-nums", variant === "pill" ? "text-[14px] text-ink" : "font-mono text-[12.5px]")}>{compactCount(s!.total)}</span>
    </>
  ) : (
    <Icon name="gift" size={iconSize} />
  );
  const box = cx("inline-flex items-center justify-center gap-1 rounded-full", variant === "pill" ? "h-11 min-w-11 px-1.5 text-ink hover:text-ink-muted" : variant === "summary" ? "h-7 gap-1.5 bg-[color-mix(in_oklab,#d4a72c_20%,var(--raised))] pr-2.5 pl-1.5" : "text-ink-muted", variant === "pill" || variant === "summary" ? "" : top && !plainIcon ? (size === "sm" ? "h-7 px-1.5" : "h-8 px-2") : size === "sm" ? "size-7" : "size-8");
  const round = variant === "summary" ? { borderRadius: 9999 } : undefined;
  if (!canGift) return <span aria-label={`${s!.total} ${s!.total === 1 ? "award" : "awards"}`} className={cx(box, className)} style={round}>{face}</span>;
  return (
    <span className={cx("relative inline-flex", className)}>
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} aria-label={top ? `${s!.total} ${s!.total === 1 ? "award" : "awards"}. Send an award` : "Send an award"} aria-expanded={!!open} title="Send an award" style={round} className={cx(box, "transition hover:text-ink", variant === "pill" ? "hover:bg-raised" : "hover:bg-raised", open && "bg-raised text-ink")}>
        {/* the same line icon, size and colour as the buttons beside it; only the tray shows the colourful gifts */}
        {face}
      </button>
      {/* on the page itself, not inside the message: a scrolling list or a hover bar can't clip it */}
      {open && btn.current && createPortal(<GiftTray target={target} anchor={btn.current} initial={top?.giftId} onClose={() => setOpen(false)} onSent={(g) => celebrate(btn.current, g)} />, btn.current.closest("dialog") ?? document.body)}
    </span>
  );
}

/** What this has been given so far, at the top of the tray: 🌹 3  ❤️ 1 (never who). */
function TrayReceived({ target }: { target: GiftTarget }) {
  const s = useSummary(target);
  if (!s?.total) return null;
  return (
    <ul aria-label="Awards so far" className="mb-2 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line pb-2">
      {s.items.map((g) => (
        <li key={g.giftId} title={g.name} className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-muted">
          <GiftArt gift={g} size={18} />
          <span className="font-mono tabular-nums">{g.count}</span>
        </li>
      ))}
    </ul>
  );
}

/** The celebration for a gift just sent, from its button (loaded the first time someone sends one). */
function celebrate(el: HTMLElement | null, g: GiftDTO) {
  if (!el) return;
  const at = el.getBoundingClientRect();
  void import("./GiftBurst").then((m) => m.playGiftBurst(at, g, burstTier(g.price)));
}

function GiftTray({ target, anchor, initial, onClose, onSent }: { target: GiftTarget; /** the button it opened from: it stays beside it */ anchor: HTMLElement; /** a gift to start picked (tapped in a gift row) */ initial?: string; onClose: () => void; /** sent: celebrate it */ onSent?: (g: GiftDTO) => void }) {
  const toast = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<GiftTrayDTO | null>(trayCache);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<GiftDTO | null>(() => trayCache?.gifts.find((g) => g.id === initial) ?? null);
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  // one key per gift picked here: the same send twice (a double click, a slow network) is one gift
  const key = useRef(newClientKey());
  const [style, setStyle] = useState(() => placeTray(anchor));
  // not enough Hype: the packs, right here (loaded the first time it's needed)
  const [wallet, setWallet] = useState<GiftWalletDTO | null>(null);
  const [packNaira, setPackNaira] = useState<number | null>(null);
  const [paying, setPaying] = useState(false);

  // like Discord: while it's open the chat and page don't scroll (only the gifts inside it do); a resize re-places it
  useEffect(() => {
    const inside = (e: Event) => !!ref.current?.contains(e.target as Node);
    const hold = (e: Event) => !inside(e) && e.cancelable && e.preventDefault();
    const keys = (e: KeyboardEvent) => !inside(e) && ["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", " "].includes(e.key) && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable) && e.preventDefault();
    let frame = 0;
    const resized = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => (anchor.isConnected ? setStyle(placeTray(anchor)) : onClose()));
    };
    const opts = { capture: true, passive: false } as const;
    document.addEventListener("wheel", hold, opts);
    document.addEventListener("touchmove", hold, opts);
    document.addEventListener("keydown", keys, true);
    window.addEventListener("resize", resized);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("wheel", hold, opts);
      document.removeEventListener("touchmove", hold, opts);
      document.removeEventListener("keydown", keys, true);
      window.removeEventListener("resize", resized);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  useEffect(() => {
    // the celebration's code comes in now, while they pick, so it's ready the moment they send
    void import("./GiftBurst");
    GiftService.tray().then(
      (r) => {
        trayCache = r.data;
        setData(r.data);
        if (initial) setPicked((p) => p ?? r.data.gifts.find((g) => g.id === initial) ?? null);
      },
      (e) => setError(errorMessage(e)),
    );
    // outside the tray and its button (the button's own click closes it, so it doesn't close and reopen at once)
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node) && onClose();
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
      onSent?.(picked);
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
  // the Hype packs, in the same box: Send while short of Hype, or the + by your balance
  const [packsOpen, setPacksOpen] = useState(false);
  useEffect(() => {
    if (packsOpen && !wallet) GiftService.wallet().then((r) => setWallet(r.data), () => {});
  }, [packsOpen, wallet]);
  const pressSend = () => {
    if (!picked) return;
    if (short) {
      setPackNaira(null);
      return setPacksOpen(true);
    }
    void send();
  };
  const need = short && picked && data ? picked.hype - data.balance : 0;
  // the packs, and the smallest one that covers it ("Covers it"); none big enough: exactly what's missing
  const packs = wallet ? wallet.webPacks : [];
  const covers = short ? (packs.find((p) => p.hype >= need) ?? null) : null;
  const exact = Math.min(wallet?.customMax ?? Infinity, Math.max(wallet?.customMin ?? 0, need * HYPE_NAIRA));
  // short and no pack is big enough: exactly what's missing, as one more choice
  const choices = short && !packs.some((p) => p.hype >= need) ? [...packs, { naira: exact, hype: hypeForNaira(exact) }] : packs;
  const chosen = packNaira ?? covers?.naira ?? (short ? exact : (packs[1] ?? packs[0])?.naira ?? 0);
  const enough = !short || hypeForNaira(chosen) >= need;
  async function topUpAndSend() {
    if (!data || paying || !chosen) return;
    setPaying(true);
    try {
      const here = window.location.pathname + window.location.search;
      const res = await GiftService.topup(chosen, undefined, here);
      // short of Hype for an award: it goes out as soon as the payment's back
      if (short && picked) rememberAward({ reference: res.data.reference, giftId: picked.id, giftName: picked.name, target, anonymous, clientKey: key.current });
      window.location.href = res.data.authorizationUrl;
    } catch (e) {
      toast(errorMessage(e), "error");
      setPaying(false);
    }
  }
  const balance = data ? data.balance.toLocaleString("en-NG") : "";
  return (
    <div ref={ref} role="dialog" aria-label={packsOpen ? "Hype packs" : "Send an award"} style={style} className="fixed z-50 flex w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-card border border-line bg-surface shadow-xl">
      {!packsOpen ? (
        <>
          <div className="px-3 pt-3"><TrayReceived target={target} /></div>
          <p className="shrink-0 px-3 pb-1 pt-1 text-sm font-semibold">Awards</p>
          {!data ? (
            <div className="p-3">{error ? <p className="text-sm text-danger">{error}</p> : <Skeleton className="h-40" />}</div>
          ) : !data.enabled ? (
            <p className="p-3 text-sm text-ink-muted">Awards are switched off for now.</p>
          ) : (
            <>
              <div className="grid min-h-0 flex-1 grid-cols-4 content-start gap-1.5 overflow-y-auto px-2 pb-2 no-bar">
                {data.gifts.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setPicked(g)}
                    aria-pressed={picked?.id === g.id}
                    title={`${g.name}: ${g.hype.toLocaleString("en-NG")} Hype`}
                    className={cx("flex flex-col items-center gap-0.5 rounded-control p-1.5 transition hover:bg-raised", picked?.id === g.id && "bg-raised ring-2 ring-ink")}
                  >
                    <GiftArt gift={g} size={34} animate />
                    <span className="w-full truncate text-center text-[12px] font-medium">{g.name}</span>
                    <span className="flex items-center gap-1 font-mono text-[12px] text-ink-muted"><HypeCoin size={11} />{g.hype.toLocaleString("en-NG")}</span>
                  </button>
                ))}
              </div>
              <label className="flex shrink-0 items-center gap-2 px-3 pb-2 text-[13px]">
                <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="size-4 accent-[var(--color-accent-text)]" />
                Send anonymously
                <span className="text-ink-muted">(they see “Someone”)</span>
              </label>
            </>
          )}
          {/* your Hype and a way to top up, then Send */}
          <div className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-2.5">
            <HypeCoin size={18} />
            <span className="font-mono text-sm font-semibold tabular-nums">{balance}</span>
            <button type="button" onClick={() => (setPackNaira(null), setPacksOpen(true))} aria-label="Top up Hype" title="Top up Hype" className="inline-flex size-6 items-center justify-center rounded-full bg-ink text-canvas transition hover:opacity-80">
              <Icon name="plus" size={13} />
            </button>
            <span className="flex-1" />
            <button type="button" onClick={pressSend} disabled={!picked || busy || !data?.enabled} className="inline-flex h-9 items-center justify-center rounded-full bg-ink px-4 text-sm font-semibold text-canvas transition disabled:opacity-40">
              {busy ? "Sending…" : picked ? `Send ${picked.name}` : "Send"}
            </button>
          </div>
        </>
      ) : (
        <>
          {/* the Hype packs: short of Hype for the award picked, or topping up */}
          <div className="flex shrink-0 items-center gap-2 px-3 pb-1 pt-3">
            <button type="button" onClick={() => setPacksOpen(false)} aria-label="Back to awards" className="inline-flex size-7 items-center justify-center rounded-full transition hover:bg-raised">
              <Icon name="arrowdown" size={15} className="rotate-90" />
            </button>
            <p className="flex-1 text-sm font-semibold">{short ? "Not enough Hype" : "Top up Hype"}</p>
            <span className="text-[12px] text-ink-muted">Balance</span>
            <HypeCoin size={14} />
            <span className="font-mono text-[12px] font-semibold">{balance}</span>
          </div>
          {short && picked && <p className="px-3 pb-1 text-[13px] text-ink-muted">{picked.name} needs {need.toLocaleString("en-NG")} more Hype. Pick a pack: it sends as soon as it&apos;s paid.</p>}
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 no-bar">
            {!wallet ? (
              <Skeleton className="h-32" />
            ) : !wallet.canBuyWeb ? (
              <p className="text-[13px] text-ink-muted">For now, buy Hype in the Klique app.</p>
            ) : (
              <div role="radiogroup" aria-label="How much Hype" className="grid grid-cols-3 gap-1.5">
                {choices.map((p) => {
                  const on = chosen === p.naira;
                  return (
                    <button key={p.naira} type="button" role="radio" aria-checked={on} onClick={() => setPackNaira(p.naira)} className={cx("flex flex-col items-center justify-center gap-0.5 rounded-control border bg-raised/60 px-1 py-2.5 transition", on ? "border-2 border-ink" : "border-line hover:bg-raised")}>
                      <span className="flex items-center gap-1 font-mono text-[14px] font-semibold tabular-nums"><HypeCoin size={14} />{p.hype.toLocaleString("en-NG")}</span>
                      <span className="text-[12px] text-ink-muted">₦{p.naira.toLocaleString("en-NG")}</span>
                      {covers?.naira === p.naira && <span className="text-[11px] font-semibold">Covers it</span>}
                    </button>
                  );
                })}
              </div>
            )}
            <Link href="/settings?tab=hype" className="mt-3 block text-[12.5px] text-ink-muted hover:text-ink">Your Hype history and earnings</Link>
          </div>
          {wallet?.canBuyWeb && (
            <div className="shrink-0 border-t border-line px-3 py-2.5">
              <button type="button" onClick={() => void topUpAndSend()} disabled={paying || !enough || !chosen} className="inline-flex min-h-9 w-full items-center justify-center rounded-full bg-ink px-3 py-1.5 text-sm font-semibold text-canvas transition disabled:opacity-40">
                {paying ? "Opening checkout…" : short && picked ? `Get ${picked.name} - ₦${chosen.toLocaleString("en-NG")}` : `Get ${hypeForNaira(chosen).toLocaleString("en-NG")} Hype - ₦${chosen.toLocaleString("en-NG")}`}
              </button>
              <p className="mt-1.5 text-center text-[11.5px] text-ink-muted">Hype can&apos;t be refunded or swapped for cash.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
