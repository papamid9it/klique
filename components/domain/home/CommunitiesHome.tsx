"use client";

import Link from "next/link";
import { useState } from "react";
import { CommunityService } from "@/app/services/CommunityService";
import { CrewService } from "@/app/services/CrewService";
import { DiscoverService } from "@/app/services/DiscoverService";
import { usePlace } from "@/components/providers/PlaceProvider";
import { EventService } from "@/app/services/EventService";
import { crewHref } from "@/components/domain/crews/parts";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { JoinButton } from "@/components/domain/JoinButton";
import { Button } from "@/components/ui/Button";
import { Cover } from "@/components/ui/Cover";
import { Icon } from "@/components/ui/Icon";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { communityNews, rankMyCommunities } from "@/lib/constants";
import { eventPhoto } from "@/lib/fake";
import { compactCount, formatDateShort, relativeStamp } from "@/lib/format";
import { useApi, useNow } from "@/lib/hooks/useApi";
import type { InterestId } from "@/lib/constants";
import type { CommunityCardDTO, EventDTO } from "@/lib/types";

const SHADE = "absolute inset-x-0 bottom-0 px-3 py-2 text-white";
/** a soft fade from the bottom under the title, with no visible edge */
const FADE = "pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,.78)_0%,rgba(0,0,0,.35)_35%,transparent_60%)]";
const PILL = "absolute top-2.5 right-2.5 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-white px-2 text-sm font-bold text-black";

/** An event in the big grid, in the same look as a place's tile: its picture, title and when. */
function EventTile({ e, big }: { e: EventDTO; big?: boolean }) {
  const when = formatDateShort(e.startsAt);
  return (
    <Link href={`/events/${e.id}`} aria-label={`${e.title}, ${when}`} className={big ? "relative col-span-2 h-56 overflow-hidden rounded-[20px] border border-line lg:col-span-2 lg:row-span-2 lg:h-auto" : "relative h-36 overflow-hidden rounded-card border border-line lg:h-auto"}>
      <Cover src={eventPhoto(e.id, e.coverImage)} seed={e.id} interest={e.interest} className="absolute inset-0" />
      <span aria-hidden className={FADE} />
      {e.viewer.rsvp === "going" && <span className={PILL}>Going</span>}
      <span className={SHADE}>
        {/* big screens: the date first, small and mono, like a ticket */}
        <span className="hidden truncate font-mono text-[11px] tracking-[.08em] text-white/85 uppercase lg:block">{when}</span>
        <span className={big ? "block text-2xl font-bold leading-tight" : "block truncate text-[15px] font-bold leading-5"}>{e.title}</span>
        <span className="block truncate text-sm text-white/90 lg:hidden">{big && e.community ? `${when} · ${e.community.name}` : when}</span>
        <span className="hidden truncate text-xs text-white/80 lg:block">{e.goingCount} going{big && e.community ? ` · ${e.community.name}` : ""}</span>
      </span>
    </Link>
  );
}

/** One line in "Your communities" or "Kliques for you": a small photo and two lines of text. */
function Row({ href, src, seed, interest, title, line }: { href: string; src: string | null; seed: string; interest: InterestId; title: string; line: string }) {
  return (
    <Link href={href} className="flex min-w-0 items-center gap-3 rounded-card border border-line bg-surface p-2 hover:border-ink-muted/50 lg:rounded-none lg:border-x-0 lg:border-t-0 lg:bg-transparent lg:px-1 lg:py-3 lg:hover:bg-raised/40">
      <Cover src={src} seed={seed} interest={interest} className="size-14 shrink-0 rounded-control lg:size-10" />
      <span className="min-w-0">
        <span className="block truncate font-semibold">{title}</span>
        <span className="block truncate text-sm text-ink-muted">{line}</span>
      </span>
    </Link>
  );
}

/**
 * Home in the Communities style: events coming up (the soonest and busiest big), communities you may like, your
 * communities, and kliques (yours first, then ones you could join, always with Start a klique). No feed, no posts.
 */
