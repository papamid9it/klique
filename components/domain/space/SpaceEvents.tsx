"use client";

import { EventService } from "@/app/services/EventService";
import { EventRow } from "@/components/domain/events/EventRow";
import { Button } from "@/components/ui/Button";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Icon } from "@/components/ui/Icon";
import { usePaged } from "@/lib/hooks/useApi";
import { useSteps } from "@/lib/hooks/useSteps";
import type { EventDTO } from "@/lib/types";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { useState } from "react";
import { useDebounced } from "@/lib/hooks/useApi";
import { FilterChip, FilterSearch, FilterSelect } from "./ListFilters";

type Show = "upcoming" | "going" | "past";
type When = "any" | "today" | "tomorrow" | "weekend" | "week" | "month";
type Price = "any" | "free" | "paid";
type Format = "any" | "in-person" | "online" | "stream";

/** `canSubmit`: a member who can send an event in for the owner or an admin to approve */
export function SpaceEvents({ slug, subSlug, canHost, canSubmit }: { slug: string; subSlug?: string; canHost: boolean; canSubmit?: boolean }) {
  // like the events page: search, Upcoming · Going · Past, when, price and where
  const [show, setShow] = useState<Show>("upcoming");
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 300);
  const [when, setWhen] = useState<When>("any");
  const [price, setPrice] = useState<Price>("any");
  const [format, setFormat] = useState<Format>("any");
  const filtered = !!dq || when !== "any" || price !== "any" || format !== "any";
  const params = { community: slug, sub: subSlug, scope: show === "going" ? ("going" as const) : ("all" as const), past: show === "past", q: dq || undefined, date: when, price, format };
  const pkey = JSON.stringify(params);
  const { items, loading, loadingMore, error, hasMore, loadMore, reload, setItems } = usePaged<EventDTO>(
    (page) => EventService.list({ ...params, page }),
    [pkey],
    { key: `space-events:${pkey}`, keepPrevious: true },
  );
  // a new event was posted here (or one changed): the list updates by itself
  useRealtimeEvent(() => void reload(), { filter: (e) => e.type === "notify" && e.category === "events", debounceMs: 800 });
  const steps = useSteps(items.length, hasMore, loadingMore, loadMore, pkey);
  const hostHref = `/events/new?community=${encodeURIComponent(slug)}${subSlug ? `&sub=${encodeURIComponent(subSlug)}` : ""}`;

  return (
    <div className="space-y-4">
      {(canHost || canSubmit) && (
        <div className="flex justify-end">
          <Button href={hostHref} variant={canHost ? "primary" : "secondary"}>
            <Icon name="plus" size={15} /> {canHost ? "Post an event" : "Suggest an event"}
          </Button>
        </div>
      )}
      <div role="tablist" aria-label="Filter events" className="flex flex-wrap items-center gap-2">
        <FilterSearch value={q} onChange={setQ} placeholder="Search these events" />
        {(["upcoming", "going", "past"] as const).map((s) => (
          <FilterChip key={s} label={s === "upcoming" ? "Upcoming" : s === "going" ? "Going" : "Past"} on={show === s} onClick={() => setShow(s)} />
        ))}
        <FilterSelect<When> label="When" value={when} onChange={setWhen} options={[{ id: "any", label: "Any" }, { id: "today", label: "Today" }, { id: "tomorrow", label: "Tomorrow" }, { id: "weekend", label: "This weekend" }, { id: "week", label: "Next 7 days" }, { id: "month", label: "Next 30 days" }]} />
        <FilterSelect<Price> label="Price" value={price} onChange={setPrice} options={[{ id: "any", label: "Any" }, { id: "free", label: "Free" }, { id: "paid", label: "Paid" }]} />
        <FilterSelect<Format> label="Where" value={format} onChange={setFormat} options={[{ id: "any", label: "Any" }, { id: "in-person", label: "In person" }, { id: "online", label: "Online" }, { id: "stream", label: "Live on Klique" }]} />
      </div>
      {loading && !items.length ? (
        <RowSkeleton rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        filtered || show !== "upcoming" ? (
          <EmptyState icon="calendar" title={show === "going" && !filtered ? "You're not going to any yet" : show === "past" && !filtered ? "No past events" : "Nothing matches"}>
            {filtered ? "Try other words or fewer filters." : show === "going" ? "Say you're going to an event and it shows up here." : "Events that have happened here show up here."}
          </EmptyState>
        ) : (
          <EmptyState icon="calendar" title="No upcoming events" action={canHost ? <Button href={hostHref} variant="primary">Post the first one</Button> : undefined}>
            {canHost ? "Nothing is planned yet. Get something on the calendar." : "Nothing is planned yet. Check back soon."}
          </EmptyState>
        )
      ) : (
        <>
          <div className="space-y-2.5">
            {items.slice(0, steps.shown).map((e) => (
              <EventRow key={e.id} event={e} onChange={(next) => setItems((prev) => prev.map((x) => (x.id === next.id ? next : x)))} />
            ))}
          </div>
          {steps.canMore && (
            <div className="flex justify-center">
              <Button onClick={steps.more} loading={steps.waiting}>
                See more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
