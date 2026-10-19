"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/Field";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { cx } from "@/components/ui/cx";
import { relativeStamp } from "@/lib/format";
import type { AuditEntryDTO } from "@/lib/types";

/* Small pieces shared by the admin console pages. */

export function AdminHeader({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="display text-[clamp(1.75rem,3.5vw,2.25rem)]">{title}</h1>
        {children && <p className="mt-2 max-w-2xl text-[15px] text-ink-muted">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** A headline number with an optional comparison line and link. */
export function StatCard({ label, value, hint, icon, href, tone }: { label: string; value: number | string; hint?: ReactNode; icon: IconName; href?: string; tone?: "attention" }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow">{label}</p>
        <span className={cx("inline-flex size-8 items-center justify-center rounded-full", tone === "attention" ? "bg-accent text-accent-ink" : "bg-raised text-ink-muted")}>
          <Icon name={icon} size={15} />
        </span>
      </div>
      <p className="mt-3 font-mono text-[28px] leading-none font-semibold tracking-tight tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</p>
      {hint && <p className="mt-2 text-xs text-ink-muted">{hint}</p>}
    </>
  );
  const cls = "block rounded-card border border-line bg-surface p-4 transition";
  return href ? (
    <Link href={href} className={cx(cls, "hover:border-ink-muted/40 hover:bg-raised/40")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** "+12% vs last week" (or "No change"), in words a screen reader reads properly. */
export function Trend({ now, before, unit = "vs the 7 days before" }: { now: number; before: number; unit?: string }) {
  if (now === before) return <span>No change {unit}</span>;
  const up = now > before;
  const diff = before === 0 ? null : Math.round((Math.abs(now - before) / before) * 100);
  return (
    <span>
      <span className={up ? "text-success" : "text-danger"}>
        {up ? "▲" : "▼"} {diff === null ? `${Math.abs(now - before)} more` : `${diff}%`}
      </span>{" "}
      {unit}
    </span>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative block min-w-0 flex-1 sm:max-w-sm">
      <span className="sr-only">{placeholder}</span>
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted">
        <Icon name="search" size={15} />
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-control border border-line bg-surface pr-3 pl-9 text-sm text-ink placeholder:text-ink-muted/70 focus:border-accent-text"
      />
    </label>
  );
}

/** Compact segmented filter (one row, scrolls sideways on phones). */
export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string; count?: number | null }[]; onChange: (v: T) => void }) {
  return (
    <div role="tablist" aria-label={label} className="no-bar inline-flex max-w-full gap-1 overflow-x-auto rounded-control border border-line bg-surface p-1">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            className={cx("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[0.55rem] px-3 text-[13px] font-medium transition", on ? "bg-ink text-canvas" : "text-ink-muted hover:bg-raised hover:text-ink")}
          >
            {o.label}
            {o.count != null && o.count > 0 && <span className={cx("font-mono text-[11px]", on ? "opacity-70" : "")}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>;
}

const BADGE = {
  neutral: "border-line bg-raised text-ink-muted",
  good: "border-success/30 bg-success/10 text-success",
  bad: "border-danger/30 bg-danger/10 text-danger",
  accent: "border-transparent bg-accent/15 text-accent-text",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof BADGE; children: ReactNode }) {
  return <span className={cx("inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-[11px] font-semibold whitespace-nowrap", BADGE[tone])}>{children}</span>;
}

/** A bordered panel with an optional title row. */
export function Panel({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-card border border-line bg-surface", className)}>
      {title && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Column headings for a list laid out as a table on wider screens (hidden on phones, where rows stack). */
export function TableHead({ cols, template }: { cols: string[]; template: string }) {
  return (
    <div className={cx("hidden gap-4 border-b border-line px-4 py-2.5 md:grid", template)} aria-hidden="true">
      {cols.map((c, i) => (
        <span key={i} className="eyebrow">
          {c}
        </span>
      ))}
    </div>
  );
}

export function LoadMore({ hasMore, loading, onClick }: { hasMore: boolean; loading: boolean; onClick: () => void }) {
  if (!hasMore) return null;
  return (
    <div className="flex justify-center border-t border-line p-3">
      <Button size="sm" variant="ghost" onClick={onClick} loading={loading}>
        Load more
      </Button>
    </div>
  );
}

/** Confirm a serious action, with an optional private note for the audit log. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirm,
  danger = true,
  withNote = true,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirm: string;
  danger?: boolean;
  withNote?: boolean;
  onCancel: () => void;
  onConfirm: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onCancel} title={title} description={description} size="sm">
      <div className="space-y-4">
        {withNote && <TextArea label="Note for the audit log (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={3} />}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(note.trim());
                setNote("");
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirm}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const ACTION_LABEL: Record<string, { label: string; icon: IconName }> = {
  "report.dismiss": { label: "Dismissed a report about", icon: "x" },
  "content.delete": { label: "Deleted reported content", icon: "trash" },
  "user.suspend": { label: "Suspended", icon: "ban" },
  "user.restore": { label: "Restored", icon: "check" },
  "user.signout": { label: "Signed out everywhere", icon: "logout" },
  "host.grant": { label: "Made a verified host", icon: "megaphone" },
  "host.revoke": { label: "Removed verified host", icon: "megaphone" },
  "event.cancel": { label: "Cancelled event", icon: "calendar" },
  "event.restore": { label: "Un-cancelled event", icon: "calendar" },
  "event.delete": { label: "Deleted event", icon: "trash" },
  "community.delete": { label: "Deleted community", icon: "trash" },
  "draft.approve": { label: "Approved imported event", icon: "check" },
  "draft.reject": { label: "Rejected imported event", icon: "x" },
  "source.add": { label: "Added event source", icon: "link" },
  "source.remove": { label: "Removed event source", icon: "link" },
  "ad.create": { label: "Created ad", icon: "megaphone" },
  "ad.update": { label: "Edited ad", icon: "edit" },
  "ad.pause": { label: "Paused ad", icon: "megaphone" },
  "ad.resume": { label: "Resumed ad", icon: "megaphone" },
  "ad.delete": { label: "Deleted ad", icon: "trash" },
};

export const AUDIT_FILTERS: { id: string; label: string }[] = [
  { id: "", label: "Everything" },
  { id: "user.", label: "Accounts" },
  { id: "host.", label: "Hosting" },
  { id: "report.", label: "Reports" },
  { id: "content.", label: "Content" },
  { id: "event.", label: "Events" },
  { id: "community.", label: "Communities" },
  { id: "draft.", label: "Event inbox" },
  { id: "ad.", label: "Ads" },
];

export function AuditRow({ e, compact }: { e: AuditEntryDTO; compact?: boolean }) {
  const a = ACTION_LABEL[e.action] ?? { label: e.action, icon: "info" as IconName };
  const target = e.href ? (
    <Link href={e.href} className="font-medium text-ink hover:underline">
      {e.targetLabel}
    </Link>
  ) : (
    <span className="font-medium text-ink">{e.targetLabel}</span>
  );
  return (
    <li className={cx("flex gap-3", compact ? "px-4 py-3" : "px-4 py-3.5")}>
      <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-raised text-ink-muted">
        <Icon name={a.icon} size={13} />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="text-ink-muted">
          <span className="font-medium text-ink">{e.admin ? `@${e.admin.handle}` : "An admin"}</span> · {a.label} {target}
        </p>
        {e.note && !compact && <p className="mt-0.5 text-xs text-ink-muted">&ldquo;{e.note}&rdquo;</p>}
      </div>
      <time dateTime={e.createdAt} title={new Date(e.createdAt).toLocaleString()} className="shrink-0 font-mono text-[11px] text-ink-muted">
        {relativeStamp(e.createdAt)}
      </time>
    </li>
  );
}
