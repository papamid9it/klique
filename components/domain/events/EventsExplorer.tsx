"use client";

import { useSearchParams } from "next/navigation";
import { Fragment, useState } from "react";
import { EventService } from "@/app/services/EventService";
import { ScopeButton } from "@/components/domain/places/ScopeButton";
import { usePlace } from "@/components/providers/PlaceProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { cx } from "@/components/ui/cx";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { INTERESTS, isInterestId, type InterestId } from "@/lib/constants";
import { isDateFilter, type DateFilter } from "@/lib/dates";
import { formatDateLong } from "@/lib/format";
import { useApi, useDebounced, useNow, usePaged } from "@/lib/hooks/useApi";
import { CONTINENTS, getCountry, parseScope, scopeFlag, scopeLabel, scopeParent, scopeToString, type Scope } from "@/lib/places";
import type { EventDTO } from "@/lib/types";
import { EventRow } from "./EventRow";
import { SponsoredRow, useAds } from "@/components/domain/ads/Sponsored";
import { MiniCalendar } from "./MiniCalendar";

const WHEN: { id: DateFilter; label: string }[] = [
  { id: "any", label: "Any time" },
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "weekend", label: "This weekend" },
  { id: "week", label: "Next 7 days" },
  { id: "month", label: "Next 30 days" },
];

const lagosKey = (d: Date | string) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

