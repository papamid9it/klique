"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DiscoverService } from "@/app/services/DiscoverService";
import { CommunityCard } from "@/components/domain/CommunityCard";
import { SponsoredCard, useAds } from "@/components/domain/ads/Sponsored";
import { EventCard } from "@/components/domain/EventCard";
import { PersonRow } from "@/components/domain/PersonRow";
import { SectionHeader } from "@/components/domain/SectionHeader";
import { ScopeButton } from "@/components/domain/places/ScopeButton";
import { PageBanner, PillTabs } from "@/components/layout/PageTitle";
import { PagePanel, PanelItem, PanelSection } from "@/components/layout/PagePanel";
import { usePlace } from "@/components/providers/PlaceProvider";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { SlideOver } from "@/components/ui/SlideOver";
import { CardGridSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { DATE_FILTERS } from "@/lib/dates";
import { useApi, useDebounced } from "@/lib/hooks/useApi";
import { useCategories } from "@/lib/hooks/useCategories";
import type { EventDTO, SearchFilters } from "@/lib/types";

type Tab = "all" | "communities" | "events" | "people";
/** Same columns as the Communities page: up to 4 across on wide screens. */
const GRID = "grid gap-5 min-[540px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

const SORTS: { id: NonNullable<SearchFilters["sort"]>; label: string }[] = [
  { id: "best", label: "Best match" },
  { id: "new", label: "Newest" },
  { id: "popular", label: "Most people" },
];
const PRICES: { id: NonNullable<SearchFilters["price"]>; label: string }[] = [
  { id: "any", label: "Any price" },
  { id: "free", label: "Free" },
  { id: "paid", label: "Paid" },
];
const FORMATS: { id: NonNullable<SearchFilters["format"]>; label: string }[] = [
  { id: "any", label: "In person or online" },
  { id: "in-person", label: "In person" },
  { id: "online", label: "Online" },
];
const WHAT_SHOWN = 6;

/** Everything that narrows a search, read from and written to the address, so a search can be shared. */
function useSearchFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const v = params.get(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  };
  const filters = {
    interest: params.get("interest") ?? "",
    when: params.get("when") ?? "any",
    price: pick("price", ["any", "free", "paid"] as const, "any"),
    format: pick("format", ["any", "in-person", "online"] as const, "any"),
    past: params.get("past") === "1",
    verified: params.get("verified") === "1",
    sort: pick("sort", ["best", "new", "popular"] as const, "best"),
  };
  const set = useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      const qs = next.toString();
      router.replace(qs ? `/search?${qs}` : "/search", { scroll: false });
    },
    [router],
  );
  const active = [filters.interest, filters.when !== "any", filters.price !== "any", filters.format !== "any", filters.past, filters.verified, filters.sort !== "best"].filter(Boolean).length;
  const clear = () => set({ interest: "", when: "", price: "", format: "", past: "", verified: "", sort: "" });
  return { filters, set, active, clear };
}
type Filtering = ReturnType<typeof useSearchFilters>;

/** The filters: in the left panel on big screens, and in a sheet behind "Filters" on phones. */
function SearchFiltersList({ f }: { f: Filtering }) {
  const categories = useCategories();
  const [allWhat, setAllWhat] = useState(false);
  const { filters: v, set } = f;
  const what = allWhat ? categories : categories.filter((c, i) => i < WHAT_SHOWN || c.id === v.interest);
  return (
    <div className="space-y-5">
      <PanelSection title="Where">
        <div className="px-1 pb-1">
          <ScopeButton className="w-full" />
        </div>
      </PanelSection>
      <PanelSection title="Sort by">
        <ul>
          {SORTS.map((o) => (
            <li key={o.id}>
              <PanelItem onClick={() => set({ sort: o.id === "best" ? "" : o.id })} on={v.sort === o.id} icon={o.id === "best" ? "search" : o.id === "new" ? "clock" : "users"}>
                {o.label}
              </PanelItem>
            </li>
          ))}
        </ul>
      </PanelSection>
      <PanelSection title="What it's about">
        <ul>
          <li>
            <PanelItem onClick={() => set({ interest: "" })} on={!v.interest} icon="asterisk">
              Everything
            </PanelItem>
          </li>
          {what.map((c) => (
            <li key={c.id}>
              <PanelItem onClick={() => set({ interest: v.interest === c.id ? "" : c.id })} on={v.interest === c.id} glyph={c.glyph}>
                {c.short}
              </PanelItem>
            </li>
          ))}
        </ul>
        {categories.length > WHAT_SHOWN && (
          <button type="button" onClick={() => setAllWhat((x) => !x)} className="h-8 px-3 text-[13px] font-medium text-accent-text hover:underline">
            {allWhat ? "Show less" : "Show more"}
          </button>
        )}
      </PanelSection>
      <PanelSection title="Event date">
        <ul>
          {DATE_FILTERS.map((d) => (
            <li key={d.id}>
              <PanelItem onClick={() => set({ when: d.id === "any" ? "" : d.id, past: "" })} on={!v.past && v.when === d.id} icon="clock">
                {d.label}
              </PanelItem>
            </li>
          ))}
          <li>
            <PanelItem onClick={() => set({ past: v.past ? "" : "1", when: "" })} on={v.past} icon="clock">
              Past events
            </PanelItem>
          </li>
        </ul>
      </PanelSection>
      <PanelSection title="Event price">
        <ul>
          {PRICES.map((o) => (
            <li key={o.id}>
              <PanelItem onClick={() => set({ price: o.id === "any" ? "" : o.id })} on={v.price === o.id} icon="check">
                {o.label}
              </PanelItem>
            </li>
          ))}
        </ul>
      </PanelSection>
      <PanelSection title="Event type">
        <ul>
          {FORMATS.map((o) => (
            <li key={o.id}>
              <PanelItem onClick={() => set({ format: o.id === "any" ? "" : o.id })} on={v.format === o.id} icon={o.id === "online" ? "globe" : "pin"}>
                {o.label}
              </PanelItem>
            </li>
          ))}
        </ul>
      </PanelSection>
      <div className="px-3">
        <Switch checked={v.verified} onChange={(on) => set({ verified: on ? "1" : "" })} label="Verified communities" hint="Only communities with the gold check" />
      </div>
      {f.active > 0 && (
        <button type="button" onClick={f.clear} className="h-9 px-3 text-sm font-medium text-accent-text hover:underline">
          Clear filters
        </button>
      )}
    </div>
  );
}

