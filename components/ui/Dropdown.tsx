"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icon";
import { cx } from "./cx";

type MenuItem = { type?: "item"; label: string; icon?: IconName; hint?: string; danger?: boolean; disabled?: boolean; leading?: ReactNode; checked?: boolean; onSelect: () => void };
export type MenuEntry =
  | MenuItem
  | { type: "sep" }
  | { type: "label"; label: string }
  /** a row that opens a second menu beside this one (on hover with a mouse, on tap, or → from the keyboard) */
  | { type: "submenu"; label: string; leading?: ReactNode; width?: number; items: MenuEntry[] };

const ITEM = "flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-left text-[14px] font-medium outline-none transition disabled:opacity-40";
const ITEM_TONE = "text-ink-muted hover:bg-accent hover:text-accent-ink focus-visible:bg-accent focus-visible:text-accent-ink";
const ITEMS = '[role^="menuitem"]:not([disabled])';

/**
 * Discord-style dropdown menu. The panel is rendered in a portal with fixed positioning,
 * so scrolling sidebars never clip it (or grow a scrollbar), and it flips to stay on screen. Inside a modal
 * <dialog> it portals into that dialog, since anything outside the dialog sits underneath it.
 * Keyboard: ↑ ↓ Home End move, Enter selects, → opens a submenu and ← leaves it, Esc closes and returns focus to the trigger.
 * A submenu opens to the side (the other side when there's no room) and stays open while the pointer crosses to it.
 */
