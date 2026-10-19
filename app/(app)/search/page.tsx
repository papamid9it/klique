"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DiscoverService } from "@/app/services/DiscoverService";
import { CommunityCard } from "@/components/domain/CommunityCard";
import { EventCard } from "@/components/domain/EventCard";
import { PersonRow } from "@/components/domain/PersonRow";
import { SectionHeader } from "@/components/domain/SectionHeader";
import { PageTitle } from "@/components/layout/PageTitle";
import { usePlace } from "@/components/providers/PlaceProvider";
import { TextField } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useApi, useDebounced } from "@/lib/hooks/useApi";
import type { EventDTO } from "@/lib/types";

function SearchView() {
  const router = useRouter();
  const params = useSearchParams();
  const { where, label } = usePlace();
  const urlQ = params.get("q") ?? "";
  const [text, setText] = useState(urlQ);
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
  const { data, loading, error, reload, setData } = useApi(q ? () => DiscoverService.search(q, where) : null, [q, where]);

  const updateEvent = (next: EventDTO) => setData((d) => (d ? { ...d, events: d.events.map((x) => (x.id === next.id ? next : x)) } : d));
  const total = data ? data.communities.length + data.events.length + data.people.length : 0;

  return (
    <div>
      <PageTitle title="Search" eyebrow="Find your scene" />
      <div role="search" className="mb-8 max-w-xl">
        <TextField label="Search communities, events and people" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Try “skate”, “Yaba” or a name" autoFocus />
      </div>

      {!q ? (
        <EmptyState icon="search" title="Search klique">
          Look up communities, events and people in {label === "Everywhere" ? "the whole world" : label}.
        </EmptyState>
      ) : loading ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data && total === 0 ? (
        <EmptyState icon="search" title={`Nothing found for “${q}”`}>
          Check the spelling or try a broader word.
        </EmptyState>
      ) : data ? (
        <div className="space-y-10">
          {data.communities.length > 0 && (
            <section aria-label="Communities">
              <SectionHeader title="Communities" />
              <div className="grid gap-4 sm:grid-cols-2">
                {data.communities.map((c) => (
                  <CommunityCard key={c.id} community={c} />
                ))}
              </div>
            </section>
          )}
          {data.events.length > 0 && (
            <section aria-label="Events">
              <SectionHeader title="Events" />
              <div className="grid gap-4 sm:grid-cols-2">
                {data.events.map((e) => (
                  <EventCard key={e.id} event={e} onChange={updateEvent} />
                ))}
              </div>
            </section>
          )}
          {data.people.length > 0 && (
            <section aria-label="People">
              <SectionHeader title="People" />
              <div className="grid gap-3 sm:grid-cols-2">
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
