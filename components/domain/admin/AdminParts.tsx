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
export function StatCard({ label, value, hint, icon, href, tone, className }: { label: string; value: number | string; hint?: ReactNode; icon: IconName; href?: string; tone?: "attention"; className?: string }) {
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
  const cls = cx("block rounded-card border border-line bg-surface p-4 transition", className);
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

/** Each logged action as a sentence after the admin's name: `{t}` is the thing it was done to (linked while it exists). */
const ACTION_TEXT: Record<string, { text: string; icon: IconName }> = {
  "report.dismiss": { text: "dismissed a report about {t}", icon: "flag" },
  "content.delete": { text: "removed reported content: {t}", icon: "trash" },
  "user.suspend": { text: "suspended {t}", icon: "ban" },
  "user.restore": { text: "lifted the suspension on {t}", icon: "check" },
  "user.signout": { text: "signed {t} out everywhere", icon: "logout" },
  "host.grant": { text: "made {t} a verified host", icon: "megaphone" },
  "host.revoke": { text: "removed {t} as a verified host", icon: "megaphone" },
  "event.cancel": { text: "cancelled the event {t}", icon: "calendar" },
  "event.restore": { text: "brought back the event {t}", icon: "calendar" },
  "event.delete": { text: "deleted the event {t}", icon: "trash" },
  "community.delete": { text: "deleted the community {t}", icon: "trash" },
  "community.unadult": { text: "removed the 18+ label from {t}", icon: "hash" },
  "community.unexplicit": { text: "turned off explicit content in {t}", icon: "hash" },
  "draft.approve": { text: "approved the imported event {t}", icon: "check" },
  "draft.reject": { text: "rejected the imported event {t}", icon: "x" },
  "source.add": { text: "added the event source {t}", icon: "link" },
  "source.remove": { text: "removed the event source {t}", icon: "link" },
  "finder.search": { text: "ran the event finder for {t}", icon: "search" },
  "ad.create": { text: "created the ad {t}", icon: "megaphone" },
  "ad.update": { text: "edited the ad {t}", icon: "edit" },
  "ad.pause": { text: "paused the ad {t}", icon: "pause" },
  "ad.resume": { text: "resumed the ad {t}", icon: "play" },
  "ad.delete": { text: "deleted the ad {t}", icon: "trash" },
  "ad.approve": { text: "approved the ad request {t}", icon: "check" },
  "ad.changes": { text: "asked for changes to the ad request {t}", icon: "edit" },
  "ad.reject": { text: "turned down the ad request {t}", icon: "x" },
  "ad.mark-paid": { text: "marked the ad request {t} as paid", icon: "coin" },
  "ad.pricing": { text: "changed ad prices", icon: "coin" },
  "points.config": { text: "changed how points are earned", icon: "sliders" },
  "points.grant": { text: "gave points to {t}", icon: "coin" },
  "points.revoke": { text: "took points from {t}", icon: "coin" },
  "hype.grant": { text: "gave Hype to {t}", icon: "coin" },
  "hype.revoke": { text: "took Hype from {t}", icon: "coin" },
  "hype.config": { text: "changed Hype prices", icon: "coin" },
  "money.config": { text: "changed the fees", icon: "coin" },
  "payout.paid": { text: "paid out to {t}", icon: "coin" },
  "payout.rejected": { text: "turned down a payout for {t}", icon: "x" },
  "categories.save": { text: "updated the categories", icon: "folder" },
  "effect.add": { text: "added the profile effect {t}", icon: "asterisk" },
  "effect.edit": { text: "edited the profile effect {t}", icon: "asterisk" },
  "effect.remove": { text: "removed the profile effect {t}", icon: "trash" },
};

export const AUDIT_FILTERS: { id: string; label: string }[] = [
  { id: "", label: "Everything" },
  { id: "user.", label: "Accounts" },
  { id: "report.", label: "Reports" },
  { id: "content.", label: "Content" },
  { id: "event.", label: "Events" },
  { id: "community.", label: "Communities" },
  { id: "draft.", label: "Event inbox" },
  { id: "ad.", label: "Ads" },
  { id: "effect.", label: "Effects" },
  { id: "payout.", label: "Payouts" },
];

/** "fall-smoke" → "Fall smoke" (a removed effect is only logged by its slug) */
const unslug = (s: string) => (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(s) ? (s[0].toUpperCase() + s.slice(1)).replace(/-/g, " ") : s);

/** Runs of the same admin doing the same thing to the same target, one after another, as one row ("×3"). */
export function groupAudit(entries: AuditEntryDTO[]): { e: AuditEntryDTO; count: number }[] {
  const out: { e: AuditEntryDTO; count: number }[] = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    if (last && last.e.action === e.action && last.e.targetLabel === e.targetLabel && last.e.admin?.id === e.admin?.id) last.count++;
    else out.push({ e, count: 1 });
  }
  return out;
}

export function AuditRow({ e, compact, count = 1 }: { e: AuditEntryDTO; compact?: boolean; count?: number }) {
  const a = ACTION_TEXT[e.action] ?? { text: `${e.action.split(".").reverse().join(" ")} {t}`, icon: "info" as IconName };
  const label = unslug(e.targetLabel);
  const target = !label ? null : e.href ? (
    <Link href={e.href} className="font-medium text-ink hover:underline">
      {label}
    </Link>
  ) : (
    <span className="font-medium text-ink">{label}</span>
  );
  const [before, after = ""] = a.text.split("{t}");
  return (
    <li className={cx("flex gap-3", compact ? "px-4 py-3" : "px-4 py-3.5")}>
      <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-raised text-ink-muted">
        <Icon name={a.icon} size={13} />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="text-ink-muted [overflow-wrap:anywhere]">
          {e.admin ? (
            <Link href={`/?profile=${e.admin.handle}`} className="font-medium text-ink hover:underline">
              {e.admin.displayName}
            </Link>
          ) : (
            <span className="font-medium text-ink">An admin</span>
          )}{" "}
          {before}
          {a.text.includes("{t}") && target}
          {after}
          {count > 1 && <span className="ml-1.5 rounded-full bg-raised px-1.5 py-px font-mono text-[11px] text-ink-muted">×{count}</span>}
        </p>
        {e.note && !compact && <p className="mt-0.5 text-xs text-ink-muted [overflow-wrap:anywhere]">&ldquo;{e.note}&rdquo;</p>}
      </div>
      <time dateTime={e.createdAt} title={new Date(e.createdAt).toLocaleString()} className="mt-0.5 shrink-0 font-mono text-[11px] text-ink-muted">
        {relativeStamp(e.createdAt)}
      </time>
    </li>
  );
}
