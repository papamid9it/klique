"use client";

import { DiscoverService } from "@/app/services/DiscoverService";
import { EventHero } from "@/components/domain/EventHero";
import { SponsoredHero, useAdSlot, useAds } from "@/components/domain/ads/Sponsored";
import { BrowseScenes, EventSection, WeekStrip, YourPlans } from "@/components/domain/home/HomeSections";
import { usePlace } from "@/components/providers/PlaceProvider";
import { Button } from "@/components/ui/Button";
import { CardGridSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { DISCOVER_BANNER_ADS } from "@/lib/constants";
import { parseScope, scopeLabel, WORLD } from "@/lib/places";
import { formatEyebrowDate } from "@/lib/format";
import { useApi, useNow } from "@/lib/hooks/useApi";
import type { DiscoverDTO, EventDTO } from "@/lib/types";

export default function DiscoverPage() {
  const { where, label } = usePlace();
  const now = useNow(600_000);
  const { data, loading, error, reload, setData } = useApi(() => DiscoverService.discover(where), [where], { key: `discover:${where}` });

  const patchEvent = (next: EventDTO) => {
    const swap = (list: EventDTO[]) => list.map((e) => (e.id === next.id ? next : e));
    setData((d) =>
      d
        ? {
            ...d,
            featured: d.featured?.id === next.id ? next : d.featured,
            eventsNearYou: swap(d.eventsNearYou),
            yourPlans: swap(d.yourPlans),
            thisWeekend: swap(d.thisWeekend),
            fromCommunities: swap(d.fromCommunities),
            free: swap(d.free),
            online: swap(d.online),
          }
        : d,
    );
  };

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2.5" suppressHydrationWarning>
            {now ? formatEyebrowDate(now) : " "} · {label}
          </p>
          <h1 className="display text-[clamp(2.25rem,5vw,3.25rem)]">Find your people.</h1>
        </div>
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
  const [feedAd] = useAds("home-feed");
  // The banner is for sale: a paid ad for this place takes it, otherwise it's the featured event. It waits for the
  // answer (a moment) so the banner never swaps from one to the other in front of you.
  const hero = useAdSlot("home-hero", {}, DISCOVER_BANNER_ADS);
  const heroAd = hero.ads[0];
  // the featured event isn't lost when an ad takes the banner: it leads "Happening around you" instead
  const near = heroAd && data.featured && heroAd.event?.id !== data.featured.id ? [data.featured, ...data.eventsNearYou] : data.eventsNearYou;
  if (!data.featured && !data.eventsNearYou.length) {
    return (
      <EmptyState icon="calendar" title={`Nothing on in ${place} yet`} action={<Button href="/communities/new" variant="primary">Start a community</Button>}>
        Be the first to put something on the map here.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-12">
      <YourPlans events={data.yourPlans} />

      {!hero.ready ? <Skeleton className="h-[19rem] rounded-[1.25rem] sm:h-[22rem]" /> : heroAd ? <SponsoredHero ad={heroAd} /> : data.featured && <EventHero event={data.featured} />}

      <WeekStrip week={data.week} />

      <EventSection id="near-h" title="Happening around you" href="/events" events={near} onChange={onEvent} ad={feedAd} />
      <EventSection id="weekend-h" title="This weekend" href="/events?date=weekend" hrefLabel="All this weekend" events={data.thisWeekend} onChange={onEvent} />
      <EventSection id="communities-h" title="From your communities" events={data.fromCommunities} onChange={onEvent} />
      <EventSection id="free-h" title="Free to attend" href="/events?free=1" hrefLabel="All free events" events={data.free} onChange={onEvent} />
      <EventSection id="online-h" title="Online" href="/events?format=online" hrefLabel="All online events" events={data.online} onChange={onEvent} />

      <BrowseScenes scenes={data.yourScenes} />
    </div>
  );
}



