"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { SpaceService } from "@/app/services/SpaceService";
import { PersonRow } from "@/components/domain/PersonRow";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useApi } from "@/lib/hooks/useApi";

/** Pending join requests for a private community. */
export function RequestsPanel({ slug, onDecided }: { slug: string; onDecided?: () => void }) {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useApi(() => SpaceService.requests(slug), [slug]);
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(id: string, action: "approve" | "reject") {
    setBusy(id);
    try {
      await SpaceService.decideRequest(slug, id, action);
      setData((prev) => (prev ?? []).filter((r) => r.id !== id));
      toast(action === "approve" ? "Request approved" : "Request declined", "success");
      onDecided?.();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <RowSkeleton rows={2} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const pending = (data ?? []).filter((r) => r.status === "pending");
  if (!pending.length) {
    return (
      <EmptyState icon="users" title="No pending requests" compact>
        When someone asks to join, they&apos;ll show up here.
      </EmptyState>
    );
  }
  return (
    <ul className="space-y-2">
      {pending.map((r) => (
        <li key={r.id} className="space-y-2">
          <PersonRow
            user={r.user}
            action={
              <div className="flex gap-1.5">
                <Button size="sm" variant="primary" loading={busy === r.id} onClick={() => decide(r.id, "approve")} aria-label={`Approve ${r.user.displayName}`}>
                  Approve
                </Button>
                <Button size="sm" disabled={busy === r.id} onClick={() => decide(r.id, "reject")} aria-label={`Decline ${r.user.displayName}`}>
                  Decline
                </Button>
              </div>
            }
          />
          {r.message && <p className="rounded-control bg-raised px-3.5 py-2 text-[13px] text-ink-muted">&ldquo;{r.message}&rdquo;</p>}
        </li>
      ))}
    </ul>
  );
}
