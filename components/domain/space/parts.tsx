"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { errorMessage } from "@/app/ApiCore";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, ErrorState } from "@/components/ui/States";
import type { Role, SubVisibility } from "@/lib/types";

export function RoleBadge({ role }: { role: Role }) {
  if (role === "member") return null;
  return <Chip tone={role === "owner" ? "accent" : "accent2"}>{role === "owner" ? "Owner" : "Admin"}</Chip>;
}

/** Friendly rendering for a failed space fetch: 403 / 404 get their own copy. */
export function SpaceError({ status, message, onRetry, backHref = "/communities", backLabel = "Browse communities" }: { status: number | null; message: string | null; onRetry?: () => void; backHref?: string; backLabel?: string }) {
  if (status === 404) {
    return (
      <EmptyState icon="search" title="We couldn't find that" action={<Button href={backHref} variant="primary">{backLabel}</Button>}>
        It may have been deleted, or the link might be wrong.
      </EmptyState>
    );
  }
  if (status === 403) {
    return (
      <EmptyState icon="lock" title="You don't have access" action={<Button href={backHref} variant="primary">{backLabel}</Button>}>
        {message || "This space is private. Ask a member for an invite link."}
      </EmptyState>
    );
  }
  return <ErrorState message={message} onRetry={onRetry} />;
}

/** "⋯" button with a small popup menu. */
export function KebabMenu({ label, items }: { label: string; items: { label: string; onClick: () => void; danger?: boolean }[] }) {
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
    <div ref={wrap} className="relative inline-block">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex size-10 items-center justify-center rounded-full border border-line bg-surface text-ink transition hover:bg-raised"
      >
        <Icon name="more" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-48 animate-pop rounded-card border border-line bg-surface p-1.5 shadow-2xl">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className={`flex w-full items-center rounded-control px-3 py-2.5 text-left text-sm font-medium hover:bg-raised ${it.danger ? "text-danger" : "text-ink"}`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Confirm modal. Optionally asks for a typed phrase before enabling the button. Errors surface as toasts. */
export function ConfirmModal({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  danger = true,
  requireText,
  children,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  confirmLabel: string;
  danger?: boolean;
  requireText?: string;
  children?: ReactNode;
  onConfirm: () => Promise<void>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const ok = !requireText || typed.trim() === requireText;

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    try {
      await onConfirm();
      setTyped("");
      onClose();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} description={description} size="sm">
      <form onSubmit={go} className="space-y-4">
        {children}
        {requireText && <TextField label={`Type "${requireText}" to confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={danger ? "danger" : "primary"} loading={busy} disabled={!ok}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function VisibilityPicker({ value, onChange }: { value: SubVisibility; onChange: (v: SubVisibility) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-medium">Who can join?</legend>
      <div className="space-y-2">
        {(
          [
            ["parent", "Open to community members", "Anyone in the community can see this group and join."],
            ["private", "Invite-only", "Hidden from non-members. People join with an invite link."],
          ] as const
        ).map(([id, title, hint]) => (
          <label key={id} className="flex cursor-pointer gap-3 rounded-control border border-line bg-raised p-3 has-[:checked]:border-accent-text has-[:checked]:bg-surface">
            <input type="radio" name="visibility" checked={value === id} onChange={() => onChange(id)} className="mt-1 accent-[var(--accent-text)]" />
            <span>
              <span className="block text-sm font-semibold">{title}</span>
              <span className="block text-xs text-ink-muted">{hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

