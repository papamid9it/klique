"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { AttendanceService } from "@/app/services/AttendanceService";
import { PointsService } from "@/app/services/PointsService";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { TextField } from "@/components/ui/Field";
import { cx } from "@/components/ui/cx";
import { formatDateShort } from "@/lib/format";
import { useApi, useNow } from "@/lib/hooks/useApi";
import type { AttendanceDTO } from "@/lib/types";

/**
 * The host's "Who came?": tick off the people who showed up. Each tick earns them points (and the host a bit per
 * person). Opens from the event's start until a week after it ends.
 */
export function WhoCame({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const toast = useToast();
  const { data: mine } = useApi(() => PointsService.points(), [], { key: "my-points" });
  const worth = (id: string) => mine?.actions.find((a) => a.id === id)?.worth ?? 0;
  const { data, loading, error, reload, setData } = useApi(() => AttendanceService.attendance(eventId), [eventId], { key: `attendance:${eventId}` });
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const now = useNow();

  async function mark(ids: string[], attended: boolean, key: string) {
    setBusy(key);
    // tick at once; the server answers with the real list
    setData((d: AttendanceDTO | null) => (d ? { ...d, people: d.people.map((p) => (ids.includes(p.user.id) ? { ...p, attended } : p)) } : d));
    try {
      setData((await AttendanceService.setAttendance(eventId, ids, attended)).data);
    } catch (e) {
      toast(errorMessage(e), "error");
      void reload();
    } finally {
      setBusy(null);
    }
  }

  const people = data?.people ?? [];
  const needle = q.trim().toLowerCase().replace(/^@/, "");
  const list = needle ? people.filter((p) => p.user.displayName.toLowerCase().includes(needle) || p.user.handle.includes(needle)) : people;
  const came = people.filter((p) => p.attended).length;
  const left = people.filter((p) => !p.attended).map((p) => p.user.id);

  return (
    <Modal open onClose={onClose} title="Who came?" description={mine ? `Tick off everyone who showed up. Each person gets ${worth("attend")} points (more if they came with a crew), and you get ${worth("hostAttendee")} for each.` : "Tick off everyone who showed up. They earn points for coming, and you earn some for each."}>
      {loading ? (
        <Skeleton className="h-48 w-full rounded-card" />
      ) : error || !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data.open ? (
        <p className="text-sm text-ink-muted">{now && +new Date(data.opensAt) > +now ? `You can tick people off once it starts (${formatDateShort(data.opensAt)}).` : "It's been over a week since the event, so this is closed."}</p>
      ) : people.length === 0 ? (
        <p className="text-sm text-ink-muted">Nobody said they were going, so there&apos;s no one to tick off.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <span className="font-semibold">{came}</span> of {people.length} came
            </p>
            {left.length > 0 && (
              <Button size="sm" variant="ghost" loading={busy === "all"} onClick={() => void mark(left, true, "all")}>
                <Icon name="check" size={14} /> Everyone came
              </Button>
            )}
          </div>
          {people.length > 8 && <TextField label="Find someone" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or @handle" />}
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
            {list.map((p) => (
              <li key={p.user.id}>
                <button
                  type="button"
                  aria-pressed={p.attended}
                  disabled={busy === p.user.id}
                  onClick={() => void mark([p.user.id], !p.attended, p.user.id)}
                  className={cx("flex w-full items-center gap-3 rounded-control border px-3 py-2 text-left transition", p.attended ? "border-accent/60 bg-accent/10" : "border-line hover:bg-raised")}
                >
                  <Avatar name={p.user.displayName} src={p.user.avatarUrl} frame={p.user.avatarFrame} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{p.user.displayName}</span>
                    <span className="block truncate text-xs text-ink-muted">@{p.user.handle}</span>
                  </span>
                  <span className={cx("inline-flex size-6 items-center justify-center rounded-full border", p.attended ? "border-transparent bg-accent text-accent-ink" : "border-line text-transparent")}>
                    <Icon name="check" size={13} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-muted">Untick someone if you made a mistake. Open until {formatDateShort(data.closesAt)}.</p>
        </div>
      )}
    </Modal>
  );
}
