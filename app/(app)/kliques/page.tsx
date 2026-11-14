"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Switch } from "@/components/ui/Field";
import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { CrewService, type KliqueFilters } from "@/app/services/CrewService";
import { Faces, KliquePhotoCard, crewHref, goingLine } from "@/components/domain/crews/parts";
import { StartCrewModal } from "@/components/domain/crews/StartCrewModal";
import { ScopeButton } from "@/components/domain/places/ScopeButton";
import { PagePanel } from "@/components/layout/PagePanel";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePlace } from "@/components/providers/PlaceProvider";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { Button, Spinner } from "@/components/ui/Button";
import { MoreOnScroll } from "@/components/ui/MoreOnScroll";
import { Dropdown } from "@/components/ui/Dropdown";
import { Icon } from "@/components/ui/Icon";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { SlideOver } from "@/components/ui/SlideOver";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { useApi, useDebounced, usePaged } from "@/lib/hooks/useApi";
import { useCategories } from "@/lib/hooks/useCategories";
import { softNavigate } from "@/lib/nav";
import { parseScope, scopeLabel, scopeToString } from "@/lib/places";
import { formatDateShort } from "@/lib/format";
import type { CrewCardDTO, JoinedKliqueDTO } from "@/lib/types";
import { Cover } from "@/components/ui/Cover";
import { SoftLink } from "@/components/ui/SoftLink";
import { Tabs } from "@/components/ui/Tabs";

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
  const fromLink = !!parseScope(sp.get("where"));
  const where = fromLink ? sp.get("where")! : place.where;
  // a place in the address is known at once; otherwise wait for the remembered one
  const ready = fromLink || place.ready;
  const community = sp.get("c") ?? ""; // "", "mine" or a community's slug
  const w = sp.get("when");
  const when: When = w === "today" || w === "weekend" || w === "week" ? w : "any";
  const interest = sp.get("interest") ?? "";
  const q = sp.get("q") ?? "";
  const hideFull = sp.get("open") === "1";
  const tab = sp.get("tab") === "joined" ? "joined" : "discover";
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
  return { where, ready, community, when, interest, q, hideFull, tab, set };
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

      <Group id="place" title="Place" summary={f.ready && scope ? scopeLabel(scope) : undefined} defaultOpen>
        {scope && <ScopeButton value={f.ready ? scope : undefined} onChange={(s) => f.set({ where: scopeToString(s) })} className="w-full" />}
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

      {/* full kliques show after the open ones; this leaves them out */}
      <div className="px-3 pt-1">
        <Switch checked={f.hideFull} onChange={(v) => f.set({ open: v ? "1" : "" })} label="Hide full" hint="Only kliques with a spot left" />
      </div>
    </div>
  );
}

type JoinedShow = "all" | "host" | "member" | "pending" | "past";
const JOINED_SHOW: { id: JoinedShow; label: string }[] = [
  { id: "all", label: "All" },
  { id: "host", label: "Hosting" },
  { id: "member", label: "Going" },
  { id: "pending", label: "Asked" },
  { id: "past", label: "Past" },
];
const inShow = (k: JoinedKliqueDTO, show: JoinedShow) => (show === "all" ? true : show === "past" ? k.closed : !k.closed && k.viewer.standing === show);

/** "In 2 days", "In 3 hours", "Started" */
function untilLabel(k: Pick<CrewCardDTO, "meetupAt" | "closed">) {
  if (k.closed) return "Started";
  const hours = (new Date(k.meetupAt).getTime() - Date.now()) / 3_600_000;
  if (hours < 1) return "Very soon";
  if (hours < 24) return `In ${Math.round(hours)} ${Math.round(hours) === 1 ? "hour" : "hours"}`;
  const days = Math.round(hours / 24);
  return `In ${days} ${days === 1 ? "day" : "days"}`;
}

