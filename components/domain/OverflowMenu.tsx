"use client";

import { Dropdown } from "@/components/ui/Dropdown";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";

export interface OverflowItem {
  label: string;
  icon?: IconName;
  danger?: boolean;
  onSelect: () => void;
}

/**
 * Small "⋯" menu. The list floats above the page (see Dropdown), so it never gets clipped by a card or makes
 * the page scroll sideways. Closes on outside click, scroll and Escape.
 */
export function OverflowMenu({ items, label = "More options", align = "right", className, compact }: { items: OverflowItem[]; label?: string; align?: "left" | "right"; className?: string; compact?: boolean }) {
  if (!items.length) return null;
  return (
    <Dropdown
      items={items}
      align={align}
      width={208}
      label={label}
      className={className}
      trigger={({ open, props }) => (
        <button
          {...props}
          aria-label={label}
          title={label}
          className={cx("inline-flex items-center justify-center rounded-full text-ink transition hover:bg-raised", compact ? "size-7 text-ink-muted" : "size-10 border border-line bg-surface", open && "bg-raised")}
        >
          <Icon name="more" size={18} />
        </button>
      )}
    />
  );
}