export function Dropdown({
  items,
  trigger,
  align = "left",
  width = 224,
  label = "Menu",
  className,
}: {
  items: MenuEntry[];
  /** render the trigger; spread `props` onto a <button> */
  trigger: (a: { open: boolean; props: { type: "button"; "aria-haspopup": "menu"; "aria-expanded": boolean; "aria-controls": string | undefined; onClick: (e: React.MouseEvent) => void } }) => ReactNode;
  align?: "left" | "right";
  width?: number;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [host, setHost] = useState<Element | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const [sub, setSub] = useState<number | null>(null);
  const [subPos, setSubPos] = useState<{ top: number; left: number } | null>(null);
  const subPanel = useRef<HTMLDivElement>(null);
  const subFocus = useRef(false);
  const subTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const keepSub = () => {
    if (subTimer.current) clearTimeout(subTimer.current);
    subTimer.current = null;
  };
  const closeSub = useCallback(() => {
    keepSub();
    setSub(null);
    setSubPos(null);
  }, []);
  const openSub = (i: number, focus = false) => {
    keepSub();
    subFocus.current = focus;
    if (sub !== i) {
      setSub(i);
      setSubPos(null);
    } else if (focus) subPanel.current?.querySelector<HTMLElement>(ITEMS)?.focus();
  };
  // pointing at another row closes the submenu after a moment, so a diagonal path to it doesn't
  const leaveSub = () => {
    if (sub === null || subTimer.current) return;
    subTimer.current = setTimeout(closeSub, 250);
  };
  useEffect(() => keepSub, []);

  const close = useCallback(
    (refocus = false) => {
      setOpen(false);
      setPos(null);
      closeSub();
      if (refocus) anchor.current?.querySelector<HTMLElement>("button, a")?.focus();
    },
    [closeSub],
  );

  // Place the panel under the trigger, flipping up / sideways when it would leave the screen.
  useLayoutEffect(() => {
    if (!open) return;
    const a = anchor.current?.getBoundingClientRect();
    const p = panel.current?.getBoundingClientRect();
    if (!a || !p) return;
    const margin = 8;
    let left = align === "right" ? a.right - p.width : a.left;
    left = Math.min(Math.max(margin, left), window.innerWidth - p.width - margin);
    let top = a.bottom + 6;
    if (top + p.height > window.innerHeight - margin) top = Math.max(margin, a.top - p.height - 6);
    setPos({ top, left });
  }, [open, align]);

  // the submenu beside its row, on the other side when it wouldn't fit
  useLayoutEffect(() => {
    if (sub === null) return;
    const row = panel.current?.querySelector(`[data-sub="${sub}"]`)?.getBoundingClientRect();
    const box = panel.current?.getBoundingClientRect();
    const p = subPanel.current?.getBoundingClientRect();
    if (!row || !box || !p) return;
    const margin = 8;
    let left = box.right + 4;
    if (left + p.width > window.innerWidth - margin) left = Math.max(margin, box.left - p.width - 4);
    const top = Math.min(Math.max(margin, row.top - 6), window.innerHeight - p.height - margin);
    setSubPos({ top, left });
  }, [sub, pos]);

  useEffect(() => {
    if (sub !== null && subPos && subFocus.current) subPanel.current?.querySelector<HTMLElement>(ITEMS)?.focus({ preventScroll: true });
  }, [sub, subPos]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !subPanel.current?.contains(t) && !anchor.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const inSub = !!active && !!subPanel.current?.contains(active);
      if (inSub && (e.key === "Escape" || e.key === "ArrowLeft")) {
        e.preventDefault();
        e.stopPropagation();
        panel.current?.querySelector<HTMLElement>('[data-sub][aria-expanded="true"]')?.focus();
        closeSub();
        return;
      }
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
        return;
      }
      if (!inSub && e.key === "ArrowRight" && active?.dataset.sub) {
        e.preventDefault();
        active.click();
        return;
      }
      const els = Array.from((inSub ? subPanel.current : panel.current)?.querySelectorAll<HTMLElement>(ITEMS) ?? []);
      if (!els.length) return;
      const i = els.indexOf(document.activeElement as HTMLElement);
      const go = (n: number) => {
        e.preventDefault();
        els[n].focus();
      };
      if (e.key === "ArrowDown") go((i + 1) % els.length);
      else if (e.key === "ArrowUp") go((i - 1 + els.length) % els.length);
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(els.length - 1);
      else if (e.key === "Tab") close();
    };
    const away = () => close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", away);
    window.addEventListener("scroll", away, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", away);
      window.removeEventListener("scroll", away, true);
    };
  }, [open, close, closeSub]);

  // focus the first item once the panel is placed
  useEffect(() => {
    if (open && pos) panel.current?.querySelector<HTMLElement>(ITEMS)?.focus({ preventScroll: true });
  }, [open, pos]);

  if (!items.some((i) => !i.type || i.type === "item" || i.type === "submenu")) return null;

  const entries = (list: MenuEntry[], inSub: boolean) =>
    list.map((it, i) =>
      it.type === "sep" ? (
        <div key={`s${i}`} role="separator" className="mx-1 my-1.5 h-px bg-line" />
      ) : it.type === "label" ? (
        <p key={`l${i}`} className="eyebrow px-2.5 pt-2 pb-1">
          {it.label}
        </p>
      ) : it.type === "submenu" ? (
        <button
          key={it.label}
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={sub === i}
          data-sub={i}
          onPointerEnter={(e) => e.pointerType === "mouse" && openSub(i)}
          onClick={(e) => openSub(i, e.detail === 0)}
          className={cx(ITEM, ITEM_TONE, "aria-expanded:bg-accent aria-expanded:text-accent-ink")}
        >
          {it.leading}
          <span className="min-w-0 flex-1 truncate">{it.label}</span>
          <Icon name="chevron-right" size={14} className="shrink-0" />
        </button>
      ) : (
        <button
          key={it.label}
          type="button"
          role={it.checked === undefined ? "menuitem" : "menuitemradio"}
          aria-checked={it.checked}
          disabled={it.disabled}
          onPointerEnter={inSub ? undefined : (e) => e.pointerType === "mouse" && leaveSub()}
          onClick={() => {
            close();
            it.onSelect();
          }}
          className={cx(ITEM, it.danger ? "text-danger hover:bg-danger/15 focus-visible:bg-danger/15" : ITEM_TONE)}
        >
          {it.leading}
          <span className="min-w-0 flex-1 truncate">{it.label}</span>
          {it.hint && <span className="font-mono text-[11px] opacity-70">{it.hint}</span>}
          {it.icon && <Icon name={it.icon} size={16} className="shrink-0" />}
          {it.checked && <Icon name="check" size={16} className="shrink-0" />}
        </button>
      ),
    );
  const subEntry = sub === null ? null : items[sub];

  return (
    <span ref={anchor} className={cx("inline-flex", className)}>
      {trigger({
        open,
        props: {
          type: "button",
          "aria-haspopup": "menu",
          "aria-expanded": open,
          "aria-controls": open ? id : undefined,
          onClick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (open) close();
            else {
              setHost(anchor.current?.closest("dialog") ?? document.body);
              setOpen(true);
            }
          },
        },
      })}
      {open &&
        host &&
        createPortal(
          <>
            <div
              ref={panel}
              id={id}
              role="menu"
              aria-label={label}
              style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, width, visibility: pos ? "visible" : "hidden" }}
              className="fixed z-[300] animate-pop rounded-[10px] border border-line bg-canvas p-1.5 shadow-2xl ring-1 ring-black/20"
            >
              {entries(items, false)}
            </div>
            {subEntry?.type === "submenu" && (
              <div
                ref={subPanel}
                role="menu"
                aria-label={subEntry.label}
                onPointerEnter={keepSub}
                style={{ top: subPos?.top ?? 0, left: subPos?.left ?? 0, width: subEntry.width ?? 200, visibility: subPos ? "visible" : "hidden" }}
                className="fixed z-[301] animate-pop rounded-[10px] border border-line bg-canvas p-1.5 shadow-2xl ring-1 ring-black/20"
              >
                {entries(subEntry.items, true)}
              </div>
            )}
          </>,
          host,
        )}
    </span>
  );
}
