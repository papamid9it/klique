"use client";

import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";

/** A chip in a list's filter row (6px corners, filled when on), as in the app. */
export function FilterChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" role="tab" aria-selected={on} onClick={onClick} className={cx("inline-flex h-9 shrink-0 items-center rounded-[6px] px-3.5 text-[14px] transition", on ? "bg-ink font-bold text-canvas" : "border border-line font-semibold text-ink hover:bg-raised")}>
      {label}
    </button>
  );
}

/** A small dropdown in the filter row ("When: Any ▾"), highlighted when it isn't "Any". */
export function FilterSelect<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  const on = value !== options[0]?.id;
  return (
    <label className={cx("relative inline-flex h-9 shrink-0 items-center rounded-[6px] border pr-7 pl-3 text-[14px] font-semibold", on ? "border-accent-text text-ink" : "border-line text-ink")}>
      <span className="text-ink-muted">{label}:&nbsp;</span>
      <span>{options.find((o) => o.id === value)?.label}</span>
      <Icon name="chevron-down" size={14} className="pointer-events-none absolute right-2 text-ink-muted" />
      <select value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={label} className="absolute inset-0 cursor-pointer opacity-0">
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The search box at the start of a filter row. */
export function FilterSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative flex h-9 min-w-44 flex-1 items-center sm:max-w-64">
      <span className="sr-only">{placeholder}</span>
      <Icon name="search" size={15} className="pointer-events-none absolute left-3 text-ink-muted" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9 w-full rounded-[6px] border border-line bg-surface pr-3 pl-8 text-[14px] outline-none focus:border-ink-muted" />
    </label>
  );
}
