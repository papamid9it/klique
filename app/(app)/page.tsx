"use client";

import { DiscoverService } from "@/app/services/DiscoverService";
import { EventsRow, HomeFeed, TOP_EVENTS, rankEvents } from "@/components/domain/home/HomeFeed";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePlace } from "@/components/providers/PlaceProvider";
import { ErrorState } from "@/components/ui/States";
import { formatEyebrowDate } from "@/lib/format";
import { useApi, useNow } from "@/lib/hooks/useApi";
import type { CommunityCardDTO, DiscoverDTO, EventDTO } from "@/lib/types";

/**
 * Home: upcoming events for you in a row at the top, then posts from your communities, with a trending post from
 * elsewhere now and then, sponsored cards, rows of more events and communities to join in between.
 */
export default function HomePage() {
  const { where, label } = usePlace();
  const now = useNow(600_000);
  const { user } = useAuth();
  const { data, loading, error, reload, setData } = useApi(() => DiscoverService.discover(where), [where], { key: `discover:${where}` });
  const patchCommunity = (c: CommunityCardDTO) => setData((d) => (d ? { ...d, suggestedCommunities: d.suggestedCommunities.map((x) => (x.id === c.id ? c : x)) } : d));
  // an RSVP shows wherever that event appears
  const patchEvent = (e: EventDTO) => {
    const swap = (list: EventDTO[]) => list.map((x) => (x.id === e.id ? e : x));
    setData((d): DiscoverDTO | null => (d ? { ...d, featured: d.featured?.id === e.id ? e : d.featured, eventsNearYou: swap(d.eventsNearYou), fromCommunities: swap(d.fromCommunities), thisWeekend: swap(d.thisWeekend), free: swap(d.free), online: swap(d.online), yourPlans: swap(d.yourPlans) } : d));
  };
  const events = rankEvents(data, user?.interests ?? []);

  return (
    <div className="space-y-9">
      <header>
        <p className="eyebrow mb-2.5" suppressHydrationWarning>
          {now ? formatEyebrowDate(now) : " "} · {label}
        </p>
        <h1 className="display text-[clamp(2.25rem,5vw,3.25rem)]">Find your people.</h1>
      </header>

      {error && !data ? <ErrorState message={error} onRetry={reload} /> : <EventsRow events={events} loading={loading} onEvent={patchEvent} />}

      <div className="mx-auto max-w-[730px]">
        <HomeFeed moreEvents={events.slice(TOP_EVENTS)} communities={data?.suggestedCommunities ?? []} onEvent={patchEvent} onCommunity={patchCommunity} />
      </div>
    </div>
  );
}
