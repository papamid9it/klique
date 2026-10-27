"use client";

import { useEffect, useRef, useState } from "react";
import type { OverflowItem } from "@/components/domain/OverflowMenu";
import { useToast } from "@/components/providers/ToastProvider";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { REACTIONS, type ReactionKind } from "@/lib/reactions";

const coarse = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

/**
 * Press and hold on a touch screen (or the long-press menu the phone fires): opens the message's sheet. A scroll or a
 * lifted finger before the moment passes cancels it, so scrolling a chat never opens one. Nothing on a mouse.
 */
export function useLongPress(onLong: () => void, ms = 450) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
      cancel();
      timer.current = setTimeout(() => {
        timer.current = null;
        navigator.vibrate?.(10);
        onLong();
      }, ms);
    },
    onTouchMove: (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (start.current && Math.hypot(t.clientX - start.current.x, t.clientY - start.current.y) > 10) cancel();
    },
    onTouchEnd: cancel,
    onTouchCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      if (!coarse()) return; // a mouse's right-click keeps the browser's menu
      e.preventDefault();
      cancel();
      onLong();
    },
  };
}

/**
 * A message's actions on a phone, WhatsApp style: a sheet from the bottom with a row of quick reactions and the
 * message's actions (reply, copy, edit, delete, report…). A modal dialog, so it sits above everything, chat
 * panels inside pop-ups included. Tap outside, swipe the backdrop or press Esc to close.
 */
export function MessageSheet({ open, onClose, onReact, items, copyText }: { open: boolean; onClose: () => void; onReact?: (k: ReactionKind) => void; items: OverflowItem[]; copyText?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const toast = useToast();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const all: OverflowItem[] = [
    ...(copyText ? [{ label: "Copy text", icon: "copy" as const, onSelect: () => void navigator.clipboard?.writeText(copyText).then(() => toast("Copied", "success"), () => undefined) }] : []),
    ...items,
  ];
  const run = (fn: () => void) => {
    onClose();
    fn();
  };

  return (
    <dialog
      ref={ref}
      aria-label="Message actions"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto max-h-[80dvh] w-full max-w-none overflow-y-auto rounded-t-[1.25rem] border-0 border-t border-line bg-surface p-0 pb-[env(safe-area-inset-bottom)] text-ink shadow-2xl backdrop:bg-black/50 sm:mx-auto sm:mb-6 sm:max-w-sm sm:rounded-card sm:border"
    >
      {open && (
        <div className="p-3">
          <span className="mx-auto mb-3 block h-1 w-10 rounded-full bg-line" aria-hidden="true" />
          {onReact && (
            <div role="group" aria-label="React" className="mb-2 flex justify-between gap-1 rounded-full bg-raised p-1.5">
              {REACTIONS.map((r) => (
                <button key={r.id} type="button" aria-label={r.label} onClick={() => run(() => onReact(r.id))} className="inline-flex size-11 items-center justify-center rounded-full text-[24px] transition active:scale-90 active:bg-surface">
                  {r.emoji}
                </button>
              ))}
            </div>
          )}
          <ul className="divide-y divide-line overflow-hidden rounded-card bg-raised">
            {all.map((it) => (
              <li key={it.label}>
                <button type="button" onClick={() => run(it.onSelect)} className={cx("flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] font-medium transition active:bg-surface", it.danger ? "text-danger" : "text-ink")}>
                  {it.icon && <Icon name={it.icon} size={18} className={it.danger ? "" : "text-ink-muted"} />}
                  {it.label}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={onClose} className="mt-2 w-full rounded-card bg-raised py-3.5 text-[15px] font-semibold">
            Cancel
          </button>
        </div>
      )}
    </dialog>
  );
}

/** The sheet's open state with the long press that opens it. */
export function useMessageSheet() {
  const [open, setOpen] = useState(false);
  const press = useLongPress(() => setOpen(true));
  return { open, close: () => setOpen(false), press };
}

/** A row that opens a message's sheet on a long press (for lists that render messages inline). */
export function PressRow({ onLong, className, children }: { onLong: () => void; className?: string; children: React.ReactNode }) {
  const press = useLongPress(onLong);
  return (
    <div {...press} className={className}>
      {children}
    </div>
  );
}
