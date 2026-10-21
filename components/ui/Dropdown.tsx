"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icon";
import { cx } from "./cx";

export type MenuEntry =
  | { type?: "item"; label: string; icon?: IconName; hint?: string; danger?: boolean; disabled?: boolean; onSelect: () => void }
  | { type: "sep" }
  | { type: "label"; label: string };

/**
 * Discord-style dropdown menu. The panel is rendered in a portal with fixed positioning,
 * so scrolling sidebars never clip it (or grow a scrollbar), and it flips to stay on screen. Inside a modal
 * <dialog> it portals into that dialog, since anything outside the dialog sits underneath it.
 * Keyboard: ↑ ↓ Home End move, Enter selects, Esc closes and returns focus to the trigger.
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

  const close = useCallback((refocus = false) => {
    setOpen(false);
    setPos(null);
    if (refocus) anchor.current?.querySelector<HTMLElement>("button, a")?.focus();
  }, []);

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

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
        return;
      }
      const els = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
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
  }, [open, close]);

  // focus the first item once the panel is placed
  useEffect(() => {
    if (open && pos) panel.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus({ preventScroll: true });
  }, [open, pos]);

  if (!items.some((i) => !i.type || i.type === "item")) return null;

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
          <div
            ref={panel}
            id={id}
            role="menu"
            aria-label={label}
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, width, visibility: pos ? "visible" : "hidden" }}
            className="fixed z-[300] animate-pop rounded-[10px] border border-line bg-canvas p-1.5 shadow-2xl ring-1 ring-black/20"
          >
            {items.map((it, i) =>
              it.type === "sep" ? (
                <div key={`s${i}`} role="separator" className="mx-1 my-1.5 h-px bg-line" />
              ) : it.type === "label" ? (
                <p key={`l${i}`} className="eyebrow px-2.5 pt-2 pb-1">
                  {it.label}
                </p>
              ) : (
                <button
                  key={it.label}
                  type="button"
                  role="menuitem"
                  disabled={it.disabled}
                  onClick={() => {
                    close();
                    it.onSelect();
                  }}
                  className={cx(
                    "flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-left text-[14px] font-medium outline-none transition disabled:opacity-40",
                    it.danger ? "text-danger hover:bg-danger/15 focus-visible:bg-danger/15" : "text-ink-muted hover:bg-accent hover:text-accent-ink focus-visible:bg-accent focus-visible:text-accent-ink",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {it.hint && <span className="font-mono text-[11px] opacity-70">{it.hint}</span>}
                  {it.icon && <Icon name={it.icon} size={16} className="shrink-0" />}
                </button>
              ),
            )}
          </div>,
          host,
        )}
    </span>
  );
}
