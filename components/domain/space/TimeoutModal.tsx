"use client";

import { useState } from "react";
import ApiClient, { errorMessage } from "@/app/ApiCore";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { cx } from "@/components/ui/cx";

export const TIMEOUTS: { seconds: number; label: string }[] = [
  { seconds: 60, label: "60 seconds" },
  { seconds: 300, label: "5 minutes" },
  { seconds: 600, label: "10 minutes" },
  { seconds: 3600, label: "1 hour" },
  { seconds: 86_400, label: "1 day" },
  { seconds: 604_800, label: "1 week" },
];

/** "52m left", "3h left", "2d left" */
export function timeLeft(until: string, now: Date): string {
  const ms = Math.max(0, +new Date(until) - +now);
  if (ms < 60_000) return `${Math.ceil(ms / 1000)}s left`;
  if (ms < 3600_000) return `${Math.ceil(ms / 60_000)}m left`;
  if (ms < 86_400_000) return `${Math.ceil(ms / 3600_000)}h left`;
  return `${Math.ceil(ms / 86_400_000)}d left`;
}

/**
 * Time a member out (owners and admins above them): pick how long and, optionally, why. Until then they can read
 * but not post, react, vote or start events or kliques in the community. `lifting`: take it off early instead.
 */
export function TimeoutModal({ slug, user, lifting, onClose, onDone }: { slug: string; user: { id: string; displayName: string }; lifting?: boolean; onClose: () => void; onDone: (until: string | null) => void }) {
  const toast = useToast();
  const [seconds, setSeconds] = useState(600);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function go(s: number) {
    setBusy(true);
    try {
      const res = await new ApiClient().post<{ data: { timedOutUntil: string | null } }>(`/api/communities/${slug}/members/${user.id}/timeout`, { seconds: s, reason });
      toast(s ? `${user.displayName} is timed out` : `${user.displayName}'s timeout is lifted`, "success");
      onDone(res.data.timedOutUntil);
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(false);
    }
  }
  if (lifting) {
    return (
      <Modal open onClose={onClose} title={`Lift ${user.displayName}'s timeout?`} description="They can post and react again straight away. They're told." size="sm">
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void go(0)}>
            Lift timeout
          </Button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal open onClose={onClose} title={`Time out ${user.displayName}`} description="They can still read, but can't post, react, vote or start events or kliques here until it ends. They're told why." size="sm">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="How long">
          {TIMEOUTS.map((t) => (
            <button key={t.seconds} type="button" role="radio" aria-checked={seconds === t.seconds} onClick={() => setSeconds(t.seconds)} className={cx("rounded-control border px-2 py-2 text-[13px] font-medium transition", seconds === t.seconds ? "border-accent-text bg-accent/15 text-ink" : "border-line text-ink-muted hover:text-ink")}>
              {t.label}
            </button>
          ))}
        </div>
        <TextField label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Spamming links" hint="They see this. It also goes in the moderation log." />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={() => void go(seconds)}>
            Time out
          </Button>
        </div>
      </div>
    </Modal>
  );
}
