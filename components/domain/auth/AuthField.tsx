"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label: string;
  error?: string;
  hint?: string;
  /** shown under the input, e.g. a "Forgot your password?" link */
  below?: ReactNode;
};

/** The sign-in pages' input: small caps label with a required mark, roomy field, optional show/hide for passwords. */
export function AuthField({ label, error, hint, below, type, required, ...rest }: Props) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const isPassword = type === "password";
  const note = error ?? hint;
  return (
    <div>
      <label htmlFor={id} className={cx("mb-2 block text-xs font-bold tracking-[0.06em] uppercase", error ? "text-danger" : "text-ink-muted")}>
        {label}
        {required && <span aria-hidden="true" className="ml-1 text-danger">*</span>}
        {error && <span className="ml-1.5 font-medium tracking-normal normal-case">- {error}</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && shown ? "text" : type}
          required={required}
          aria-invalid={!!error}
          aria-describedby={note && !error ? `${id}-note` : undefined}
          className={cx(
            "h-12 w-full rounded-[10px] border bg-canvas px-3.5 text-[15px] text-ink transition placeholder:text-ink-muted/60 focus:border-accent-text disabled:opacity-60",
            error ? "border-danger" : "border-line",
            isPassword && "pr-16",
          )}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-pressed={shown}
            className="absolute inset-y-0 right-1.5 my-auto h-8 rounded-md px-2.5 text-xs font-semibold text-ink-muted hover:bg-raised hover:text-ink"
          >
            {shown ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {hint && !error && (
        <p id={`${id}-note`} className="mt-1.5 text-xs text-ink-muted">
          {hint}
        </p>
      )}
      {below}
    </div>
  );
}