/** Your soonest klique, big: when it is, where, who's going, and the way into its chat. */
function NextUp({ k }: { k: JoinedKliqueDTO }) {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface">
      <Cover src={k.coverImage ?? k.host.avatarUrl} seed={k.id} interest={k.interest} className="aspect-[16/9]">
        <span className="absolute top-2 left-2 rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">{untilLabel(k)}</span>
      </Cover>
      <div className="space-y-2 p-4">
        <h2 className="text-xs font-semibold text-ink-muted">Next up</h2>
        <p className="font-semibold">{k.title}</p>
        <p className="text-[13px] text-ink-muted">
          {formatDateShort(k.meetupAt, k.timeZone)} · {k.area}
        </p>
        <p className="flex items-center gap-2 text-[13px] text-ink-muted">
          <Faces people={k.faces} total={k.memberCount} size={24} />
          <span className="min-w-0">{goingLine(k)}</span>
        </p>
        <Button variant="primary" href={crewHref(k)} className="mt-1 w-full">
          Open chat
        </Button>
      </div>
    </section>
  );
}

/** A few kliques to join, right beside the ones you're in. */
function JoinedSuggestions({ where, wait, onDiscover }: { where: string; wait: boolean; onDiscover: () => void }) {
  const { data } = useApi(() => CrewService.forYou({ where, limit: 3 }), [where], { key: `kliques-joined-for-you:${where}`, wait });
  const items = data?.items ?? [];
  if (!items.length) return null;
  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-semibold">Kliques for you</h2>
        <button type="button" onClick={onDiscover} className="text-[13px] font-medium text-accent-text hover:underline">
          See all
        </button>
      </div>
      <ul className="space-y-1">
        {items.map((k) => (
          <li key={k.id}>
            <SoftLink href={crewHref(k)} className="-mx-2 flex items-center gap-3 rounded-control p-2 transition hover:bg-raised/60">
              <Cover src={k.coverImage ?? k.host.avatarUrl} seed={k.id} interest={k.interest} className="size-12 shrink-0 overflow-hidden rounded-control" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{k.title}</span>
                <span className="block truncate text-xs text-ink-muted">
                  {formatDateShort(k.meetupAt, k.timeZone)} · {k.area}
                </span>
              </span>
            </SoftLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The kliques you're in or asked to join, with a filter panel, what's next, and more to join. */
function JoinedList({ where, wait, onDiscover }: { where: string; wait: boolean; onDiscover: () => void }) {
  const { status } = useAuth();
  const [show, setShow] = useState<JoinedShow>("all");
  const { data, loading, error, reload } = useApi(status === "authed" ? () => CrewService.joined() : null, [status], { key: "kliques-joined" });
  useRealtimeEvent(() => void reload(), { filter: (e) => e.type === "crew", debounceMs: 800 });
  const all = data ?? [];
  const shown = all.filter((k) => inShow(k, show));
  const next = all.find((k) => !k.closed && k.viewer.standing !== "pending");
  const count = (id: JoinedShow) => all.filter((k) => inShow(k, id)).length;

  const list =
    !data && loading ? (
      <RowSkeleton rows={3} />
    ) : error && !data ? (
      <ErrorState message={error} onRetry={reload} />
    ) : !all.length ? (
      <EmptyState icon="users" title="No kliques yet" action={<Button variant="primary" onClick={onDiscover}>Find a klique</Button>}>
        Kliques you join or start show up here, with their chats.
      </EmptyState>
    ) : !shown.length ? (
      <p className="rounded-card border border-line bg-surface p-6 text-center text-sm text-ink-muted">Nothing here right now.</p>
    ) : (
      <ul className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(max(190px, calc((100% - 3rem) / 4)), 1fr))" }}>
        {shown.map((k) => (
          <li key={k.id}>
            <KliquePhotoCard crew={k} unread={k.unreadCount} />
          </li>
        ))}
      </ul>
    );

  return (
    <>
      <PagePanel label="Your kliques">
        <div className="space-y-0.5 px-1">
          {JOINED_SHOW.map((o) => (
            <button key={o.id} type="button" aria-pressed={show === o.id} className={cx(option(show === o.id), "justify-between")} onClick={() => setShow(o.id)}>
              {o.label}
              <span className="text-xs text-ink-muted">{count(o.id)}</span>
            </button>
          ))}
        </div>
      </PagePanel>

      {/* phones and tablets have no left panel */}
      <div className="mb-4 flex gap-2 overflow-x-auto lg:hidden">
        {JOINED_SHOW.map((o) => (
          <button key={o.id} type="button" aria-pressed={show === o.id} onClick={() => setShow(o.id)} className={cx("h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition", show === o.id ? "border-ink bg-ink text-canvas" : "border-line text-ink-muted")}>
            {o.label} · {count(o.id)}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">{list}</div>
        <aside className="min-w-0 space-y-4 xl:sticky xl:top-4">
          {next && <NextUp k={next} />}
          <JoinedSuggestions where={where} wait={wait} onDiscover={onDiscover} />
          <p className="px-1 text-xs leading-relaxed text-ink-muted">Meet in public, and tell someone where you&apos;re going. A klique and its chat disappear a day after it happens.</p>
        </aside>
      </div>
    </>
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
  const [sheet, setSheet] = useState(false);
  // "Start a klique" on Home lands here with ?start=1: the form opens straight away
  const startNow = useSearchParams().get("start") === "1";
  const [starting, setStarting] = useState(startNow);
  const filters: KliqueFilters = {
    where: f.where,
    interest: f.interest || undefined,
    when: f.when === "any" ? undefined : f.when,
    q: f.q || undefined,
    community: f.community && f.community !== "mine" ? f.community : undefined,
    mine: f.community === "mine" || undefined,
    open: f.hideFull || undefined,
    limit: PAGE,
  };
  const key = `kliques-browse:${JSON.stringify(filters)}`;
  const { items, loading, refreshing, loadingMore, error, hasMore, loadMore, reload } = usePaged<CrewCardDTO>(
    (page) => CrewService.list({ ...filters, page }).then((r) => ({ ...r, data: { ...r.data, page } })),
    [key],
    { key, keepPrevious: true, wait: !f.ready },
  );
  useRealtimeEvent(() => void reload(), { filter: (e) => e.type === "crew" && !e.chat, debounceMs: 800 });
  const active = [f.community, f.when !== "any" ? f.when : "", f.interest, f.q, f.hideFull ? "open" : ""].filter(Boolean).length;

  return (
    <div>
      {f.tab === "discover" && (
        <PagePanel label="Kliques">
          <FilterControls f={f} />
        </PagePanel>
      )}

      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Kliques</h1>
          <p className="text-sm text-ink-muted">Movies, matches, runs, nights out and events. Join one, or start your own.</p>
        </div>
        <div className="flex gap-2">
          {f.tab === "discover" && (
            <Button className="lg:hidden" onClick={() => setSheet(true)}>
              <Icon name="sliders" size={15} /> Filters{active ? ` · ${active}` : ""}
            </Button>
          )}
          <Button variant="primary" onClick={() => requireAuth() && setStarting(true)}>
            <Icon name="plus" size={15} /> Start a klique
          </Button>
        </div>
      </header>

      <div className="mb-5">
        <Tabs label="Kliques" active={f.tab} onChange={(id) => f.set({ tab: id === "joined" ? "joined" : "" })} items={[{ id: "discover", label: "Discover" }, { id: "joined", label: "Joined" }]} />
      </div>

      {f.tab === "joined" ? (
        <JoinedList where={f.where} wait={!f.ready} onDiscover={() => f.set({ tab: "" })} />
      ) : !items.length && loading ? (
        <RowSkeleton rows={3} />
      ) : error && !items.length ? (
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
          {/* photo cards: as many 190px+ as fit, at most four across */}
          <ul className={cx("grid gap-4", refreshing && "opacity-70 transition-opacity")} style={{ gridTemplateColumns: "repeat(auto-fill, minmax(max(190px, calc((100% - 3rem) / 4)), 1fr))" }}>
            {items.map((k) => (
              <li key={k.id}>
                <KliquePhotoCard crew={k} />
              </li>
            ))}
          </ul>
          {refreshing && (
            <p className="mt-3 flex items-center gap-2 text-xs text-ink-muted">
              <Spinner /> Updating…
            </p>
          )}
          <MoreOnScroll hasMore={hasMore} loading={loadingMore} count={items.length} onLoad={loadMore} className="mt-3" />
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
