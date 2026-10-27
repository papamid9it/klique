"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CrewService } from "@/app/services/CrewService";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useApi } from "@/lib/hooks/useApi";
import type { EventDTO } from "@/lib/types";
import { CrewResults, useEventCrews } from "./CrewSearch";
import { crewsHref } from "./parts";
import { StartCrewModal } from "./StartCrewModal";

/**
 * "Going together" on an event's page: one line (how many crews, whether you're in one) and a link to the event's
 * crews page, which has the list. Only for in-person events.
 */
export function EventCrewsRow({ event }: { event: EventDTO }) {
  const { status } = useAuth();
  // just whether one is yours: the list itself is on the crews page
  const { data } = useApi(status === "authed" ? () => CrewService.forEvent(event.id, { limit: 1 }) : null, [event.id, status], { key: `crews-mine:${event.id}` });
  if (event.online) return null;
  const n = event.crewCount;
  return (
    <section aria-label="Going together" className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-4">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-raised text-accent-text">
        <Icon name="users" size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-semibold">
          Going together · {n ? `${n} ${n === 1 ? "crew" : "crews"}` : "no crews yet"}
          {data?.mine && <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">Yours</span>}
        </span>
        <span className="block text-xs text-ink-muted">{n ? "Meet up first with people from your area and go together." : "Start a crew from your area and meet up first."}</span>
      </span>
      <Button href={crewsHref(event)} size="sm">
        {data?.mine ? "Your crew" : n ? "See crews" : "Start a crew"}
      </Button>
    </section>
  );
}

/**
 * The crews heading to an event (yours first), searchable by area, and a button to start one: the event's crews
 * page. Only for in-person events; nothing to show for online ones.
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