function SearchView() {
  const router = useRouter();
  const params = useSearchParams();
  const { where, label, ready } = usePlace();
  const inPlace = ready ? ` in ${label === "Everywhere" ? "the whole world" : label}` : "";
  const f = useSearchFilters();
  const [sheet, setSheet] = useState(false);
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
    f.set({ q });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the words change
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
  const asked: SearchFilters = { ...f.filters, where, type: tab, interest: f.filters.interest || undefined };
  const askedKey = JSON.stringify(asked);
  const { data, loading, error, reload, setData } = useApi(q ? () => DiscoverService.search(q, asked) : null, [q, askedKey], { wait: !ready });

  const [searchAd] = useAds("search", { q }, !!q);
  const updateEvent = (next: EventDTO) => setData((d) => (d ? { ...d, events: d.events.map((x) => (x.id === next.id ? next : x)) } : d));
  const counts = { communities: data?.communities.length ?? 0, events: data?.events.length ?? 0, people: data?.people.length ?? 0 };
  const panel = <SearchFiltersList f={f} />;
  const total = counts.communities + counts.events + counts.people;
  const show = (t: Exclude<Tab, "all">) => (tab === "all" || tab === t) && counts[t] > 0;

  return (
    <div>
      <PagePanel label="Search filters">{panel}</PagePanel>
      <SlideOver open={sheet} onClose={() => setSheet(false)} side="left" title="Filters">
        <div className="p-4 pt-14">
          {panel}
          <Button variant="primary" className="mt-6 w-full" onClick={() => setSheet(false)}>
            Show results
          </Button>
        </div>
      </SlideOver>
      <PageBanner
        eyebrow="Search"
        title="Find your scene"
        footer={
          q ? (
            <PillTabs
              label="Result type"
              active={tab}
              onChange={setTab}
              items={[
                { id: "all", label: "All", icon: <Icon name="search" size={15} /> },
                { id: "communities", label: "Communities", icon: <Icon name="users" size={15} /> },
                { id: "events", label: "Events", icon: <Icon name="calendar" size={15} /> },
                { id: "people", label: "People", icon: <Icon name="user" size={15} /> },
              ]}
            />
          ) : undefined
        }
      >
        Communities, events and people{inPlace}.
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
        <Button className="lg:hidden" onClick={() => setSheet(true)}>
          <Icon name="sliders" size={15} /> Filters{f.active ? ` · ${f.active}` : ""}
        </Button>
      </div>
      <p className="-mt-5 mb-7 px-1 text-[13px] text-ink-muted">
        Tip: use &ldquo;quotes&rdquo; for exact words, -word to leave a word out, and @name to find people.
      </p>

      {!q ? (
        <EmptyState icon="search" title="Search klique">
          Look up communities, events and people{inPlace}.
        </EmptyState>
      ) : loading ? (
        <CardGridSkeleton count={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data && total === 0 ? (
        <EmptyState icon="search" title={`Nothing found for “${q}”`}>
          Check the spelling, try a broader word, clear a filter, or search somewhere else.
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
