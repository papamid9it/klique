"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { EventDTO } from "@/lib/types";
import { CrewResults, useEventCrews } from "./CrewSearch";
import { StartCrewModal } from "./StartCrewModal";

/**
 * "Going together" on an event page: the crews heading there (yours first), and a button to start one.
 * Only for in-person events; nothing to show for online ones.
 */
export function EventCrews({ event }: { event: EventDTO }) {
  const router = useRouter();
  const { requireAuth } = useAuth();
  const crewsApi = useEventCrews(event.id);
  const { data, reload } = crewsApi;
  const [starting, setStarting] = useState(false);
  if (event.online) return null;

  const total = data && !crewsApi.query ? data.total : null;
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
          <p className="text-sm text-ink-muted">{total ? `${total} ${total === 1 ? "crew" : "crews"} heading there. Join one near you.` : "Crews meet up first and go together."}</p>
        </div>
        {startButton}
      </div>

      {data && !data.canJoin && !data.mine && data.startBlockedReason && data.total > 0 && <p className="mb-2 text-sm text-ink-muted">{data.startBlockedReason}</p>}
      <CrewResults
        crews={crewsApi}
        onStart={data?.canStart ? () => requireAuth() && setStarting(true) : undefined}
        empty={
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
        }
      />

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
