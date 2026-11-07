"use client";

import Link from "next/link";
import { CommunityService } from "@/app/services/CommunityService";
import { CrewService } from "@/app/services/CrewService";
import { EventService } from "@/app/services/EventService";
import { crewHref } from "@/components/domain/crews/parts";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { Button } from "@/components/ui/Button";
import { Cover } from "@/components/ui/Cover";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { communityNews, rankMyCommunities } from "@/lib/constants";
import { eventPhoto } from "@/lib/fake";
import { formatDateShort, relativeStamp } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import type { CrewCardDTO, EventDTO, MyCommunityDTO } from "@/lib/types";

const SHADE = "absolute inset-x-0 bottom-0 bg-black/40 px-3 py-2 text-white";
const PILL = "absolute top-2.5 right-2.5 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-white px-2 text-sm font-bold text-black";

function Place({ c, big }: { c: MyCommunityDTO; big?: boolean }) {
  const news = communityNews(c);
  const unread = c.mentions || c.unreadCount;
  return (
    <Link href={`/communities/${c.slug}`} aria-label={`${c.name}${news ? `, ${news}` : ""}`} className={big ? "relative col-span-2 h-56 overflow-hidden rounded-[20px] lg:col-span-1 lg:row-span-2 lg:h-auto" : "relative h-36 overflow-hidden rounded-card lg:h-auto"}>
      <Cover src={c.coverImage} seed={c.id} interest={c.interest} className="absolute inset-0" />
      {big ? news && <span className={PILL}>{news}</span> : !!unread && <span className={PILL}>{c.mentions ? `@${c.mentions}` : c.unreadCount >= 99 ? "99+" : c.unreadCount}</span>}
      <span className={SHADE}>
        <span className={big ? "block text-2xl font-bold leading-tight" : "block truncate text-[15px] font-bold leading-5"}>{c.name}</span>
        <span className="block truncate text-sm text-white/90">{big ? (news ?? (c.lastActivityAt ? `Active ${relativeStamp(c.lastActivityAt)}` : "Quiet lately")) : c.lastActivityAt ? relativeStamp(c.lastActivityAt) : "Quiet lately"}</span>
      </span>
    </Link>
  );
}

function NextUp({ e }: { e: EventDTO }) {
  const d = new Date(e.startsAt);
  return (
    <Link href={`/events/${e.id}`} className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface">
      <Cover src={eventPhoto(e.id, e.coverImage)} seed={e.id} interest={e.interest} className="h-24 shrink-0">
        <span className="absolute top-2.5 left-2.5 flex w-12 flex-col items-center rounded-control bg-black/60 py-1 text-white">
          <span className="text-xs">{d.toLocaleDateString("en-GB", { month: "short", timeZone: "Africa/Lagos" })}</span>
          <span className="text-lg leading-5 font-bold">{d.toLocaleDateString("en-GB", { day: "numeric", timeZone: "Africa/Lagos" })}</span>
        </span>
      </Cover>
      <span className="p-3">
        <span className="block text-sm text-ink-muted">You&apos;re going · {formatDateShort(e.startsAt)}</span>
        <span className="line-clamp-2 font-semibold">{e.title}</span>
      </span>
    </Link>
  );
}

function KliqueTile({ k }: { k: CrewCardDTO }) {
  return (
    <Link href={crewHref(k)} className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface">
      <Cover src={k.coverImage} seed={k.id} interest={k.interest} className="h-24 shrink-0" />
      <span className="p-3">
        <span className="line-clamp-2 font-semibold">{k.title}</span>
        <span className="mt-0.5 block text-sm text-ink-muted">
          {formatDateShort(k.meetupAt)} · {k.memberCount} of {k.maxMembers} going
        </span>
      </span>
    </Link>
  );
}

/**
 * Home in the Communities style: the places you joined (the one that needs you most big), your next event, and kliques
 * you could join. It fits the screen: no feed, no scrolling. The panels either side stay as they are.
 */
export function CommunitiesHome() {
  const mine = useApi(() => CommunityService.mine(), [], { key: "home-places" });
  const going = useApi(() => EventService.list({ scope: "going" }), [], { key: "home-places-going" });
  const kliques = useApi(() => CrewService.forYou({ limit: 2 }), [], { key: "home-places-kliques" });
  useRealtimeEvent(() => void mine.reload(), { filter: (e) => e.type === "channel" || (e.type === "crew" && !!e.chat) || (e.type === "notify" && e.category === "community"), debounceMs: 1500 });

  const places = rankMyCommunities(mine.data ?? []);
  const next = (going.data?.items ?? []).find((e) => !e.isPast);
  const forYou = (kliques.data?.items ?? []).slice(0, 2);

  return (
    <div className="px-4 py-6 lg:px-7">
      <h1 className="mb-3 text-2xl font-semibold tracking-[-0.02em]">Your places</h1>
      {mine.loading && !mine.data ? (
        <RowSkeleton rows={4} />
      ) : mine.error && !mine.data ? (
        <ErrorState message={mine.error} onRetry={mine.reload} />
      ) : !places.length ? (
        <EmptyState icon="users" title="Find your communities" action={<Button href="/communities" variant="primary">Find communities</Button>}>
          Join a few and they&apos;ll live here, ready to open.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-[2fr_1fr_1fr] lg:grid-rows-[150px_150px]">
          <Place c={places[0]} big />
          {places.slice(1, 5).map((c) => (
            <Place key={c.id} c={c} />
          ))}
        </div>
      )}

      {(next || forYou.length > 0) && (
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {next && (
            <section aria-labelledby="next-up" className="flex flex-col">
              <h2 id="next-up" className="mb-2 text-sm font-semibold text-ink-muted">Next up</h2>
              <div className="flex-1"><NextUp e={next} /></div>
            </section>
          )}
          {forYou.length > 0 && (
            <section aria-labelledby="kliques-for-you" className={next ? "flex flex-col md:col-span-2" : "flex flex-col md:col-span-3"}>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 id="kliques-for-you" className="text-sm font-semibold text-ink-muted">Kliques for you</h2>
                <Link href="/kliques" className="text-sm font-semibold text-ink-muted hover:text-ink">See more</Link>
              </div>
              <div className="grid flex-1 grid-cols-2 gap-3">
                {forYou.map((k) => (
                  <KliqueTile key={k.id} k={k} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
