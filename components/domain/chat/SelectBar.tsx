"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";

/**
 * Select mode in a chat (like WhatsApp): this bar sits over the top of the messages while you pick them. Tap messages
 * to add or take them out, then Delete them all at once; Cancel (or Esc) leaves.
 */
export function SelectBar({ count, onDelete, onCancel, busy }: { count: number; onDelete: () => void; onCancel: () => void; busy?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div role="toolbar" aria-label="Selected messages" className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2 sm:px-5">
      <button type="button" onClick={onCancel} aria-label="Cancel selecting" className="inline-flex size-9 items-center justify-center rounded-full text-ink hover:bg-raised">
        <Icon name="x" size={18} />
      </button>
      <p className="flex-1 text-[15px] font-semibold" aria-live="polite">
        {count} selected
      </p>
      <Button size="sm" variant="danger" onClick={onDelete} disabled={!count} loading={busy}>
        <Icon name="trash" size={15} /> Delete
      </Button>
    </div>
  );
}

/** The round tick beside a message in Select mode. */
export function SelectTick({ on, className }: { on: boolean; className?: string }) {
  return (
    <span aria-hidden="true" className={cx("inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition", on ? "border-accent bg-accent text-accent-ink" : "border-ink-muted/60", className)}>
      {on && <Icon name="check" size={12} strokeWidth={3} />}
    </span>
  );
}
