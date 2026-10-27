"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { EventService } from "@/app/services/EventService";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import type { EventDTO } from "@/lib/types";

/** Approve a member's event, or turn it down with a reason the host sees. For owners, admins and site admins. */
export function ReviewButtons({ event, onDone, size = "md" }: { event: EventDTO; onDone: (e: EventDTO | null) => void; size?: "sm" | "md" }) {
  const toast = useToast();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  async function decide(decision: "approve" | "reject") {
    setBusy(decision);
    try {
      const res = await EventService.review(event.id, decision, reason);
      toast(decision === "approve" ? "Approved. It's posted and members will hear about it." : "Turned down. The host can see why.", "success");
      setRejecting(false);
      onDone(res.data);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Button size={size} variant="primary" loading={busy === "approve"} disabled={!!busy} onClick={() => void decide("approve")}>
        <Icon name="check" size={14} /> Approve
      </Button>
      <Button size={size} disabled={!!busy} onClick={() => setRejecting(true)}>
        Turn down
      </Button>
      <Modal open={rejecting} onClose={() => setRejecting(false)} title="Turn this event down?" description={`${event.host.displayName} will see your reason and can edit the event to send it again.`} size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void decide("reject");
          }}
          className="space-y-4"
        >
          <TextArea label="Why" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} counter={500} placeholder="e.g. Please add the venue and a start time." required autoFocus />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setRejecting(false)}>Cancel</Button>
            <Button type="submit" variant="danger" loading={busy === "reject"} disabled={!reason.trim()}>
              Turn down
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/**
 * On a member's event that isn't posted yet: for the owners and admins, who sent it and Approve / Turn down; for the
 * host, that it's waiting (or why it wasn't approved, and that editing sends it back).
 */
export function ReviewBar({ event, onChange, onEdit }: { event: EventDTO; onChange: (e: EventDTO) => void; onEdit: () => void }) {
  const r = event.review;
  if (!r) return null;
  const where = event.subcommunity?.name ?? event.community?.name ?? "the community";
  if (r.status === "pending" && event.viewer.canReview) {
    return (
      <section className="flex flex-wrap items-center gap-3 rounded-card border border-accent-text/40 bg-accent/10 p-4" aria-label="Waiting for your approval">
        <Icon name="clock" size={18} className="shrink-0 text-accent-text" />
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">{event.host.displayName}</span> sent this in for {where}. Nobody else sees it until it&apos;s approved.
        </p>
        <div className="flex gap-2">
          <ReviewButtons event={event} onDone={(e) => e && onChange(e)} />
        </div>
      </section>
    );
  }
  if (r.status === "pending") {
    return (
      <section className="flex items-start gap-3 rounded-card border border-line bg-raised/60 p-4" aria-label="Waiting for approval">
        <Icon name="clock" size={18} className="mt-0.5 shrink-0 text-accent-text" />
        <p className="text-sm">
          <span className="font-semibold">Waiting for approval.</span> <span className="text-ink-muted">{where}&apos;s owner and admins will take a look. Only you can see it until then, and you&apos;ll get a notification either way.</span>
        </p>
      </section>
    );
  }
  return (
    <section className="flex flex-wrap items-start gap-3 rounded-card border border-danger/40 bg-danger/10 p-4" aria-label="Not approved">
      <Icon name="x" size={18} className="mt-0.5 shrink-0 text-danger" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">Not approved in {where}</p>
        {r.reason && <p className="mt-0.5 text-ink-muted">&ldquo;{r.reason}&rdquo;</p>}
        <p className="mt-1 text-ink-muted">Fix it and save: it goes back to the owners and admins.</p>
      </div>
      {event.viewer.canEdit && (
        <Button size="sm" onClick={onEdit}>
          <Icon name="edit" size={14} /> Edit event
        </Button>
      )}
    </section>
  );
}
