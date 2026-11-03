"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { CrewService, type KliqueFilters } from "@/app/services/CrewService";
import { KliqueCard, crewHref } from "@/components/domain/crews/parts";
import { StartCrewModal } from "@/components/domain/crews/StartCrewModal";
import { ScopeButton } from "@/components/domain/places/ScopeButton";
import { PagePanel } from "@/components/layout/PagePanel";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePlace } from "@/components/providers/PlaceProvider";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { Button, Spinner } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Icon } from "@/components/ui/Icon";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { SlideOver } from "@/components/ui/SlideOver";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { useApi, useDebounced } from "@/lib/hooks/useApi";
import { useCategories } from "@/lib/hooks/useCategories";
import { softNavigate } from "@/lib/nav";
import { parseScope, scopeLabel, scopeToString } from "@/lib/places";
import type { CrewCardDTO } from "@/lib/types";

type When = NonNullable<KliqueFilters["when"]> | "any";
const WHEN: { id: When; label: string }[] = [
  { id: "any", label: "Any time" },
  { id: "today", label: "Today" },
  { id: "weekend", label: "This weekend" },
  { id: "week", label: "Next 7 days" },
];
const PAGE = 12;

/** The filters, read from and written to the address (?where=&c=&when=&interest=&q=). */
function useFilters() {
  const sp = useSearchParams();
  const router = useRouter();
  const place = usePlace();
  const where = parseScope(sp.get("where")) ? sp.get("where")! : place.where;
  const community = sp.get("c") ?? ""; // "", "mine" or a community's slug
  const w = sp.get("when");
  const when: When = w === "today" || w === "weekend" || w === "week" ? w : "any";
  const interest = sp.get("interest") ?? "";
  const q = sp.get("q") ?? "";
  const set = useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        if (v && !(k === "when" && v === "any")) next.set(k, v);
        else next.delete(k);
      }
      const qs = next.toString();
      router.replace(qs ? `/kliques?${qs}` : "/kliques", { scroll: false });
    },
    [router],
  );
  return { where, community, when, interest, q, set };
}
type Filters = ReturnType<typeof useFilters>;

/**
 * A filter section that opens and closes like a dropdown: the header (with a chevron) shows the current choice while
 * it's closed. Open or closed is remembered on this device; one with a non-default choice starts open.
 */
