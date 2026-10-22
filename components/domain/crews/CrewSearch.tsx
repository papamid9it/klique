"use client";

import { useState, type ReactNode } from "react";
import { CrewService } from "@/app/services/CrewService";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { Button, Spinner } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { useAppEvent } from "@/lib/appEvents";
import { useApi, useDebounced } from "@/lib/hooks/useApi";
import { CrewRow } from "./parts";

const PAGE = 10;

/**
 * An event's crews as a searchable list: `q` finds crews by where they're coming from (the server matches the
 * area and the public note, never the members-only meetup point), 10 at a time with "Load more". The last
 * results stay on screen while the next ones load. Follows joins, leaves and new crews live.
 */
export function useEventCrews(eventId: string) {
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 300);
  const [limit, setLimit] = useState(PAGE);
  // a new search starts again from the first 10
  const [searched, setSearched] = useState(query);
  if (searched !== query) {
    setSearched(query);
    setLimit(PAGE);
  }
  const api = useApi(() => CrewService.forEvent(eventId, { q: query || undefined, limit }), [eventId, query, limit], { key: `crews:${eventId}:${query.toLowerCase()}:${limit}`, keepPrevious: true });
  // joined or left the community (Join buttons appear), or a crew changed: the list follows
  useAppEvent("membership", () => void api.reload());
  useRealtimeEvent(() => void api.reload(), { filter: (e) => e.type === "crew" && !e.chat, debounceMs: 400 });
  return { ...api, q, setQ, query, more: () => setLimit((n) => n + PAGE), busy: api.loading || api.refreshing || q.trim() !== query };
}

type EventCrews = ReturnType<typeof useEventCrews>;

/**
 * The search box, the list and "Load more". `empty` is what to show when the event has no crews at all;
 * a search that finds nothing says so and offers to start one from there (`onStart`, when you can).
 */
export function CrewResults({ crews: c, empty, onStart }: { crews: EventCrews; empty: ReactNode; onStart?: () => void }) {
  const { data, error, reload, q, setQ, query, busy } = c;
  if (!data) return error ? <ErrorState message={error} onRetry={reload} /> : <Skeleton className="h-28" />;
  if (!data.total && !query && !q) return <>{empty}</>;
  const list = data.crews;

  return (
    <div className="space-y-3">
      <label className="relative block">
        <span className="sr-only">Search crews by area</span>
        <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={40}
          placeholder="Search by area: Yaba, Oshodi, Lekki…"
          className="h-11 w-full rounded-control border border-line bg-raised pr-10 pl-10 text-[15px] text-ink placeholder:text-ink-muted/70 focus:border-accent-text focus:outline-none"
        />
        {busy && (
          <span className="absolute top-1/2 right-3.5 -translate-y-1/2 text-ink-muted" aria-hidden>
            <Spinner />
          </span>
        )}
      </label>
      {query && (
        <p className="text-xs text-ink-muted" aria-live="polite">
          {data.total ? `${data.total} ${data.total === 1 ? "crew" : "crews"} from “${query}”` : ""}
        </p>
      )}

      {error && <ErrorState message={error} onRetry={reload} />}
      {!list.length ? (
        <div className="rounded-card border border-dashed border-line p-6 text-center">
          <p className="text-sm font-medium">No crews from {query || "there"} yet</p>
          {onStart ? (
            <Button variant="primary" size="sm" className="mt-3" onClick={onStart}>
              <Icon name="plus" size={14} /> Start one
            </Button>
          ) : (
            <p className="mt-1 text-sm text-ink-muted">Try another area, or a shorter name.</p>
          )}
        </div>
      ) : (
        <ul className={busy ? "space-y-2.5 opacity-70 transition-opacity" : "space-y-2.5 transition-opacity"}>
          {list.map((crew) => (
            <li key={crew.id}>
              <CrewRow crew={crew} joinable={data.canJoin} />
            </li>
          ))}
        </ul>
      )}
      {data.hasMore && (
        <div className="flex justify-center">
          <Button size="sm" onClick={c.more} loading={c.loading || c.refreshing}>
            Load more · {data.total - list.length} more
          </Button>
        </div>
      )}
    </div>
  );
}
