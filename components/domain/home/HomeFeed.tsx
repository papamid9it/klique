"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { FeedService } from "@/app/services/FeedService";
import { JoinButton } from "@/components/domain/JoinButton";
import { SponsoredCard, useAds } from "@/components/domain/ads/Sponsored";
import { PostCard } from "@/components/domain/feed/PostCard";
import { PostDialog, usePostOverlay } from "@/components/domain/feed/PostDialog";
import { FeedFooter, FindMore, useInfiniteFeed } from "@/components/domain/feed/useInfiniteFeed";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Cover } from "@/components/ui/Cover";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { RowSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/States";
import { eventPhoto } from "@/lib/fake";
import { compactCount, dateChip, formatTime } from "@/lib/format";
import { useEventActions } from "@/lib/hooks/useEventActions";
import type { CommunityCardDTO, DiscoverDTO, EventDTO, FeedPostDTO, HomeFeedItem } from "@/lib/types";

/** A community to join, in the "Communities to join" carousel: picture, name, members, Join. */
function CommunityTile({ c, onChange }: { c: CommunityCardDTO; onChange: (c: CommunityCardDTO) => void }) {
  return (
    <li className="w-44 shrink-0 snap-start overflow-hidden rounded-card border border-line bg-surface">
      <Link href={`/communities/${c.slug}`} className="block" aria-label={c.name}>
        <Cover src={c.coverImage} seed={c.id} interest={c.interest} className="aspect-[4/3]" />
      </Link>
      <div className="space-y-2 p-3">
        <Link href={`/communities/${c.slug}`} className="block truncate text-[14px] font-semibold hover:underline">
          {c.name}
        </Link>
        <p className="font-mono text-[11px] text-ink-muted">{c.memberCount === null ? "Private" : `${compactCount(c.memberCount)} members`}</p>
        <JoinButton community={c} onChange={onChange} />
      </div>
    </li>
  );
}

/** An upcoming event: picture with the date on it, title, time and place, how many are going, and Going. */
function EventTile({ e, onChange }: { e: EventDTO; onChange: (e: EventDTO) => void }) {
  const d = dateChip(e.startsAt);
  const { busy, rsvp } = useEventActions(e, onChange);
  const going = e.viewer.rsvp === "going";
  return (
    <li className="flex w-52 shrink-0 snap-start flex-col overflow-hidden rounded-card border border-line bg-surface">
      <Link href={`/events/${e.id}`} className="block">
        <Cover src={eventPhoto(e.id, e.coverImage)} seed={e.id} interest={e.interest} className="aspect-[4/3]">
          <span className="absolute top-2 left-2 flex flex-col items-center rounded-control bg-black/70 px-2 py-1 leading-none text-white backdrop-blur">
            <span className="font-mono text-[9px] uppercase">{d.month}</span>
            <span className="text-[17px] font-semibold">{d.day}</span>
          </span>
        </Cover>
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <Link href={`/events/${e.id}`} className="line-clamp-2 text-[14px] leading-snug font-semibold hover:underline">
          {e.title}
        </Link>
        <p className="truncate font-mono text-[11px] text-ink-muted">
          {formatTime(e.startsAt)} · {e.online ? "Online" : e.venue}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-muted">
            <Icon name="users" size={12} /> {compactCount(e.goingCount)} going
          </span>
          {e.viewer.isHost ? (
            <span className="text-[12px] font-semibold text-ink-muted">Hosting</span>
          ) : e.viewer.mustJoin && !e.viewer.rsvp ? (
            <Button size="sm" href={`/events/${e.id}`}>
              View
            </Button>
          ) : (
            <Button size="sm" variant={going ? "primary" : "secondary"} loading={busy === "rsvp"} disabled={e.isFull && !going} onClick={() => void rsvp("going")} aria-pressed={going}>
              {going ? (
                <>
                  <Icon name="check" size={13} /> Going
                </>
              ) : (
                "Going?"
              )}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

/** A titled row of cards you scroll sideways, with arrows on big screens. */
/**
 * A row of cards you scroll sideways. On a computer, round arrows sit on the row's edges over a soft fade: the left
 * one only once you've scrolled, the right one only while there's more, neither when it all fits. Touch screens
 * just swipe.
 */
function Carousel({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const row = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const check = () => {
      const left = el.scrollLeft > 4;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, []);
  const scroll = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * Math.max(240, (row.current?.clientWidth ?? 600) * 0.8), behavior: "smooth" });
  const arrow = (dir: 1 | -1) => (
    <div className={cx("pointer-events-none absolute inset-y-0 z-10 hidden w-16 items-center [@media(hover:hover)_and_(pointer:fine)]:flex", dir < 0 ? "left-0 justify-start bg-gradient-to-r from-canvas via-canvas/70 to-transparent" : "right-0 justify-end bg-gradient-to-l from-canvas via-canvas/70 to-transparent")}>
      <button
        type="button"
        onClick={() => scroll(dir)}
        aria-label={`Scroll ${title} ${dir < 0 ? "left" : "right"}`}
        className="pointer-events-auto inline-flex size-10 items-center justify-center rounded-full border border-line bg-surface/95 text-ink shadow-lg opacity-80 backdrop-blur transition group-hover/carousel:opacity-100 hover:bg-raised focus-visible:opacity-100"
      >
        <Icon name={dir < 0 ? "chevron-left" : "chevron-right"} size={18} />
      </button>
    </div>
  );
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-3 text-lg font-semibold tracking-tight">
        {title}
      </h2>
      <div className="group/carousel relative">
        {edges.left && arrow(-1)}
        <ul ref={row} className="no-bar -mx-4 flex snap-x gap-3 overflow-x-auto scroll-px-4 px-4 pb-1 sm:mx-0 sm:scroll-px-0 sm:px-0">
          {children}
        </ul>
        {edges.right && arrow(1)}
      </div>
    </section>
  );
}

/**
 * Every upcoming event Home knows about for this place, best first: ones in your scenes, then the busiest, with
 * the featured one and those near you nudged up. The first few lead the page; the rest turn up in the feed.
 */
export function rankEvents(data: DiscoverDTO | null, interests: string[]): EventDTO[] {
  if (!data) return [];
  const near = new Set(data.eventsNearYou.map((e) => e.id));
  const all = [data.featured, ...data.eventsNearYou, ...data.fromCommunities, ...data.thisWeekend, ...data.free, ...data.online].filter((e): e is EventDTO => !!e && !e.isPast);
  const unique = all.filter((e, i) => all.findIndex((x) => x.id === e.id) === i);
  const score = (e: EventDTO) => (interests.includes(e.interest) ? 3 : 0) + (near.has(e.id) ? 1 : 0) + (data.featured?.id === e.id ? 1 : 0) + Math.log2(1 + e.goingCount);
  return unique.sort((a, b) => score(b) - score(a));
}

/** How many events lead the page; the rest go into the feed's "More events" rows. */
export const TOP_EVENTS = 10;

/** The top of Home: upcoming events for you, in one row you scroll sideways. */
export function EventsRow({ events, loading, onEvent }: { events: EventDTO[]; loading: boolean; onEvent: (e: EventDTO) => void }) {
  if (loading && !events.length) return <Skeleton className="h-72 rounded-card" />;
  if (!events.length) return null;
  return (
    <Carousel id="events-for-you" title="Events for you">
      {events.slice(0, TOP_EVENTS).map((e) => (
        <EventTile key={e.id} e={e} onChange={onEvent} />
      ))}
    </Carousel>
  );
}

/** How often an ad sits between posts in the home feed, and how often a row of more events. */
const AD_EVERY = 4;
const EVENTS_EVERY = 8;
/** After this many posts, once: communities to join. */
const COMMUNITIES_AT = 6;

/**
 * Posts from your communities, best first (pictures and videos rank higher), with now and then a trending post
 * from a public community you're not in, a sponsored card every few posts, a row of more events every eight
 * (ones not already at the top of the page) and once a row of communities to join. The next page loads as you
 * near the bottom, until "You're all caught up". What's loaded is kept, so Back returns to the same spot.
 */
export function HomeFeed({ moreEvents, communities, onEvent, onCommunity }: { moreEvents: EventDTO[]; communities: CommunityCardDTO[]; onEvent: (e: EventDTO) => void; onCommunity: (c: CommunityCardDTO) => void }) {
  const { status, requireAuth } = useAuth();
  const authed = status === "authed";
  const { items, hasMore, error, load, setItems, sentinel, anchor } = useInfiniteFeed<HomeFeedItem>(
    "home-feed",
    async (page, at) => (await FeedService.home(page, at)).data,
    (x) => x.post.id,
    authed,
  );
  const ads = useAds("home-feed", { count: 3 }, authed);
  // a post opens over the feed at its own link (/p/[id])
  const { opened, setOpened, open, close } = usePostOverlay();

  const patch = (p: FeedPostDTO) => {
    setItems((list) => list.map((x) => (x.post.id === p.id ? { ...x, post: p } : x)));
    setOpened((o) => (o?.id === p.id ? p : o));
  };
  const drop = (id: string) => setItems((list) => list.filter((x) => x.post.id !== id));

  if (status === "anon") {
    return (
      <EmptyState icon="image" title="Your feed lives here" action={<Button variant="primary" onClick={() => requireAuth()}>Sign in</Button>}>
        Posts from the communities you join show up here.
      </EmptyState>
    );
  }
  if (!items) {
    if (error)
      return (
        <EmptyState icon="image" title="Couldn't load your feed" action={<Button onClick={() => void load(true)}>Try again</Button>}>
          {error}
        </EmptyState>
      );
    return <RowSkeleton rows={3} />;
  }
  if (!items.length) {
    return (
      <EmptyState icon="image" title="No posts yet" action={<Button href="/communities" variant="primary">Find communities</Button>}>
        Pictures and videos from your communities show up here. Join a few, or turn on Posts in one you run.
      </EmptyState>
    );
  }

  return (
    <section ref={anchor} aria-labelledby="feed-h" className="space-y-5">
      <h2 id="feed-h" className="text-lg font-semibold tracking-tight">
        From your communities
      </h2>
      <ul className="space-y-5">
        {items.map((it, i) => {
          const n = i + 1;
          // the few ads there are take turns all the way down
          const ad = n % AD_EVERY === 0 && ads.length ? ads[(n / AD_EVERY - 1) % ads.length] : undefined;
          const eventChunk = n % EVENTS_EVERY === 0 ? moreEvents.slice((n / EVENTS_EVERY - 1) * 6, (n / EVENTS_EVERY) * 6) : [];
          const joinable = n === COMMUNITIES_AT ? communities.filter((c) => !c.viewer.isMember).slice(0, 8) : [];
          return (
            <Fragment key={it.post.id}>
              <li>
                <PostCard post={it.post} trending={it.trending} showCommunity onChange={patch} onRemoved={() => drop(it.post.id)} onOpenComments={() => open(it.post)} />
              </li>
              {ad && (
                <li>
                  <SponsoredCard ad={ad} />
                </li>
              )}
              {eventChunk.length > 0 && (
                <li>
                  <Carousel id={`more-events-${n}`} title="More events">
                    {eventChunk.map((e) => (
                      <EventTile key={e.id} e={e} onChange={onEvent} />
                    ))}
                  </Carousel>
                </li>
              )}
              {joinable.length > 0 && (
                <li>
                  <Carousel id="communities-to-join" title="Communities to join">
                    {joinable.map((c) => (
                      <CommunityTile key={c.id} c={c} onChange={onCommunity} />
                    ))}
                  </Carousel>
                </li>
              )}
            </Fragment>
          );
        })}
      </ul>
      <FeedFooter hasMore={hasMore} error={error} onRetry={() => void load(false)} sentinel={sentinel} end={<>That&apos;s every new post from your communities. <FindMore /></>} />
      <PostDialog post={opened} onChange={patch} onClose={close} />
    </section>
  );
}