function Group({ id, title, summary, active, defaultOpen, children }: { id: string; title: string; summary?: string; active?: boolean; defaultOpen?: boolean; children: ReactNode }) {
  const key = `klique:kliques-filter:${id}`;
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(key);
      if (v === "1" || v === "0") return v === "1";
    } catch {
      /* private mode */
    }
    return !!defaultOpen || !!active;
  });
  const toggle = () =>
    setOpen((o) => {
      try {
        localStorage.setItem(key, o ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !o;
    });
  return (
    <section>
      <button type="button" onClick={toggle} aria-expanded={open} className="flex h-9 w-full items-center gap-2 rounded-control px-2 text-left transition hover:bg-raised/60">
        <span className="text-[11px] font-bold tracking-[0.08em] text-ink-muted uppercase">{title}</span>
        {!open && summary && <span className="min-w-0 flex-1 truncate text-[13px] text-ink">· {summary}</span>}
        <Icon name="chevron-down" size={15} className={cx("ml-auto shrink-0 text-ink-muted transition-transform duration-200", open && "rotate-180")} />
      </button>
      {/* grid rows 0fr → 1fr: a smooth height animation for any content */}
      <div className={cx("grid transition-[grid-template-rows] duration-200 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="min-h-0 overflow-hidden">
          <div className="pt-1 pb-2">{children}</div>
        </div>
      </div>
    </section>
  );
}

const option = (on: boolean) => cx("flex h-9 w-full items-center rounded-control px-3 text-left text-[14px] transition", on ? "bg-raised font-semibold text-ink" : "text-ink-muted hover:bg-raised/60 hover:text-ink");
/** the What list shows this many before "Show more" */
const WHAT_SHOWN = 6;

/** Where, which communities, when, what it's about, and search: the same in the left panel and the phone sheet. */
function FilterControls({ f }: { f: Filters }) {
  const { status } = useAuth();
  const categories = useCategories();
  const mine = useApi(status === "authed" ? () => CrewService.startInfo() : null, [status], { key: "klique-start" });
  const [q, setQ] = useState(f.q);
  const [allWhat, setAllWhat] = useState(false);
  const query = useDebounced(q.trim(), 350);
  const { set, q: current } = f;
  // the search goes into the address once they stop typing
  useEffect(() => {
    if (query !== current.trim()) set({ q: query });
  }, [query, current, set]);
  const scope = parseScope(f.where);
  const myCommunities = mine.data?.communities ?? [];
  const oneOfMine = f.community && f.community !== "mine" ? myCommunities.find((c) => c.slug === f.community) : undefined;
  const communitySummary = !f.community ? "Any" : f.community === "mine" ? "My communities" : (oneOfMine?.name ?? f.community);
  const what = [{ id: "", name: "Everything" }, ...categories];
  const whatShown = allWhat ? what : what.slice(0, WHAT_SHOWN);
  // keep the chosen one in view even when the list is short
  const chosenHidden = !allWhat && f.interest && !whatShown.some((c) => c.id === f.interest);

  return (
    <div className="space-y-3 px-1">
      <label className="relative block">
        <span className="sr-only">Search kliques</span>
        <Icon name="search" size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={40} placeholder="Cinema, football, Lekki…" className="h-10 w-full rounded-control border border-line bg-surface pr-3 pl-9 text-[14px] text-ink placeholder:text-ink-muted/70 focus:border-accent-text focus:outline-none" />
      </label>

      <Group id="place" title="Place" summary={scope ? scopeLabel(scope) : undefined} defaultOpen>
        {scope && <ScopeButton value={scope} onChange={(s) => f.set({ where: scopeToString(s) })} className="w-full" />}
      </Group>

      <Group id="community" title="Community" summary={communitySummary} active={!!f.community}>
        <div className="space-y-0.5">
          <button type="button" className={option(!f.community)} onClick={() => f.set({ c: "" })}>
            Any community
          </button>
          {status === "authed" && (
            <button type="button" className={option(f.community === "mine")} onClick={() => f.set({ c: "mine" })}>
              My communities
            </button>
          )}
          {myCommunities.length > 0 && (
            <Dropdown
              className="mt-1 block w-full"
              width={240}
              label="One of your communities"
              items={myCommunities.map((c) => ({ label: c.name, checked: f.community === c.slug, onSelect: () => f.set({ c: c.slug }) }))}
              trigger={({ open, props }) => (
                <button {...props} className={cx("flex h-10 w-full items-center gap-2 rounded-control border bg-surface px-3 text-left text-[14px] transition", oneOfMine ? "border-accent-text font-semibold text-ink" : "border-line text-ink-muted hover:text-ink", open && "border-accent-text")}>
                  <span className="min-w-0 flex-1 truncate">{oneOfMine?.name ?? "One of mine…"}</span>
                  <Icon name="chevron-down" size={14} className="shrink-0" />
                </button>
              )}
            />
          )}
        </div>
      </Group>

      <Group id="when" title="When" summary={WHEN.find((w) => w.id === f.when)?.label} defaultOpen>
        <div className="space-y-0.5">
          {WHEN.map((w) => (
            <button key={w.id} type="button" className={option(f.when === w.id)} onClick={() => f.set({ when: w.id })}>
              {w.label}
            </button>
          ))}
        </div>
      </Group>

      <Group id="what" title="What" summary={what.find((c) => c.id === f.interest)?.name ?? "Everything"} active={!!f.interest}>
        <div className="space-y-0.5">
          {[...whatShown, ...(chosenHidden ? what.filter((c) => c.id === f.interest) : [])].map((c) => (
            <button key={c.id || "all"} type="button" className={option(f.interest === c.id)} onClick={() => f.set({ interest: c.id })}>
              {c.name}
            </button>
          ))}
          {what.length > WHAT_SHOWN && (
            <button type="button" onClick={() => setAllWhat((v) => !v)} className="flex h-8 w-full items-center gap-1 px-3 text-left text-[13px] font-medium text-accent-text hover:underline">
              {allWhat ? "Show less" : `Show ${what.length - WHAT_SHOWN} more`}
            </button>
          )}
        </div>
      </Group>
    </div>
  );
}

/**
 * /kliques: kliques to join, best for you first (your interests, your city, soonest). A compact header with Start a
 * klique; the filters (place, community, when, what, search) sit in the left panel on big screens and in a sheet
 * behind "Filters" on phones. Everything is in the address, so a filtered list can be shared or bookmarked.
 */
function KliquesPage() {
  const { requireAuth } = useAuth();
  const f = useFilters();
  const [pages, setPages] = useState(1);
  const [sheet, setSheet] = useState(false);
  const [starting, setStarting] = useState(false);
  const filters: KliqueFilters = {
    where: f.where,
    interest: f.interest || undefined,
    when: f.when === "any" ? undefined : f.when,
    q: f.q || undefined,
    community: f.community && f.community !== "mine" ? f.community : undefined,
    mine: f.community === "mine" || undefined,
    limit: PAGE * pages,
  };
  const key = `kliques-browse:${JSON.stringify(filters)}`;
  const { data, loading, refreshing, error, reload } = useApi(() => CrewService.list(filters), [key], { key, keepPrevious: true });
  useRealtimeEvent(() => void reload(), { filter: (e) => e.type === "crew" && !e.chat, debounceMs: 800 });
  const items: CrewCardDTO[] = data?.items ?? [];
  const active = [f.community, f.when !== "any" ? f.when : "", f.interest, f.q].filter(Boolean).length;

  return (
    <div>
      <PagePanel label="Kliques">
        <FilterControls f={f} />
      </PagePanel>

      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Kliques</h1>
          <p className="text-sm text-ink-muted">Movies, matches, runs, nights out and events. Join one, or start your own.</p>
        </div>
        <div className="flex gap-2">
          <Button className="lg:hidden" onClick={() => setSheet(true)}>
            <Icon name="sliders" size={15} /> Filters{active ? ` · ${active}` : ""}
          </Button>
          <Button variant="primary" onClick={() => requireAuth() && setStarting(true)}>
            <Icon name="plus" size={15} /> Start a klique
          </Button>
        </div>
      </header>

      {!data && loading ? (
        <RowSkeleton rows={3} />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !items.length ? (
        <EmptyState
          icon="users"
          title={active ? "Nothing matches yet" : "No kliques here yet"}
          action={
            <Button variant="primary" onClick={() => requireAuth() && setStarting(true)}>
              <Icon name="plus" size={15} /> Start one
            </Button>
          }
        >
          Be the first: say what you want to do, add a picture, and see who&apos;s in.
        </EmptyState>
      ) : (
        <>
          {/* columns follow the grid's own width (it sits beside the panels): as many 240px+ cards as fit, at most 4 */}
          <ul className={cx("grid gap-4", refreshing && "opacity-70 transition-opacity")} style={{ gridTemplateColumns: "repeat(auto-fill, minmax(max(240px, calc((100% - 3rem) / 4)), 1fr))" }}>
            {items.map((k) => (
              <li key={k.id}>
                <KliqueCard crew={k} wide />
              </li>
            ))}
          </ul>
          {refreshing && (
            <p className="mt-3 flex items-center gap-2 text-xs text-ink-muted">
              <Spinner /> Updating…
            </p>
          )}
          {data?.hasMore && (
            <div className="mt-6 flex justify-center">
              <Button onClick={() => setPages((n) => n + 1)} loading={refreshing}>
                Show more
              </Button>
            </div>
          )}
        </>
      )}

      <SlideOver open={sheet} onClose={() => setSheet(false)} side="left" title="Filters">
        <div className="p-4 pt-14">
          <FilterControls f={f} />
          <Button variant="primary" className="mt-6 w-full" onClick={() => setSheet(false)}>
            Show kliques
          </Button>
        </div>
      </SlideOver>

      {starting && (
        <StartCrewModal
          open
          onClose={() => setStarting(false)}
          onCreated={(crew) => {
            setStarting(false);
            void reload();
            softNavigate(crewHref(crew));
          }}
        />
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<RowSkeleton rows={3} />}>
      <KliquesPage />
    </Suspense>
  );
}
