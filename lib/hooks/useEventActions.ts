"use client";

import { useCallback, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { EventService } from "@/app/services/EventService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import type { EventDTO, RsvpStatus } from "@/lib/types";

/** RSVP + save for one event. Every call returns the updated event, which is handed to `onChange`. */
export function useEventActions(event: EventDTO, onChange: (e: EventDTO) => void) {
  const { requireAuth } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<"rsvp" | "save" | null>(null);

  const run = useCallback(
    async (kind: "rsvp" | "save", fn: () => Promise<{ data: EventDTO }>, ok?: string) => {
      setBusy(kind);
      try {
        const res = await fn();
        onChange(res.data);
        if (ok) toast(ok, "success");
      } catch (e) {
        toast(errorMessage(e), "error");
      } finally {
        setBusy(null);
      }
    },
    [onChange, toast],
  );

  /** Saying you're going when you already are just says so: cancelling is its own button, on the event's page. */
  const rsvp = useCallback(
    (status: RsvpStatus = "going", already?: string) => {
      if (!requireAuth()) return;
      if (event.viewer.rsvp === status) return toast(already ?? "You're already going. Open the event to cancel.");
      return run("rsvp", () => EventService.rsvp(event.id, status), status === "going" ? "You're in. See you there." : "Marked as interested");
    },
    [event.id, event.viewer.rsvp, requireAuth, run, toast],
  );

  const cancelRsvp = useCallback(() => run("rsvp", () => EventService.cancelRsvp(event.id), "RSVP cancelled"), [event.id, run]);

  const toggleSave = useCallback(() => {
    if (!requireAuth()) return;
    return run("save", () => (event.viewer.saved ? EventService.unsave(event.id) : EventService.save(event.id)), event.viewer.saved ? "Removed from saved" : "Saved for later");
  }, [event.id, event.viewer.saved, requireAuth, run]);

  return { busy, rsvp, cancelRsvp, toggleSave };
}
