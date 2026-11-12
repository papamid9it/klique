"use client";

import { createPortal } from "react-dom";
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
import { burstTier, giftArtStill, giftTargetKey, type GiftTargetType } from "@/lib/gifts";
import type { GiftDTO, GiftSummaryDTO, GiftTrayDTO } from "@/lib/types";

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

function want(key: string) {
  if (known.has(key) || waiting.has(key)) return;
  waiting.add(key);
  if (!timer) timer = setTimeout(flush, 40);
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
  return (
    <div ref={ref} role="dialog" aria-label="Send an award" style={style} className="fixed z-50 flex w-[21rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-card border border-line bg-surface p-3 shadow-xl">
      <TrayReceived target={target} />
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <p className="flex-1 text-sm font-semibold">Send an award</p>
        <span className="font-mono text-[12px] text-ink-muted">{data ? `${data.balance.toLocaleString("en-NG")} Hype` : ""}</span>
        <Link href="/settings?tab=hype" className="rounded-full bg-raised px-2.5 py-1 text-[12px] font-semibold hover:bg-line">
          Top up
        </Link>
      </div>
      {!data ? (
        error ? <p className="p-2 text-sm text-danger">{error}</p> : <Skeleton className="h-40" />
      ) : !data.enabled ? (
        <p className="p-2 text-sm text-ink-muted">Awards are switched off for now.</p>
      ) : (
        <>
          <div className="-mx-1 grid min-h-0 flex-1 grid-cols-4 content-start gap-1.5 overflow-y-auto p-1.5 [scrollbar-width:thin]">
            {data.gifts.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setPicked(g)}
                aria-pressed={picked?.id === g.id}
                title={`${g.name}: ${g.hype.toLocaleString("en-NG")} Hype (₦${g.price.toLocaleString("en-NG")})`}
                className={cx("flex flex-col items-center gap-0.5 rounded-control p-1.5 transition hover:bg-raised", picked?.id === g.id && "bg-raised ring-2 ring-accent-text")}
              >
                <GiftArt gift={g} size={32} animate />
                <span className="w-full truncate text-center text-[11px] font-medium">{g.name}</span>
                <span className="font-mono text-[10.5px] text-ink-muted">{g.hype.toLocaleString("en-NG")} Hype</span>
              </button>
            ))}
          </div>
          <label className="mt-2 flex shrink-0 items-center gap-2 text-[13px]">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="size-4 accent-[var(--color-accent-text)]" />
            Send anonymously
            <span className="text-ink-muted">(they see “Someone”)</span>
          </label>
          {short && (
            <p className="mt-2 shrink-0 text-[12.5px] text-ink-muted">
              You need {(picked!.hype - data.balance).toLocaleString("en-NG")} more Hype.{" "}
              <Link href="/settings?tab=hype" className="font-semibold text-accent-text underline">
                Top up
              </Link>
            </p>
          )}
          <button type="button" onClick={() => void send()} disabled={!picked || busy || short} className="mt-2 inline-flex h-9 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-accent text-sm font-semibold text-accent-ink transition disabled:opacity-40">
            {busy ? "Sending…" : picked ? `Send ${picked.name} · ${picked.hype.toLocaleString("en-NG")} Hype` : "Pick an award"}
          </button>
        </>
      )}
    </div>
  );
}
