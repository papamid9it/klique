"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { SafetyService } from "@/app/services/SafetyService";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { LIMITS, REPORT_EMAIL, REPORT_REASONS, type ReportReason } from "@/lib/constants";
import type { ReportTargetType } from "@/lib/types";

/** Report a user, post, event, community, group or message. The server checks you're allowed to see it. */
export function ReportDialog({
  open,
  onClose,
  targetType,
  targetId,
  subject,
}: {
  open: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  /** shown in the title, e.g. "this event" or "@tobi" */
  subject: string;
}) {
  const toast = useToast();
  const [reason, setReason] = useState<ReportReason | "">("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) {
      setError("Pick a reason so we know what to look for.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await SafetyService.report({ targetType, targetId, reason, details: details.trim() || undefined });
      toast("Report sent. Thank you.", "success");
      setReason("");
      setDetails("");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Report ${subject}`} description="Reports are private. We'll review it and take action if it breaks the rules.">
      <form onSubmit={submit} className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium">What&apos;s going on?</legend>
          <div className="space-y-1.5">
            {REPORT_REASONS.map((r) => (
              <label key={r.id} className="flex cursor-pointer items-center gap-3 rounded-control border border-line bg-raised px-3.5 py-2.5 text-sm has-[:checked]:border-accent-text has-[:checked]:bg-surface">
                <input type="radio" name="reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} className="accent-[var(--accent-text)]" />
                {r.label}
              </label>
            ))}
          </div>
        </fieldset>
        <TextArea label="Anything else we should know? (optional)" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={LIMITS.reportDetails} counter={LIMITS.reportDetails} />
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
        {REPORT_EMAIL && (
          <p className="text-xs text-ink-muted">
            Urgent, or someone&apos;s in danger? Email{" "}
            <a href={`mailto:${REPORT_EMAIL}`} className="font-medium text-accent-text underline">
              {REPORT_EMAIL}
            </a>
            .
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>
            Send report
          </Button>
        </div>
      </form>
    </Modal>
  );
}
