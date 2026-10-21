"use client";

import { useState } from "react";
import { CrewService } from "@/app/services/CrewService";
import { EventService } from "@/app/services/EventService";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { RowSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { formatDateShort } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import { useAppEvent } from "@/lib/appEvents";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { softNavigate } from "@/lib/nav";
import type { EventDTO } from "@/lib/types";
import { CrewRow, crewHref } from "./parts";
import { StartCrewModal } from "./StartCrewModal";

/**
 * A community's (or group's) "Crews" view: pick one of its upcoming in-person events, see the crews heading
 * there, open one, or start your own. `eventId` comes from the address (?e=…); without it, the soonest event.
 */
export function CrewsBoard({ slug, sub, eventId, onChanged }: { slug: string; sub: string | null; eventId: string | null; onChanged: () => void }) {
  const events = useApi(() => EventService.list({ community: slug, sub: sub ?? undefined, page: 1 }), [slug, sub], { key: `crew-events:${slug}:${sub ?? ""}` });
  const upcoming = (events.data?.items ?? []).filter((e) => !e.online && !e.isPast);
  const base = `/communities/${slug}?${sub ? `g=${sub}&` : ""}view=crews`;

  if (events.loading) return <RowSkeleton rows={3} />;
  if (events.error) return <ErrorState message={events.error} onRetry={events.reload} />;
  if (!upcoming.length) {
    return (
      <EmptyState icon="calendar" title="No upcoming events to go to">
        Crews form around this {sub ? "group" : "community"}&apos;s in-person events. When one is posted, people can start crews for it here.
      </EmptyState>
    );
  }
  const event = upcoming.find((e) => e.id === eventId) ?? upcoming[0];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-ink">Crews</h2>
        <p className="text-sm text-ink-muted">Go together. Pick an event, join a crew from near you, or start one.</p>
      </div>

      {/* one chip per upcoming event; the chosen one shows its crews below */}
      <div role="tablist" aria-label="Events" className="no-bar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {upcoming.map((e) => {
          const on = e.id === event.id;
          return (
            <button
              key={e.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => softNavigate(`${base}&e=${e.id}`, { replace: true })}
              className={cx("shrink-0 rounded-card border px-3.5 py-2 text-left transition", on ? "border-accent-text bg-surface" : "border-line bg-surface/50 hover:border-ink-muted/50")}
            >
              <span className="block max-w-56 truncate text-sm font-semibold">{e.title}</span>
              <span className="block text-xs text-ink-muted">
                {formatDateShort(e.startsAt)} · {e.crewCount ? `${e.crewCount} ${e.crewCount === 1 ? "crew" : "crews"}` : "no crews yet"}
              </span>
            </button>
          );
        })}
      </div>

      <EventCrewList key={event.id} event={event} onChanged={onChanged} />
    </div>
  );
}

function EventCrewList({ event, onChanged }: { event: EventDTO; onChanged: () => void }) {
  const { requireAuth } = useAuth();
  const { data, loading, error, reload } = useApi(() => CrewService.forEvent(event.id), [event.id], { key: `crews:${event.id}` });
  // joined or left the community (Join buttons appear), or a crew of yours changed: the list follows
  useAppEvent("membership", () => void reload());
  useRealtimeEvent(() => void reload(), { filter: (e) => e.type === "crew" && !e.chat, debounceMs: 400 });
  const [starting, setStarting] = useState(false);
  const crews = data?.crews ?? [];
  const start = () => requireAuth() && setStarting(true);

  return (
    <section aria-label={`Crews for ${event.title}`} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface p-3.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{event.title}</p>
          <p className="truncate text-xs text-ink-muted">
            {formatDateShort(event.startsAt)} · {event.venue}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" href={`/events/${event.id}`}>
            Event details
          </Button>
          {data?.canStart && (
            <Button size="sm" variant="primary" onClick={start}>
              <Icon name="plus" size={14} /> Start a crew
            </Button>
          )}
        </div>
      </div>

      {/* outside the community (or group), or not signed in: say what it takes, before the list */}
      {data && !data.canJoin && !data.mine && data.startBlockedReason && crews.length > 0 && (
        <p className="flex items-center gap-2 rounded-control border border-line bg-raised px-3.5 py-2.5 text-sm">
          <Icon name="lock" size={15} className="shrink-0 text-ink-muted" />
          {data.startBlockedReason}
        </p>
      )}
      {loading ? (
        <Skeleton className="h-28" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : crews.length === 0 ? (
        <div className="rounded-card border border-dashed border-line p-6 text-center">
          <p className="text-sm font-medium">No crews for this one yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">{data?.canStart ? "Start one from your area. Pick a public meetup spot, and people heading the same way can join you." : (data?.startBlockedReason ?? "")}</p>
          {data?.canStart && (
            <Button variant="primary" className="mt-3" onClick={start}>
              <Icon name="plus" size={15} /> Start a crew
            </Button>
          )}
        </div>
      ) : (
        <>
          <ul className="space-y-2.5">
            {crews.map((c) => (
              <li key={c.id}>
                <CrewRow crew={c} joinable={data?.canJoin ?? true} />
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-xs text-ink-muted">
        Crews disappear a day after the event. Meet in public places.
      </p>

      {starting && (
        <StartCrewModal
          event={event}
          open
          onClose={() => setStarting(false)}
          onCreated={(crew) => {
            setStarting(false);
            void reload();
            onChanged();
            softNavigate(crewHref(crew));
          }}
        />
      )}
    </section>
  );
}