function Pill({ on, onClick, children, className }: { on: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cx("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold whitespace-nowrap transition", on ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-ink hover:border-ink-muted", className)}
    >
      {children}
    </button>
  );
}

/**
 * The events page: pick where in the world (a city, a state, a country, a continent or everywhere),
 * narrow by when / what / free / online, and see it as a list, grouped by day.
 * The side panel is the calendar and a "browse by place" list that drills down one level at a time.
 */
export function EventsExplorer() {
  const place = usePlace();
  const now = useNow(60_000);
  // Links can open the page pre-filtered: ?interest=skate&date=weekend&day=2026-10-24&free=1&format=online
  const sp = useSearchParams();
  const [interest, setInterest] = useState<InterestId | "">(() => (isInterestId(sp.get("interest")) ? (sp.get("interest") as InterestId) : ""));
  const [date, setDate] = useState<DateFilter>(() => (isDateFilter(sp.get("date")) ? (sp.get("date") as DateFilter) : "any"));
  const [day, setDay] = useState(() => (/^\d{4}-\d{2}-\d{2}$/.test(sp.get("day") ?? "") ? sp.get("day")! : ""));
  const [free, setFree] = useState(() => sp.get("free") === "1");
  const [format, setFormat] = useState<"any" | "in-person" | "online">(() => (sp.get("format") === "online" || sp.get("format") === "in-person" ? (sp.get("format") as "online" | "in-person") : "any"));
  const [q, setQ] = useState("");
  const dq = useDebounced(q);

  const { where, scope } = place;
  const overview = useApi(() => EventService.overview({ where, interest: interest || undefined }), [where, interest], { key: `events-overview:${where}:${interest}` });
  const { items, loading, loadingMore, error, hasMore, loadMore, reload, setItems } = usePaged<EventDTO>(
    (page) => EventService.list({ where, interest: interest || undefined, price: free ? "free" : "any", format, date: day ? "any" : date, day: day || undefined, q: dq || undefined, page }),
    [where, interest, free, format, date, day, dq],
    { keepPrevious: true, key: `events:${where}:${interest}:${free}:${format}:${date}:${day}:${dq}` },
  );

  // Ads: a promoted row on top and one further down; none when looking at a single day, so that list stays as asked.
  const ads = useAds("events-list", { interest: interest || undefined, count: 2 }, !day);
  const position = new Map(items.map((e, i) => [e.id, i]));

  const o = overview.data;
  const counts = Object.fromEntries((o?.places ?? []).map((p) => [p.scope, p.count]));
  const filtered = !!(interest || date !== "any" || day || free || format !== "any" || q);
  // how many filters are on, for the phone's Filters button
  const activeFilters = [interest, date !== "any" || day, free, format !== "any"].filter(Boolean).length;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const clear = () => {
    setInterest("");
    setDate("any");
    setDay("");
    setFree(false);
    setFormat("any");
    setQ("");
  };

  // Shortcuts: back to my city, my country, my continent, everywhere.
  const home = place.home;
  const homeCountry = home.level === "city" || home.level === "region" || home.level === "country" ? home.country : null;
  const shortcuts: Scope[] = [];
  if (home.level !== "world") shortcuts.push(home);
  if (homeCountry) {
    shortcuts.push({ level: "country", country: homeCountry });
    const continent = getCountry(homeCountry)?.continent;
    if (continent) shortcuts.push({ level: "continent", continent });
  }
  shortcuts.push({ level: "world" });
  const unique = shortcuts.filter((s, i) => shortcuts.findIndex((x) => scopeToString(x) === scopeToString(s)) === i);

  const todayKey = now ? lagosKey(now) : null;
  const tomorrowKey = now ? lagosKey(new Date(now.getTime() + 86_400_000)) : null;
  const dayHeading = (key: string, iso: string) => (key === todayKey ? "Today" : key === tomorrowKey ? "Tomorrow" : formatDateLong(iso));

  const groups: { key: string; iso: string; events: EventDTO[] }[] = [];
  for (const e of items) {
    const key = lagosKey(e.startsAt);
    const g = groups[groups.length - 1];
    if (g && g.key === key) g.events.push(e);
    else groups.push({ key, iso: e.startsAt, events: [e] });
  }
  const patch = (next: EventDTO) => setItems((list) => list.map((x) => (x.id === next.id ? next : x)));

  const childNoun = scope.level === "world" ? "continents" : scope.level === "continent" ? "countries" : scope.level === "country" ? "states & cities" : "cities";
  const places = (o?.places ?? []).map((p) => ({ ...p, s: parseScope(p.scope) })).filter((p): p is { scope: string; count: number; s: Scope } => !!p.s);
  const parent = scopeParent(scope);

  return (
    <div className="grid gap-x-10 gap-y-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="min-w-0">
        {/* ------------------------------ hero ------------------------------ */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow mb-3">What&apos;s on</p>
            <h1 className="display flex flex-wrap items-center gap-x-3 gap-y-2 text-[clamp(2rem,4.6vw,3rem)]">
              <span>Events in</span>
              <ScopeButton variant="heading" counts={counts} className="text-[clamp(1.75rem,4vw,2.6rem)] font-semibold tracking-[-0.03em]" />
            </h1>
            <p className="mt-3 text-[15px] text-ink-muted">
              {overview.loading || !o ? (
                "Counting what's on…"
              ) : o.total ? (
                <>
                  <span className="font-semibold text-ink">{o.total.toLocaleString("en-US")}</span> upcoming{o.online ? <> · <span className="font-semibold text-ink">{o.online}</span> online</> : null}
                  {places.length > 1 ? <> · across {places.length} {childNoun}</> : null}
                </>
              ) : (
                "Nothing scheduled here yet."
              )}
            </p>
          </div>
        </header>

        {/* phones: a search box and one Filters button; everything else opens in a panel */}
        <div className="mt-5 flex items-center gap-2 sm:hidden">
          <div className="relative min-w-0 flex-1">
            <Icon name="search" size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events…" aria-label="Search events" className="h-11 w-full rounded-full border border-line bg-surface pr-3 pl-10 text-sm placeholder:text-ink-muted/70 focus:border-accent-text" />
          </div>
          <button type="button" onClick={() => setFiltersOpen(true)} className={cx("relative inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold", activeFilters ? "border-accent-text bg-surface text-ink" : "border-line bg-surface text-ink")}>
            <Icon name="sliders" size={15} /> Filters
            {activeFilters > 0 && <span className="inline-flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-ink">{activeFilters}</span>}
          </button>
        </div>
        <Modal open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter events">
          <div className="space-y-5">
            <fieldset>
              <legend className="eyebrow mb-2">Where</legend>
              <div className="flex flex-wrap gap-2">
                {unique.map((sc) => (
                  <Pill key={scopeToString(sc)} on={scopeToString(sc) === place.where} onClick={() => place.setScope(sc)}>
                    <span aria-hidden="true">{scopeFlag(sc)}</span> {sc === home && home.level !== "world" ? `Near me · ${scopeLabel(sc)}` : scopeLabel(sc)}
                  </Pill>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="eyebrow mb-2">Format</legend>
              <div className="flex flex-wrap gap-2">
                {([["any", "All"], ["in-person", "In person"], ["online", "Online"]] as const).map(([id, label]) => (
                  <Pill key={id} on={format === id} onClick={() => setFormat(id)}>{label}</Pill>
                ))}
                <Pill on={free} onClick={() => setFree((f) => !f)}>Free only</Pill>
              </div>
            </fieldset>
            <fieldset>
              <legend className="eyebrow mb-2">When</legend>
              <div className="flex flex-wrap gap-2">
                {WHEN.map((w) => (
                  <Pill key={w.id} on={!day && date === w.id} onClick={() => { setDay(""); setDate(w.id); }}>{w.label}</Pill>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="eyebrow mb-2">Kind</legend>
              <div className="flex flex-wrap gap-2">
                <Pill on={!interest} onClick={() => setInterest("")}>All kinds</Pill>
                {INTERESTS.map((i) => (
                  <Pill key={i.id} on={interest === i.id} onClick={() => setInterest(interest === i.id ? "" : i.id)}>
                    <span aria-hidden="true">{i.glyph}</span> {i.short}
                  </Pill>
                ))}
              </div>
            </fieldset>
            <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
              <Button variant="ghost" onClick={clear} disabled={!filtered}>Clear all</Button>
              <Button variant="primary" onClick={() => setFiltersOpen(false)}>Show events</Button>
            </div>
          </div>
        </Modal>

        <div className="mt-5 hidden flex-wrap gap-2 sm:flex" role="group" aria-label="Quick places">
          {unique.map((s) => (
            <Pill key={scopeToString(s)} on={scopeToString(s) === place.where} onClick={() => place.setScope(s)}>
              <span aria-hidden="true">{scopeFlag(s)}</span> {s === home && home.level !== "world" ? `Near me · ${scopeLabel(s)}` : scopeLabel(s)}
            </Pill>
          ))}
        </div>

        {/* ------------------------------ filters ------------------------------ */}
        <div role="search" aria-label="Filter events" className="mt-5 hidden space-y-3 rounded-card border border-line bg-surface p-3.5 sm:block">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-48 flex-1">
              <Icon name="search" size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events…" aria-label="Search events" className="h-10 w-full rounded-full border border-line bg-raised pr-3 pl-10 text-sm placeholder:text-ink-muted/70 focus:border-accent-text" />
            </div>
            <div className="flex rounded-full border border-line bg-raised p-0.5" role="group" aria-label="Format">
              {([["any", "All"], ["in-person", "In person"], ["online", "Online"]] as const).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={format === id} onClick={() => setFormat(id)} className={cx("h-8 rounded-full px-3 text-[13px] font-semibold transition", format === id ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>
                  {label}
                </button>
              ))}
            </div>
            <Pill on={free} onClick={() => setFree((f) => !f)} className="h-10">Free</Pill>
          </div>
          <div className="no-bar -mx-3.5 flex gap-2 overflow-x-auto px-3.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" role="group" aria-label="When">
            {WHEN.map((w) => (
              <Pill key={w.id} on={!day && date === w.id} onClick={() => { setDay(""); setDate(w.id); }}>{w.label}</Pill>
            ))}
            {day && <Pill on onClick={() => setDay("")}>{formatDateLong(`${day}T12:00:00+01:00`)} <Icon name="x" size={12} /></Pill>}
          </div>
          <div className="no-bar -mx-3.5 flex gap-2 overflow-x-auto px-3.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" role="group" aria-label="Interest">
            <Pill on={!interest} onClick={() => setInterest("")}>All kinds</Pill>
            {INTERESTS.map((i) => (
              <Pill key={i.id} on={interest === i.id} onClick={() => setInterest(interest === i.id ? "" : i.id)}>
                <span aria-hidden="true">{i.glyph}</span> {i.short}
              </Pill>
            ))}
          </div>
        </div>

        {/* places, on phones and tablets (the side panel takes over on wide screens) */}
        {places.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 xl:hidden" role="group" aria-label={`Browse ${childNoun}`}>
            {places.map((p) => (
              <button key={p.scope} type="button" onClick={() => place.setScope(p.s)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-line px-3 text-[13px] text-ink-muted hover:border-ink-muted hover:text-ink">
                <span aria-hidden="true">{scopeFlag(p.s)}</span> {scopeLabel(p.s)} <span className="font-mono text-[11px]">{p.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* ------------------------------ results ------------------------------ */}
        <div className="mt-7">
          {loading && items.length === 0 ? (
            <RowSkeleton rows={4} />
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : items.length === 0 ? (
            <EmptyState
              icon="calendar"
              title={filtered ? "Nothing matches those filters" : `Nothing on in ${scopeLabel(scope)} yet`}
              action={
                <>
                  {filtered && <Button onClick={clear}>Clear filters</Button>}
                  {!filtered && parent && <Button onClick={() => place.setScope(parent)}>Look in {scopeLabel(parent)}</Button>}
                </>
              }
            >
              {filtered ? "Try a wider date range, or another kind of event." : "Widen the search to the whole country or continent."}
            </EmptyState>
          ) : (
            <div className={`space-y-8 transition-opacity duration-200 ${loading ? "opacity-60" : ""}`} aria-busy={loading || undefined}>
              {ads[0] && <SponsoredRow ad={ads[0]} />}
              {groups.map((g) => (
                <section key={g.key} aria-label={dayHeading(g.key, g.iso)}>
                  <h2 className="mb-3 flex items-baseline gap-2.5 text-lg font-semibold tracking-[-0.02em]">
                    {dayHeading(g.key, g.iso)}
                    <span className="font-mono text-[11px] font-normal text-ink-muted">{g.events.length} {g.events.length === 1 ? "event" : "events"}</span>
                  </h2>
                  <div className="space-y-2.5">
                    {g.events.map((e) => (
                      <Fragment key={e.id}>
                        <EventRow event={e} onChange={patch} />
                        {/* a second ad well down the list, never more than one every ~8 events */}
                        {ads[1] && position.get(e.id) === 7 && <SponsoredRow ad={ads[1]} />}
                      </Fragment>
                    ))}
                  </div>
                </section>
              ))}
              {hasMore && (
                <div className="flex justify-center">
                  <Button onClick={loadMore} loading={loadingMore}>Load more</Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------ side panel ------------------------------ */}
      <aside className="hidden space-y-5 xl:block" aria-label="Calendar and places">
        <div className="sticky top-7 space-y-5">
          <MiniCalendar todayKey={todayKey} counts={o?.days ?? {}} selected={day} onSelect={setDay} />

          <section className="rounded-card border border-line bg-surface p-4" aria-label={`Browse ${childNoun}`}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-tight">Browse {childNoun}</h3>
              {parent && (
                <button type="button" onClick={() => place.setScope(parent)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-text hover:underline">
                  <Icon name="arrow-left" size={12} /> {scopeLabel(parent)}
                </button>
              )}
            </div>
            {places.length ? (
              <ul className="space-y-0.5">
                {places.slice(0, 8).map((p) => (
                  <li key={p.scope}>
                    <button type="button" onClick={() => place.setScope(p.s)} className="flex w-full items-center gap-2.5 rounded-control px-2 py-2 text-left hover:bg-raised">
                      <span className="w-5 text-center" aria-hidden="true">{scopeFlag(p.s)}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{scopeLabel(p.s)}</span>
                      <span className="font-mono text-[11px] text-ink-muted">{p.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-2 text-sm text-ink-muted">{scope.level === "city" ? "That's the most specific place." : "No events to browse yet."}</p>
            )}
            <p className="mt-2 border-t border-line pt-3 text-[12px] text-ink-muted">
              Not listed? Use the place button to pick any of {CONTINENTS.length} continents&apos; countries or search a town.
            </p>
          </section>

          <section className="rounded-card border border-line bg-raised/50 p-4">
            <h3 className="text-sm font-semibold tracking-tight">Hosting something?</h3>
            <p className="mt-1 text-[13px] text-ink-muted">Events live in communities: a community&apos;s owner and admins post them from its Events page. Start one for your crew and put your first event on the calendar.</p>
            <Button href="/communities/new" size="sm" variant="primary" className="mt-3">Start a community</Button>
          </section>
        </div>
      </aside>
    </div>
  );
}
