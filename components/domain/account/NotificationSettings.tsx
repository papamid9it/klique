"use client";

import { InboxService } from "@/app/services/InboxService";
import { useToast } from "@/components/providers/ToastProvider";
import { errorMessage } from "@/app/ApiCore";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { useApi } from "@/lib/hooks/useApi";
import { NOTIFY_CATEGORIES, type NotifyCategory, type NotifyPrefs } from "@/lib/notifications";

/** A small on/off switch with its own label, for the two columns (In app, Push). */
function Toggle({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cx("relative h-6 w-11 shrink-0 rounded-full border transition disabled:opacity-40", on ? "border-accent bg-accent" : "border-line bg-raised")}
    >
      <span className={cx("absolute top-0.5 size-[18px] rounded-full transition-all", on ? "left-[22px] bg-accent-ink" : "left-0.5 bg-ink-muted")} />
    </button>
  );
}

/**
 * Settings → Notifications: one row per kind of notification, each with "In app" (the bell) and "Push" (phone and
 * browser). Changes save as you flip them.
 */
export function NotificationSettings() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useApi(() => InboxService.prefs(), [], { key: "notify-prefs" });

  async function set(id: NotifyCategory, field: "inApp" | "push", value: boolean) {
    const before = data;
    setData((d) => (d ? ({ ...d, [id]: { ...d[id], [field]: value } } as NotifyPrefs) : d));
    try {
      setData((await InboxService.updatePrefs({ [id]: { [field]: value } })).data);
    } catch (e) {
      setData(before);
      toast(errorMessage(e), "error");
    }
  }

  if (loading) return <Skeleton className="h-64" />;
  if (error || !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="overflow-hidden rounded-card border border-line">
      <div className="flex items-center gap-3 border-b border-line bg-raised/50 px-4 py-2 text-[11px] font-bold tracking-[0.08em] text-ink-muted uppercase">
        <span className="flex-1">Notify me about</span>
        <span className="w-11 text-center">In app</span>
        <span className="w-11 text-center">Push</span>
      </div>
      <ul className="divide-y divide-line">
        {NOTIFY_CATEGORIES.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{c.label}</span>
              <span className="mt-0.5 block text-xs text-ink-muted">{c.hint}</span>
            </span>
            {"pushOnly" in c ? <span className="w-11 text-center text-xs text-ink-muted">–</span> : <Toggle on={data[c.id].inApp} label={`${c.label}: in app`} onChange={(v) => void set(c.id, "inApp", v)} />}
            <Toggle on={data[c.id].push} label={`${c.label}: push`} onChange={(v) => void set(c.id, "push", v)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
