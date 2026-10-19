"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cx } from "./cx";

const CONTROL =
  "w-full rounded-control border border-line bg-raised px-3.5 text-[15px] text-ink placeholder:text-ink-muted/70 transition focus:border-accent-text disabled:opacity-60 aria-[invalid=true]:border-danger";

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (a: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
  htmlFor?: string;
}) {
  const auto = useId();
  const id = htmlFor ?? auto;
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint ? hintId : "", error ? errId : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-ink">
        {label}
      </label>
      {children({ id, describedBy, invalid: !!error })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & { label: string; hint?: string; error?: string; className?: string };

export function TextField({ label, hint, error, className, ...rest }: InputProps) {
  return (
    <Field label={label} hint={hint} error={error} htmlFor={rest.id}>
      {({ id, describedBy, invalid }) => <input id={id} aria-describedby={describedBy} aria-invalid={invalid} className={cx(CONTROL, "h-11", className)} {...rest} />}
    </Field>
  );
}

type AreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & { label: string; hint?: string; error?: string; counter?: number };

export function TextArea({ label, hint, error, counter, value, ...rest }: AreaProps) {
  const len = typeof value === "string" ? value.length : 0;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={rest.id}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <textarea id={id} value={value} aria-describedby={describedBy} aria-invalid={invalid} className={cx(CONTROL, "min-h-24 resize-y py-2.5 leading-relaxed")} {...rest} />
          {counter !== undefined && (
            <span className={cx("pointer-events-none absolute right-3 bottom-2 text-[11px]", len > counter ? "text-danger" : "text-ink-muted")}>
              {len}/{counter}
            </span>
          )}
        </div>
      )}
    </Field>
  );
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> & { label: string; hint?: string; error?: string; children: ReactNode; compact?: boolean };

export function SelectField({ label, hint, error, children, compact, ...rest }: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} htmlFor={rest.id}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <select id={id} aria-describedby={describedBy} aria-invalid={invalid} className={cx(CONTROL, "appearance-none pr-9", compact ? "h-9 text-sm" : "h-11")} {...rest}>
            {children}
          </select>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9.5 6 6 6-6" />
          </svg>
        </div>
      )}
    </Field>
  );
}

/** Accessible switch (role="switch"). */
export function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx("relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition disabled:opacity-50", checked ? "border-accent bg-accent" : "border-line bg-raised")}
      >
        <span className={cx("absolute top-0.5 left-0.5 size-[18px] rounded-full transition-transform", checked ? "translate-x-5 bg-accent-ink" : "bg-ink-muted")} />
      </button>
    </div>
  );
}