export function CommunitiesHome() {
  const mine = useApi(() => CommunityService.mine(), [], { key: "home-places" });
  const going = useApi(() => EventService.list({ scope: "going" }), [], { key: "home-places-going" });
  const { where, label, ready } = usePlace();
  const discover = useApi(() => DiscoverService.discover(where), [where], { key: `discover:${where}`, wait: !ready });
  useRealtimeEvent(() => void mine.reload(), { filter: (e) => e.type === "channel" || (e.type === "crew" && !!e.chat) || (e.type === "notify" && e.category === "community"), debounceMs: 1500 });

  const places = rankMyCommunities(mine.data ?? []);
  const next = (going.data?.items ?? []).find((e) => !e.isPast);
  // events you can see, coming up: the soonest and busiest first (your next one leads)
  const upcoming = (discover.data?.eventsForYou ?? []).filter((e) => !e.isPast && e.id !== next?.id);
  const soonBusy = [...upcoming].sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt) || b.goingCount - a.goingCount);
  const events = [...(next ? [next] : []), ...soonBusy].slice(0, 5);
  // public communities you haven't joined, from Home's suggestions (your interests and place)
  const suggested = (discover.data?.suggestedCommunities ?? []).filter((c) => !c.viewer.isMember).slice(0, 4);
  // joined (or asked) from Home: the card shows it straight away
  const [joined, setJoined] = useState<Record<string, CommunityCardDTO>>({});
  const yourList = places.slice(0, 3);

  return (
    <div className="px-4 py-6 lg:px-7">
      <div className="mb-6 hidden items-center gap-3 border-b border-line pb-4 lg:flex">
        <h1 className="text-xl font-bold tracking-[-0.02em]">Home</h1>
        {label && <span className="rounded-md border border-line px-2 py-1 font-mono text-[11px] tracking-[.12em] text-ink-muted uppercase">{label}</span>}
      </div>
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-2xl font-semibold tracking-[-0.02em]">Events</h2>
        <span className="hidden font-mono text-[11px] tracking-[.12em] text-ink-muted uppercase lg:inline">Coming up · {events.length}</span>
        <Link href="/events" className="ml-auto text-sm font-semibold text-ink-muted hover:text-ink">All events</Link>
      </div>
      {(discover.loading && !discover.data) || (going.loading && !going.data) ? (
        <RowSkeleton rows={4} />
      ) : discover.error && !discover.data ? (
        <ErrorState message={discover.error} onRetry={discover.reload} />
      ) : !events.length ? (
        <EmptyState icon="calendar" title="Nothing coming up yet" action={<Button href="/events" variant="primary">Find events</Button>}>
          Events from your communities and your city show here.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:auto-rows-[150px] lg:grid-cols-4">
          <EventTile e={events[0]} big />
          {events.slice(1, 5).map((e) => (
            <EventTile key={e.id} e={e} />
          ))}
        </div>
      )}

      {suggested.length > 0 && (
        <section aria-labelledby="communities-for-you" className="mt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 id="communities-for-you" className="text-sm font-semibold text-ink-muted">Communities for you</h2>
            <Link href="/communities" className="text-sm font-semibold text-ink-muted hover:text-ink">See more</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-2">
            {suggested.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-card border border-line bg-surface p-2.5 hover:border-ink-muted/50">
                <Link href={`/communities/${c.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Cover src={c.coverImage} seed={c.id} interest={c.interest} className="size-11 shrink-0 rounded-control" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{c.name}</span>
                    <span className="block truncate text-xs text-ink-muted">{c.memberCount != null ? `${compactCount(c.memberCount)} ${c.memberCount === 1 ? "member" : "members"}` : "Public"}</span>
                  </span>
                </Link>
                {/* big screens: join right here */}
                <span className="hidden shrink-0 lg:block">
                  <JoinButton iconOnly community={joined[c.id] ?? c} onChange={(n) => setJoined((j) => ({ ...j, [c.id]: n }))} />
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-1">
        <section aria-labelledby="your-communities" className="min-w-0">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 id="your-communities" className="text-sm font-semibold text-ink-muted">Your communities</h2>
            <Link href="/communities" className="text-sm font-semibold text-ink-muted hover:text-ink">See all</Link>
          </div>
          {mine.loading && !mine.data ? (
            <RowSkeleton rows={3} />
          ) : mine.error && !mine.data ? (
            <ErrorState message={mine.error} onRetry={mine.reload} />
          ) : !yourList.length ? (
            <EmptyState icon="users" title="Find your communities" action={<Button href="/communities" variant="primary">Find communities</Button>}>
              Join a few and they&apos;ll live here, ready to open.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-2 lg:gap-0">
              {yourList.map((c) => {
                const unread = c.mentions || c.unreadCount;
                return (
                  <Row key={c.id} href={`/communities/${c.slug}`} src={c.coverImage} seed={c.id} interest={c.interest} title={c.name}
                    line={`${unread ? `${c.mentions ? `@${c.mentions}` : c.unreadCount >= 99 ? "99+" : c.unreadCount} new · ` : ""}${communityNews(c) ?? (c.lastActivityAt ? `Active ${relativeStamp(c.lastActivityAt)}` : "Quiet lately")}`} />
                );
              })}
            </div>
          )}
        </section>
        {/* big screens show it in the right panel instead */}
        <div className="min-w-0 xl:hidden">
          <HomeKliques />
        </div>
      </div>
    </div>
  );
}

/** Kliques on Communities home: yours still to come first, then ones you could join, and always "Start a klique".
 * In the main column on smaller screens, in the right panel on big ones. */
export function HomeKliques() {
  const { where, ready } = usePlace();
  const kliques = useApi(() => CrewService.forYou({ limit: 3 }), [], { key: "home-places-kliques" });
  const joinedKliques = useApi(() => CrewService.joined(), [], { key: "home-places-kliques-mine" });
  // few picks for you: fill up with other open kliques nearby you're not in, then offer to start one
  const short = !!kliques.data && kliques.data.items.length < 3;
  const nearby = useApi(short && ready ? () => CrewService.list({ open: true, where, limit: 12 }) : null, [short, ready, where], { key: `home-places-kliques-near:${where}` });
  const picked = kliques.data?.items ?? [];
  // yours first (ones still to come), then ones you could join
  const now = useNow();
  const yours = (joinedKliques.data ?? []).filter((k) => !now || +new Date(k.meetupAt) > +now);
  const others = [...picked, ...(nearby.data?.items ?? []).filter((k) => !k.viewer.standing && !picked.some((p) => p.id === k.id))].filter((k) => !yours.some((y) => y.id === k.id));
  const forYou = [...yours, ...others].slice(0, 3);
  return (
    <section aria-labelledby="kliques-for-you" className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="kliques-for-you" className="text-sm font-semibold text-ink-muted">Kliques</h2>
        <Link href="/kliques" className="text-sm font-semibold text-ink-muted hover:text-ink">See more</Link>
      </div>
      <div className="flex flex-col gap-2">
        {forYou.map((k) => (
          <Row key={k.id} href={crewHref(k)} src={k.coverImage} seed={k.id} interest={k.interest} title={k.title}
            line={`${yours.some((y) => y.id === k.id) ? "Yours · " : ""}${formatDateShort(k.meetupAt)} · ${k.memberCount} of ${k.maxMembers} going`} />
        ))}
        {/* always there, even with none */}
        <Link href="/kliques?start=1" className="flex min-w-0 items-center gap-3 rounded-card border border-dashed border-line p-2 hover:border-ink-muted/50">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-control bg-raised text-ink-muted"><Icon name="plus" size={20} /></span>
          <span className="min-w-0">
            <span className="block truncate font-semibold">Start a klique</span>
            <span className="block truncate text-sm text-ink-muted">Pick a plan, a time and a place. People join you.</span>
          </span>
        </Link>
      </div>
    </section>
  );
}
