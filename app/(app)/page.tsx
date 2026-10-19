"use client";

import { DiscoverService } from "@/app/services/DiscoverService";
import { EventCard } from "@/components/domain/EventCard";
import { EventHero } from "@/components/domain/EventHero";
import { SectionHeader } from "@/components/domain/SectionHeader";
import { ScopeButton } from "@/components/domain/places/ScopeButton";
import { usePlace } from "@/components/providers/PlaceProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { CardGridSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { parseScope, scopeLabel, WORLD } from "@/lib/places";
import { formatEyebrowDate } from "@/lib/format";
import { useApi, useNow } from "@/lib/hooks/useApi";
import type { DiscoverDTO, EventDTO } from "@/lib/types";

export default function DiscoverPage() {
  const { where, label } = usePlace();
  const now = useNow(600_000);
  const { data, loading, error, reload, setData } = useApi(() => DiscoverService.discover(where), [where]);

  const patchEvent = (next: EventDTO) =>
    setData((d) =>
      d
        ? {
            ...d,
            featured: d.featured?.id === next.id ? next : d.featured,
            eventsNearYou: d.eventsNearYou.map((e) => (e.id === next.id ? next : e)),
          }
        : d,
    );

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2.5" suppressHydrationWarning>
            {now ? formatEyebrowDate(now) : " "} · {label}
          </p>
          <h1 className="display text-[clamp(2.25rem,5vw,3.25rem)]">Find your people.</h1>
          <div className="mt-3 max-w-xs"><ScopeButton /></div>
        </div>
        <Button href="/events/new" variant="ink" size="lg">
          <Icon name="plus" size={15} /> Host a thing
        </Button>
      </header>

      <div role="region" aria-label="For you">
        {loading ? (
            <div className="space-y-8">
              <Skeleton className="h-80 rounded-[1.25rem]" />
              <CardGridSkeleton count={2} />
            </div>
          ) : error || !data ? (
            <ErrorState message={error} onRetry={reload} />
          ) : (
            <ForYou data={data} onEvent={patchEvent} />
          )}
      </div>
    </div>
  );
}

function ForYou({ data, onEvent }: { data: DiscoverDTO; onEvent: (e: EventDTO) => void }) {
  const place = scopeLabel(parseScope(data.where) ?? WORLD);
  if (!data.featured && !data.eventsNearYou.length) {
    return (
      <EmptyState icon="calendar" title={`Nothing on in ${place} yet`} action={<><Button href="/events/new" variant="primary">Host an event</Button><Button href="/communities/new">Start a community</Button></>}>
        Be the first to put something on the map here.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-12">
      {data.featured && <EventHero event={data.featured} />}

      {data.eventsNearYou.length > 0 && (
        <section aria-labelledby="near-h">
          <SectionHeader title="Happening around you" href="/events" />
          <h2 id="near-h" className="sr-only">Happening around you</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {data.eventsNearYou.slice(0, 4).map((e) => (
              <EventCard key={e.id} event={e} onChange={onEvent} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}



