"use client";

import { useEffect, useRef, useState } from "react";
import ApiClient from "@/app/ApiCore";
import { CrewService } from "@/app/services/CrewService";
import { DiscoverService } from "@/app/services/DiscoverService";
import { EventsRow, HomeFeed, TOP_EVENTS, rankEvents } from "@/components/domain/home/HomeFeed";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePlace } from "@/components/providers/PlaceProvider";
import { scrollerOf } from "@/components/domain/feed/useInfiniteFeed";
import { Icon } from "@/components/ui/Icon";
import { ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { formatEyebrowDate } from "@/lib/format";
import { useApi, useNow } from "@/lib/hooks/useApi";
import type { CommunityCardDTO, DiscoverDTO, EventDTO } from "@/lib/types";

/** Kliques someone said "Not interested" to: kept in this browser only (a per-viewer convenience). */
const DISMISSED_KEY = "klique:dismissed";
function readDismissed(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(-300) : [];
  } catch {
    return [];
  }
}

/**
 * Home: upcoming events for you in a row at the top, kliques you could join below them, then posts from your
 * communities (with a klique, an event or an ad between every few), with a trending post from
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
  // kliques you could join, best for you first: the first few in their own row, the rest between posts
  const kliques = useApi(user ? () => CrewService.forYou({ limit: 30 }) : null, [user?.id, where], { key: `kliques-for-you:${user?.id ?? ""}:${where}` });
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => setDismissed(readDismissed()), []);
  const dismiss = (id: string) =>
    setDismissed((list) => {
      const next = [...list, id];
      try {
        localStorage.setItem(DISMISSED_KEY, JSON.stringify(next.slice(-300)));
      } catch {
        /* private mode: just for this visit */
      }
      return next;
    });
  const forYou = (kliques.data?.items ?? []).filter((k) => !dismissed.includes(k.id));

  // the refresh button in the top bar, only in the desktop app (a browser has its own reload; phones pull down):
  // events, kliques and posts again, in place (no page reload), then back to the top. Checked after mount, so the
  // first render matches the server's.
  const [inApp, setInApp] = useState(false);
  useEffect(() => setInApp(!!(window as unknown as { kliqueDesktop?: unknown }).kliqueDesktop), []);
  const feedRefresh = useRef<(() => Promise<void>) | null>(null);
  const bar = useRef<HTMLParagraphElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      ApiClient.clearCache(); // Home's events are kept for 30 seconds: refresh means new, so skip that
      await Promise.all([reload(), kliques.reload(), feedRefresh.current?.() ?? Promise.resolve()]);
      const s = scrollerOf(bar.current);
      s.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-9">
      {/* the date and place stay pinned at the top while you scroll: a thin bar in the page colour, under the
          phone's top bar (61px) and at the very top on big screens */}
      <p ref={bar} className="eyebrow sticky top-[61px] z-20 -mx-4 -mt-6 mb-1 flex items-center gap-3 bg-canvas px-4 py-2.5 sm:-mx-8 sm:px-8 lg:top-0 lg:-mx-10 lg:-mt-9 lg:px-10" suppressHydrationWarning>
        <span className="min-w-0 flex-1 truncate">
          {now ? formatEyebrowDate(now) : " "} · {label}
        </span>
        {inApp && (
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            aria-label="Refresh"
            title="Refresh"
            aria-busy={refreshing || undefined}
            className="-my-2 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-raised hover:text-ink disabled:cursor-default disabled:opacity-70"
          >
            <Icon name="refresh" size={17} className={cx(refreshing && "motion-safe:animate-spin")} />
          </button>
        )}
      </p>
      <header>
        {/* a touch of room above, so the sticky date bar never sits over the top of the letters */}
        <h1 className="display pt-1 text-[clamp(2.25rem,5vw,3.25rem)] leading-[1.08]">Find your klique.</h1>
      </header>

      {error && !data ? <ErrorState message={error} onRetry={reload} /> : <EventsRow events={events} loading={loading} onEvent={patchEvent} />}


      <div className="mx-auto max-w-[730px]">
        <HomeFeed refreshRef={feedRefresh} moreEvents={events.slice(TOP_EVENTS)} kliques={forYou} onDismissKlique={dismiss} communities={data?.suggestedCommunities ?? []} onEvent={patchEvent} onCommunity={patchCommunity} />
      </div>
    </div>
  );
}
