"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CrewService } from "@/app/services/CrewService";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { useApi } from "@/lib/hooks/useApi";
import type { EventDTO } from "@/lib/types";
import { CrewRow } from "./parts";
import { StartCrewModal } from "./StartCrewModal";

/**
 * "Going together" on an event page: the crews heading there (yours first), and a button to start one.
 * Only for in-person events; nothing to show for online ones.
 */
export function EventCrews({ event }: { event: EventDTO }) {
  const router = useRouter();
  const { requireAuth } = useAuth();
  const { data, loading, error, reload } = useApi(() => CrewService.forEvent(event.id), [event.id], { key: `crews:${event.id}` });
  const [starting, setStarting] = useState(false);
  if (event.online) return null;

  const crews = data?.crews ?? [];
  const startButton = data?.canStart ? (
    <Button variant="primary" size="sm" onClick={() => requireAuth() && setStarting(true)}>
      <Icon name="plus" size={14} /> Start a crew
    </Button>
  ) : null;

  return (
    <section id="crews" aria-label="Going together" className="scroll-mt-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Going together</h2>
          <p className="text-sm text-ink-muted">{crews.length ? `${crews.length} ${crews.length === 1 ? "crew" : "crews"} heading there. Join one near you.` : "Crews meet up first and go together."}</p>
        </div>
        {startButton}
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-28" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : crews.length === 0 ? (
        <div className="rounded-card border border-dashed border-line p-5 text-center">
          <p className="text-sm font-medium">Going alone?</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
            {data?.canStart ? "Start a crew from your area. Pick a public meetup spot and people heading the same way can join you." : (data?.startBlockedReason ?? "No crews yet.")}
          </p>
          {data?.canStart && (
            <Button variant="primary" className="mt-3" onClick={() => requireAuth() && setStarting(true)}>
              <Icon name="plus" size={15} /> Start a crew
            </Button>
          )}
        </div>
      ) : (
        <>
          {data && !data.canJoin && !data.mine && data.startBlockedReason && <p className="mb-2 text-sm text-ink-muted">{data.startBlockedReason}</p>}
          <ul className="space-y-2.5">
            {crews.map((c) => (
              <li key={c.id}>
                <CrewRow crew={c} joinable={data?.canJoin ?? true} />
              </li>
            ))}
          </ul>
        </>
      )}

      {starting && (
        <StartCrewModal
          event={event}
          open
          onClose={() => setStarting(false)}
          onCreated={(crew) => {
            setStarting(false);
            void reload();
            router.push(`/crews/${crew.id}`);
          }}
        />
      )}
    </section>
  );
}
