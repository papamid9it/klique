"use client";

import Link from "next/link";
import { CommunityService } from "@/app/services/CommunityService";
import { CrewService } from "@/app/services/CrewService";
import { DiscoverService } from "@/app/services/DiscoverService";
import { usePlace } from "@/components/providers/PlaceProvider";
import { EventService } from "@/app/services/EventService";
import { crewHref } from "@/components/domain/crews/parts";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { Button } from "@/components/ui/Button";
import { Cover } from "@/components/ui/Cover";
import { Icon } from "@/components/ui/Icon";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { communityNews, rankMyCommunities } from "@/lib/constants";
import { eventPhoto } from "@/lib/fake";
import { formatDateShort, relativeStamp } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import type { InterestId } from "@/lib/constants";
import type { MyCommunityDTO } from "@/lib/types";

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

/** One line in "Coming up" or "Kliques for you": a small photo and two lines of text. */
function Row({ href, src, seed, interest, title, line }: { href: string; src: string | null; seed: string; interest: InterestId; title: string; line: string }) {
  return (
    <Link href={href} className="flex min-w-0 items-center gap-3 rounded-card border border-line bg-surface p-2 hover:border-ink-muted/50">
      <Cover src={src} seed={seed} interest={interest} className="size-14 shrink-0 rounded-control" />
      <span className="min-w-0">
        <span className="block truncate font-semibold">{title}</span>
        <span className="block truncate text-sm text-ink-muted">{line}</span>
      </span>
    </Link>
  );
}

/**
 * Home in the Communities style: the places you joined (the one that needs you most big), more of them, what's coming
 * up (your next event first) and kliques you could join. No feed; at most a little scrolling. The panels either side stay as they are.
 */
export function CommunitiesHome() {
  const mine = useApi(() => CommunityService.mine(), [], { key: "home-places" });
  const going = useApi(() => EventService.list({ scope: "going" }), [], { key: "home-places-going" });
  const kliques = useApi(() => CrewService.forYou({ limit: 3 }), [], { key: "home-places-kliques" });
  const { where, ready } = usePlace();
  const discover = useApi(() => DiscoverService.discover(where), [where], { key: `discover:${where}`, wait: !ready });
  useRealtimeEvent(() => void mine.reload(), { filter: (e) => e.type === "channel" || (e.type === "crew" && !!e.chat) || (e.type === "notify" && e.category === "community"), debounceMs: 1500 });

  const places = rankMyCommunities(mine.data ?? []);
  const next = (going.data?.items ?? []).find((e) => !e.isPast);
  // few picks for you: fill up with other open kliques nearby you're not in, then offer to start one
  const short = !!kliques.data && kliques.data.items.length < 3;
  const nearby = useApi(short && ready ? () => CrewService.list({ open: true, where, limit: 12 }) : null, [short, ready, where], { key: `home-places-kliques-near:${where}` });
  const picked = kliques.data?.items ?? [];
  const forYou = [...picked, ...(nearby.data?.items ?? []).filter((k) => !k.viewer.standing && !picked.some((p) => p.id === k.id))].slice(0, 3);
  const events = [...(next ? [next] : []), ...(discover.data?.eventsForYou ?? []).filter((e) => !e.isPast && e.id !== next?.id)].slice(0, 3);
  const more = places.slice(5, 9);

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

      {more.length > 0 && (
        <section aria-labelledby="more-places" className="mt-6">
          <h2 id="more-places" className="mb-2 text-sm font-semibold text-ink-muted">More of your places</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {more.map((c) => (
              <Link key={c.id} href={`/communities/${c.slug}`} className="flex items-center gap-3 rounded-card border border-line bg-surface p-2.5 hover:border-ink-muted/50">
                <Cover src={c.coverImage} seed={c.id} interest={c.interest} className="size-11 shrink-0 rounded-control" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{c.name}</span>
                  <span className="block truncate text-xs text-ink-muted">{communityNews(c) ?? (c.lastActivityAt ? relativeStamp(c.lastActivityAt) : "Quiet lately")}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {(events.length > 0 || forYou.length > 0) && (
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          {events.length > 0 && (
            <section aria-labelledby="coming-up" className="min-w-0">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 id="coming-up" className="text-sm font-semibold text-ink-muted">Coming up</h2>
                <Link href="/events" className="text-sm font-semibold text-ink-muted hover:text-ink">All events</Link>
              </div>
              <div className="flex flex-col gap-2">
                {events.map((e) => (
                  <Row key={e.id} href={`/events/${e.id}`} src={eventPhoto(e.id, e.coverImage)} seed={e.id} interest={e.interest} title={e.title}
                    line={`${e.id === next?.id ? "You're going · " : ""}${formatDateShort(e.startsAt)}${e.community ? ` · ${e.community.name}` : ""}`} />
                ))}
              </div>
            </section>
          )}
          {forYou.length > 0 && (
            <section aria-labelledby="kliques-for-you" className="min-w-0">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 id="kliques-for-you" className="text-sm font-semibold text-ink-muted">Kliques for you</h2>
                <Link href="/kliques" className="text-sm font-semibold text-ink-muted hover:text-ink">See more</Link>
              </div>
              <div className="flex flex-col gap-2">
                {forYou.map((k) => (
                  <Row key={k.id} href={crewHref(k)} src={k.coverImage} seed={k.id} interest={k.interest} title={k.title}
                    line={`${formatDateShort(k.meetupAt)} · ${k.memberCount} of ${k.maxMembers} going`} />
                ))}
                {forYou.length < 3 && (
                  <Link href="/kliques?start=1" className="flex min-w-0 items-center gap-3 rounded-card border border-dashed border-line p-2 hover:border-ink-muted/50">
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-control bg-raised text-ink-muted"><Icon name="plus" size={20} /></span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">Start a klique</span>
                      <span className="block truncate text-sm text-ink-muted">Pick a plan, a time and a place. People join you.</span>
                    </span>
                  </Link>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
