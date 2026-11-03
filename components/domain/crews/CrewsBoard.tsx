"use client";

import { useState } from "react";
import { EventService } from "@/app/services/EventService";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { formatDateShort } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import { softNavigate } from "@/lib/nav";
import type { EventDTO } from "@/lib/types";
import { CrewService } from "@/app/services/CrewService";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { CrewResults, useEventCrews } from "./CrewSearch";
import { KliqueCard, crewHref } from "./parts";
import { StartCrewModal } from "./StartCrewModal";

/** past this many upcoming events, the picker is a dropdown instead of a row of chips */
const CHIP_LIMIT = 6;
const crewsLabel = (n: number) => (n ? `${n} ${n === 1 ? "klique" : "kliques"}` : "no kliques yet");

/**
 * A community's (or group's) "Kliques" view: the community's own kliques ("who wants to…"), with Start a klique,
 * and its upcoming in-person events to go to together. `eventId` (?e=…) opens one event's kliques.
 */
export function CrewsBoard({ slug, sub, eventId, community, onChanged }: { slug: string; sub: string | null; eventId: string | null; community: { slug: string; name: string; interest: string }; onChanged: () => void }) {
  const { requireAuth } = useAuth();
  const events = useApi(() => EventService.list({ community: slug, sub: sub ?? undefined, page: 1 }), [slug, sub], { key: `crew-events:${slug}:${sub ?? ""}` });
  const kliques = useApi(() => CrewService.list({ community: slug, limit: 30 }), [slug], { key: `kliques:${slug}` });
  useRealtimeEvent(() => void kliques.reload(), { filter: (e) => e.type === "crew" && !e.chat, debounceMs: 400 });
  const [starting, setStarting] = useState(false);
  const upcoming = (events.data?.items ?? []).filter((e) => !e.online && !e.isPast);
  const base = `/communities/${slug}?${sub ? `g=${sub}&` : ""}view=kliques`;
  const event = eventId ? upcoming.find((e) => e.id === eventId) : undefined;

  if (event) {
    return (
      <div className="space-y-5">
        <button type="button" onClick={() => softNavigate(base, { replace: true })} className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
          <Icon name="chevron-left" size={15} /> All kliques
        </button>
        <EventCrewList key={event.id} event={event} onChanged={onChanged} />
      </div>
    );
  }

  const list = (kliques.data?.items ?? []).filter((k) => !sub || k.space?.sub === sub);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Kliques</h2>
          <p className="text-sm text-ink-muted">Get people together: a movie, a match, a run, a night out. Or go to an event together.</p>
        </div>
        {!sub && (
          <Button size="sm" variant="primary" onClick={() => requireAuth() && setStarting(true)}>
            <Icon name="plus" size={14} /> Start a klique
          </Button>
        )}
      </div>

      {kliques.loading && !kliques.data ? (
        <RowSkeleton rows={2} />
      ) : kliques.error && !kliques.data ? (
        <ErrorState message={kliques.error} onRetry={kliques.reload} />
      ) : list.length ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {list.map((k) => (
            <li key={k.id}>
              <KliqueCard crew={k} wide />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="users" title="No kliques yet">
          Start the first one. Pick a plan, add a picture, and people here can join you.
        </EmptyState>
      )}

      {upcoming.length > 0 && (
        <section aria-label="Go to an event together" className="space-y-2">
          <h3 className="text-sm font-semibold">Go to an event together</h3>
          {upcoming.length > CHIP_LIMIT ? (
            <label className="block">
              <span className="sr-only">Event</span>
              <span className="relative block">
                <select
                  value=""
                  onChange={(e) => e.target.value && softNavigate(`${base}&e=${e.target.value}`, { replace: true })}
                  className="h-11 w-full appearance-none truncate rounded-control border border-line bg-raised pr-9 pl-3.5 text-sm text-ink focus:border-accent-text focus:outline-none"
                >
                  <option value="">Pick an event · {upcoming.length} coming up</option>
                  {upcoming.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title} · {formatDateShort(e.startsAt)} · {crewsLabel(e.crewCount ?? 0)}
                    </option>
                  ))}
                </select>
                <Icon name="chevron-down" size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted" />
              </span>
            </label>
          ) : (
            <div className="no-bar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {upcoming.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => softNavigate(`${base}&e=${e.id}`, { replace: true })}
                  className={cx("shrink-0 rounded-card border border-line bg-surface/50 px-3.5 py-2 text-left transition hover:border-ink-muted/50")}
                >
                  <span className="block max-w-56 truncate text-sm font-semibold">{e.title}</span>
                  <span className="block text-xs text-ink-muted">
                    {formatDateShort(e.startsAt)} · {crewsLabel(e.crewCount ?? 0)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {starting && (
        <StartCrewModal
          community={community}
          open
          onClose={() => setStarting(false)}
          onCreated={(crew) => {
            setStarting(false);
            void kliques.reload();
            onChanged();
            softNavigate(crewHref(crew));
          }}
        />
      )}
    </div>
  );
}

function EventCrewList({ event, onChanged }: { event: EventDTO; onChanged: () => void }) {
  const { requireAuth } = useAuth();
  const crewsApi = useEventCrews(event.id);
  const { data, reload } = crewsApi;
  const [starting, setStarting] = useState(false);
  const start = () => requireAuth() && setStarting(true);

  return (
    <section aria-label={`Kliques for ${event.title}`} className="space-y-3">
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
              <Icon name="plus" size={14} /> Start a klique
            </Button>
          )}
        </div>
      </div>

      {/* outside the community (or group), or not signed in: say what it takes, before the list */}
      {data && !data.canJoin && !data.mine && data.startBlockedReason && data.total > 0 && (
        <p className="flex items-center gap-2 rounded-control border border-line bg-raised px-3.5 py-2.5 text-sm">
          <Icon name="lock" size={15} className="shrink-0 text-ink-muted" />
          {data.startBlockedReason}
        </p>
      )}
      <CrewResults
        crews={crewsApi}
        onStart={data?.canStart ? start : undefined}
        empty={
        <div className="rounded-card border border-dashed border-line p-6 text-center">
          <p className="text-sm font-medium">No kliques for this one yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">{data?.canStart ? "Start one from your area. Pick a public meetup spot, and people heading the same way can join you." : (data?.startBlockedReason ?? "")}</p>
          {data?.canStart && (
            <Button variant="primary" className="mt-3" onClick={start}>
              <Icon name="plus" size={15} /> Start a klique
            </Button>
          )}
        </div>
        }
      />
      <p className="text-xs text-ink-muted">
        Kliques disappear a day after the event. Meet in public places.
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
