"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DiscoverService } from "@/app/services/DiscoverService";
import { CommunityCard } from "@/components/domain/CommunityCard";
import { SponsoredCard, useAds } from "@/components/domain/ads/Sponsored";
import { EventCard } from "@/components/domain/EventCard";
import { PersonRow } from "@/components/domain/PersonRow";
import { SectionHeader } from "@/components/domain/SectionHeader";
import { ScopeButton } from "@/components/domain/places/ScopeButton";
import { PageBanner, PillTabs } from "@/components/layout/PageTitle";
import { usePlace } from "@/components/providers/PlaceProvider";
import { Icon } from "@/components/ui/Icon";
import { CardGridSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useApi, useDebounced } from "@/lib/hooks/useApi";
import type { EventDTO } from "@/lib/types";

type Tab = "all" | "communities" | "events" | "people";
/** Same columns as the Communities page: up to 4 across on wide screens. */
const GRID = "grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

function SearchView() {
  const router = useRouter();
  const params = useSearchParams();
  const { where, label } = usePlace();
  const urlQ = params.get("q") ?? "";
  const [text, setText] = useState(urlQ);
  const [tab, setTab] = useState<Tab>("all");
  const debounced = useDebounced(text, 350);
  const lastPushed = useRef(urlQ);

  // typing -> URL
  useEffect(() => {
    const q = debounced.trim();
    if (q === lastPushed.current) return;
    lastPushed.current = q;
    router.replace(q ? `/search?q=${encodeURIComponent(q)}` : "/search", { scroll: false });
  }, [debounced, router]);

  // URL -> input (back/forward navigation or external link)
  useEffect(() => {
    if (urlQ !== lastPushed.current) {
      lastPushed.current = urlQ;
      setText(urlQ);
    }
  }, [urlQ]);

  const q = urlQ.trim();
  // a new search starts back on "All"
  const [tabFor, setTabFor] = useState(q);
  if (tabFor !== q) {
    setTabFor(q);
    setTab("all");
  }
  const { data, loading, error, reload, setData } = useApi(q ? () => DiscoverService.search(q, where) : null, [q, where]);

  const [searchAd] = useAds("search", { q }, !!q);
  const updateEvent = (next: EventDTO) => setData((d) => (d ? { ...d, events: d.events.map((x) => (x.id === next.id ? next : x)) } : d));
  const counts = { communities: data?.communities.length ?? 0, events: data?.events.length ?? 0, people: data?.people.length ?? 0 };
  const total = counts.communities + counts.events + counts.people;
  const show = (t: Exclude<Tab, "all">) => (tab === "all" || tab === t) && counts[t] > 0;

  return (
    <div>
      <PageBanner
        eyebrow="Search"
        title="Find your scene"
        footer={
          q && data && total > 0 ? (
            <PillTabs
              label="Result type"
              active={tab}
              onChange={setTab}
              items={[
                { id: "all", label: "All", count: total, icon: <Icon name="search" size={15} /> },
                { id: "communities", label: "Communities", count: counts.communities, icon: <Icon name="users" size={15} /> },
                { id: "events", label: "Events", count: counts.events, icon: <Icon name="calendar" size={15} /> },
                { id: "people", label: "People", count: counts.people, icon: <Icon name="user" size={15} /> },
              ]}
            />
          ) : undefined
        }
      >
        Communities, events and people in {label === "Everywhere" ? "the whole world" : label}.
      </PageBanner>

      <div role="search" aria-label="Search klique" className="mb-8 flex flex-wrap items-center gap-3">
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">Search communities, events and people</span>
          <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Try “skate”, “Yaba” or a name"
            autoFocus
            className="h-12 w-full rounded-full border border-line bg-surface pr-4 pl-11 text-[15px] text-ink placeholder:text-ink-muted/70 focus:border-accent-text focus:outline-none"
          />
        </label>
        <div className="w-full sm:w-72">
          <ScopeButton />
        </div>
      </div>

      {!q ? (
        <EmptyState icon="search" title="Search klique">
          Look up communities, events and people in {label === "Everywhere" ? "the whole world" : label}.
        </EmptyState>
      ) : loading ? (
        <CardGridSkeleton count={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data && total === 0 ? (
        <EmptyState icon="search" title={`Nothing found for “${q}”`}>
          Check the spelling, try a broader word, or search somewhere else.
        </EmptyState>
      ) : data ? (
        <div className="space-y-12">
          {show("communities") && (
            <section aria-label="Communities">
              <SectionHeader title={`Communities · ${counts.communities}`} />
              <div className={GRID}>
                {data.communities.map((c) => (
                  <CommunityCard key={c.id} community={c} />
                ))}
              </div>
            </section>
          )}
          {show("events") && (
            <section aria-label="Events">
              <SectionHeader title={`Events · ${counts.events}`} />
              <div className={GRID}>
                {searchAd && <SponsoredCard ad={searchAd} />}
                {data.events.map((e) => (
                  <EventCard key={e.id} event={e} onChange={updateEvent} />
                ))}
              </div>
            </section>
          )}
          {show("people") && (
            <section aria-label="People">
              <SectionHeader title={`People · ${counts.people}`} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {data.people.map((p) => (
                  <PersonRow key={p.id} user={p} />
                ))}
              </div>
            </section>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchView />
    </Suspense>
  );
}
