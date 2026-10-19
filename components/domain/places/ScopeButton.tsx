"use client";

import { useState } from "react";
import { usePlace } from "@/components/providers/PlaceProvider";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { scopeFlag, scopeLabel, scopeTrail, type Scope } from "@/lib/places";
import { PlacePicker } from "./PlacePicker";

/** The "where am I looking" control. Shows the current place and opens the picker. Uses (and sets) the shared scope unless `value` is given. */
export function ScopeButton({
  variant = "field",
  value,
  onChange,
  counts,
  className,
}: {
  variant?: "field" | "pill" | "heading";
  value?: Scope;
  onChange?: (s: Scope) => void;
  counts?: Record<string, number>;
  className?: string;
}) {
  const place = usePlace();
  const [open, setOpen] = useState(false);
  const scope = value ?? place.scope;
  const set = onChange ?? place.setScope;

  return (
    <>
      {variant === "heading" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className={cx("group inline-flex max-w-full items-center gap-2 rounded-2xl border border-line bg-surface px-3.5 py-1 align-middle transition hover:border-ink-muted/60 hover:bg-raised", className)}
        >
          <span className="text-[0.7em] leading-none" aria-hidden="true">{scopeFlag(scope)}</span>
          <span className="truncate">{scopeLabel(scope)}</span>
          <Icon name="chevron-down" size={22} className="shrink-0 text-ink-muted transition group-hover:text-ink" />
        </button>
      ) : variant === "pill" ? (
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={cx("inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface pr-2.5 pl-3 text-[13px] font-semibold text-ink", className)}>
          <span aria-hidden="true">{scopeFlag(scope)}</span>
          <span className="max-w-[7.5rem] truncate">{scopeLabel(scope)}</span>
          <Icon name="chevron-down" size={13} className="text-ink-muted" />
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={cx("flex h-11 w-full items-center gap-2.5 rounded-control border border-line bg-surface px-3.5 text-left hover:bg-raised", className)}>
          <span className="text-base leading-none" aria-hidden="true">{scopeFlag(scope)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm leading-tight font-semibold">{scopeLabel(scope)}</span>
            <span className="block truncate text-[10px] leading-tight text-ink-muted">{scopeTrail(scope)}</span>
          </span>
          <Icon name="chevron-down" size={15} className="shrink-0 text-ink-muted" />
        </button>
      )}
      <PlacePicker open={open} onClose={() => setOpen(false)} value={scope} onChange={set} home={place.home} counts={counts} />
    </>
  );
}
