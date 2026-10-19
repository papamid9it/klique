"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";
import { cx } from "./cx";

/** Side drawer for small screens (channel list on the left, community info on the right). Esc / backdrop close it. */
export function SlideOver({ open, onClose, side, title, children }: { open: boolean; onClose: () => void; side: "left" | "right"; title: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70]">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cx("absolute inset-y-0 flex w-[min(340px,88vw)] flex-col bg-canvas shadow-2xl outline-none", side === "left" ? "left-0 border-r border-line" : "right-0 border-l border-line")}
      >
        <button type="button" onClick={onClose} aria-label="Close panel" className="absolute top-3 right-3 z-10 inline-flex size-9 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink">
          <Icon name="x" />
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
