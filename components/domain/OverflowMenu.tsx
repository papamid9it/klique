"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";

export interface OverflowItem {
  label: string;
  icon?: IconName;
  danger?: boolean;
  onSelect: () => void;
}

/** Small "⋯" menu. Closes on outside click and Escape. */
export function OverflowMenu({ items, label = "More options", align = "right", className, compact }: { items: OverflowItem[]; label?: string; align?: "left" | "right"; className?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!items.length) return null;
  return (
    <div ref={wrap} className={cx("relative inline-block", className)}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx("inline-flex items-center justify-center rounded-full text-ink transition hover:bg-raised", compact ? "size-7 text-ink-muted" : "size-10 border border-line bg-surface")}
      >
        <Icon name="more" size={18} />
      </button>
      {open && (
        <div role="menu" className={cx("absolute z-50 mt-2 w-48 animate-pop rounded-card border border-line bg-surface p-1.5 shadow-2xl", align === "right" ? "right-0" : "left-0")}>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className={cx("flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left text-sm font-medium hover:bg-raised", it.danger ? "text-danger" : "text-ink")}
            >
              {it.icon && <Icon name={it.icon} size={15} />}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
