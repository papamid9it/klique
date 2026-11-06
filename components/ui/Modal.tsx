"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { cx } from "./cx";

/**
 * Accessible modal on the native <dialog>: focus is trapped, Esc closes,
 * and focus returns to the trigger. Backdrop click closes.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
  icon,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** a short question or warning: a round picture on top, everything centred */
  icon?: { name: IconName; danger?: boolean };
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cx(
        "rounded-card border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm",
        // phones: a sheet up from the bottom, full width; bigger screens: a centred box
        "max-sm:mx-0 max-sm:mt-auto max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 sm:m-auto sm:w-[calc(100%-2rem)]",
        size === "sm" ? "sm:max-w-sm" : size === "lg" ? "sm:max-w-2xl" : size === "xl" ? "sm:max-w-4xl" : "sm:max-w-md",
      )}
    >
      {open && (
        <div className="relative max-h-[90dvh] overflow-y-auto overscroll-contain p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-h-[85dvh] sm:p-6">
          <div className={icon ? "mb-5 text-center" : "mb-4 flex items-start justify-between gap-4"}>
            <div>
              {icon && (
                <span className={cx("mx-auto mb-3 inline-flex size-14 items-center justify-center rounded-full", icon.danger ? "bg-danger/12 text-danger" : "bg-raised text-accent-text")}>
                  <Icon name={icon.name} size={25} />
                </span>
              )}
              <h2 id={titleId} className={cx("font-semibold tracking-tight", icon ? "text-xl" : "text-lg")}>
                {title}
              </h2>
              {description && <p className={cx("mt-1 text-ink-muted", icon ? "text-[15px] leading-relaxed" : "text-sm")}>{description}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className={cx("inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink sm:size-9", icon ? "absolute top-2.5 right-2.5" : "-mt-1 -mr-1")}>
              <Icon name="x" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
