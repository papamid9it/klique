"use client";

import { COMMUNITIES_AT, mixFeed, newFeedSeed } from "@/lib/feedMix";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState, type RefObject } from "react";
import { useNewerPosts } from "@/components/domain/feed/NewPosts";
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
import { KliqueCard } from "@/components/domain/crews/parts";
import type { CommunityCardDTO, CrewCardDTO, DiscoverDTO, EventDTO, FeedPostDTO, HomeFeedItem, UserBrief } from "@/lib/types";
import { VerifiedCheck } from "@/components/ui/VerifiedCheck";

/** A community to join, in the "Communities to join" carousel: picture, name, members, Join. */
function CommunityTile({ c, onChange }: { c: CommunityCardDTO; onChange: (c: CommunityCardDTO) => void }) {
  return (
    <li className="w-44 shrink-0 snap-start overflow-hidden rounded-card border border-line bg-surface">
      <Link href={`/communities/${c.slug}`} className="block" aria-label={c.name}>
        <Cover src={c.coverImage} seed={c.id} interest={c.interest} className="aspect-[4/3]" />
      </Link>
      <div className="space-y-2 p-3">
        <Link href={`/communities/${c.slug}`} className="flex min-w-0 items-center gap-1 text-[14px] font-semibold hover:underline">
          <span className="truncate">{c.name}</span>
          <VerifiedCheck on={c.verified} size={13} />
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

/** One event, full width, between posts in the feed: picture, date, title, where, how many are going, Going. */
export function EventFeedCard({ e, onChange }: { e: EventDTO; onChange: (e: EventDTO) => void }) {
  const d = dateChip(e.startsAt);
  const { busy, rsvp } = useEventActions(e, onChange);
  const going = e.viewer.rsvp === "going";
  return (
    <article className="overflow-hidden rounded-card border border-line bg-surface">
      <p className="eyebrow px-4 pt-3 pb-2">Event for you</p>
      <Link href={`/events/${e.id}`} className="block">
        <Cover src={eventPhoto(e.id, e.coverImage)} seed={e.id} interest={e.interest} className="aspect-[16/9]">
          <span className="absolute top-2 left-2 flex flex-col items-center rounded-control bg-black/70 px-2.5 py-1.5 leading-none text-white backdrop-blur">
            <span className="font-mono text-[10px] uppercase">{d.month}</span>
            <span className="text-[20px] font-semibold">{d.day}</span>
          </span>
        </Cover>
      </Link>
      <div className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <Link href={`/events/${e.id}`} className="line-clamp-2 text-[17px] leading-snug font-semibold hover:underline">
            {e.title}
          </Link>
          <p className="mt-1 truncate font-mono text-[11px] text-ink-muted">
            {formatTime(e.startsAt)} · {e.online ? "Online" : e.venue} · {compactCount(e.goingCount)} going
          </p>
        </div>
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
    </article>
  );
}

const GAP = 12;

/**
 * A row of cards you scroll sideways, showing only whole cards: the cards are sized so the row fits an exact number
 * of them (as many as fit at `item` px or wider: 4 on a wide screen, then 3, 2, 1 on a phone), so nothing is ever
 * half cut at rest. Scrolling snaps to a whole card; on a computer the round arrows move by exactly one screenful
 * of cards (the previous one only once you've scrolled, the next one only while there's more).
 */
function Carousel({ id, title, item = 208, children }: { id: string; title: string; item?: number; children: React.ReactNode }) {
  const row = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const [fit, setFit] = useState<{ n: number; w: number } | null>(null);
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const inner = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const n = Math.max(1, Math.floor((inner + GAP) / (item + GAP)));
      const w = Math.floor((inner - GAP * (n - 1)) / n);
      setFit((f) => (f && f.n === n && f.w === w ? f : { n, w }));
    };
    const check = () => {
      const left = el.scrollLeft > 4;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
    };
    measure();
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(() => (measure(), check()));
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, [item]);
  // one screenful of whole cards, landing on a card's left edge
  const scroll = (dir: 1 | -1) => {
    const el = row.current;
    if (!el || !fit) return;
    const step = fit.w + GAP;
    const target = Math.round(el.scrollLeft / step + dir * fit.n) * step;
    el.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  };
  const arrow = (dir: 1 | -1) => (
    <div className={cx("pointer-events-none absolute top-1/2 z-10 hidden -translate-y-1/2 [@media(hover:hover)_and_(pointer:fine)]:block", dir < 0 ? "-left-3" : "-right-3")}>
      <button
        type="button"
        onClick={() => scroll(dir)}
        aria-label={`Scroll ${title} ${dir < 0 ? "left" : "right"}`}
        className="pointer-events-auto inline-flex size-10 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-sm transition hover:bg-raised"
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
        <ul
          ref={row}
          style={fit ? ({ "--card-w": `${fit.w}px` } as React.CSSProperties) : undefined}
          className={cx(
            "no-bar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1 sm:mx-0 sm:scroll-px-0 sm:px-0",
            // every card exactly as wide as the row allows (whole cards only), snapping at its left edge
            fit && "[&>li]:!w-[var(--card-w)] [&>li]:shrink-0 [&>li]:snap-start [&>li>*]:!w-full",
          )}
        >
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
  // the server has already mixed them, so no one event leads every time
  if (data.eventsForYou?.length) return data.eventsForYou;
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

/** How many kliques lead Home (in the row near the top); the rest turn up in the feed. */
export const TOP_KLIQUES = 10;

/** Between posts on Home (once, early on): kliques you could join, best for you first, in one row you swipe. */
export function KliquesRow({ kliques, onDismiss }: { kliques: CrewCardDTO[]; onDismiss: (id: string) => void }) {
  if (!kliques.length) return null;
  return (
    <Carousel id="kliques-for-you" title="Kliques for you" item={240}>
      {kliques.slice(0, TOP_KLIQUES).map((k) => (
        <li key={k.id} className="flex shrink-0 snap-start">
          <KliqueCard crew={k} onDismiss={() => onDismiss(k.id)} />
        </li>
      ))}
    </Carousel>
  );
}

/** A new mix each visit, the same while scrolling and coming Back. */
const FEED_SEED = newFeedSeed();

/**
 * Posts from your communities, best first (pictures and videos rank higher), with now and then a trending post
 * from a public community you're not in, and now and then, at random, an event, a klique or a sponsored card (lib/feedMix), and once a row of
 * communities to join. The next page loads as you
 * near the bottom, until "You're all caught up". What's loaded is kept, so Back returns to the same spot.
 */
export function HomeFeed({
  moreEvents,
  fillersLoading,
  kliques = [],
  communities,
  onEvent,
  onCommunity,
  onDismissKlique,
  refreshRef,
  onNewer,
}: {
  moreEvents: EventDTO[];
  /** the events and kliques are still loading */
  fillersLoading: boolean;
  kliques?: CrewCardDTO[];
  communities: CommunityCardDTO[];
  onEvent: (e: EventDTO) => void;
  onCommunity: (c: CommunityCardDTO) => void;
  onDismissKlique?: (id: string) => void;
  /** filled with "load the feed again from the top" for Home's refresh */
  refreshRef?: RefObject<(() => Promise<void>) | null>;
  /** who posted since the newest post on screen (checked every minute while the tab is open; empty: nothing new) */
  onNewer?: (authors: UserBrief[]) => void;
}) {
  const { status, requireAuth } = useAuth();
  const authed = status === "authed";
  const { items, hasMore, error, load, setItems, sentinel, anchor } = useInfiniteFeed<HomeFeedItem>(
    "home-feed",
    async (page, at) => (await FeedService.home(page, at)).data,
    (x) => x.post.id,
    authed,
  );
  useEffect(() => {
    if (!refreshRef) return;
    refreshRef.current = () => (authed ? load(true) : Promise.resolve());
    return () => {
      refreshRef.current = null;
    };
  }, [refreshRef, load, authed]);
  // newer posts than the newest one on screen (for Home's "New posts" pill); trending posts from elsewhere don't count
  useNewerPosts(
    items?.filter((x) => !x.trending).map((x) => x.post) ?? null,
    async () => (await FeedService.home(1)).data.items.filter((x) => !x.trending).map((x) => x.post),
    (authors) => onNewer?.(authors),
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
    // no posts yet (Klique's early days): what's happening still fills the page
    // the same kliques and events that sit between posts, taking turns
    const between = Math.max(kliques.length, moreEvents.length);
    if (between) {
      return (
        <section aria-label="What's happening">
          <ul className="space-y-5">
            {Array.from({ length: between }, (_, n) => (
              <Fragment key={n}>
                {moreEvents[n] && (
                  <li>
                    <EventFeedCard e={moreEvents[n]} onChange={onEvent} />
                  </li>
                )}
                {kliques[n] && (
                  <li>
                    <p className="eyebrow mb-2">Klique for you</p>
                    <KliqueCard crew={kliques[n]} wide onDismiss={onDismissKlique ? () => onDismissKlique(kliques[n].id) : undefined} />
                  </li>
                )}
              </Fragment>
            ))}
          </ul>
        </section>
      );
    }
    // what fills the page may still be on its way: not "nothing" yet
    if (fillersLoading) return <RowSkeleton rows={3} />;
    return (
      <EmptyState icon="image" title="No posts yet" action={<Button href="/communities" variant="primary">Find communities</Button>}>
        Pictures and videos from your communities show up here. Join a few, or turn on Posts in one you run.
      </EmptyState>
    );
  }

  const { slots, rows } = mixFeed(items.length, kliques, moreEvents, ads.length, FEED_SEED, [COMMUNITIES_AT]);
  return (
    <section ref={anchor} aria-labelledby="feed-h" className="space-y-5">
      <h2 id="feed-h" className="text-lg font-semibold tracking-tight">
        From your communities
      </h2>
      <ul className="space-y-5">
        {items.map((it, i) => {
          const n = i + 1;
          const slot = slots.get(n);
          const kliqueRow = rows.get(n) ?? [];
          const joinable = n === COMMUNITIES_AT ? communities.filter((c) => !c.viewer.isMember).slice(0, 8) : [];
          return (
            <Fragment key={it.post.id}>
              <li>
                <PostCard post={it.post} trending={it.trending} showCommunity onChange={patch} onRemoved={() => drop(it.post.id)} onOpenComments={() => open(it.post)} />
              </li>
              {kliqueRow.length > 0 && (
                <li>
                  <KliquesRow kliques={kliqueRow} onDismiss={onDismissKlique ?? (() => {})} />
                </li>
              )}
              {slot?.kind === "ad" && (
                <li>
                  <SponsoredCard ad={ads[slot.ad]} />
                </li>
              )}
              {slot?.kind === "event" && (
                <li>
                  <EventFeedCard e={slot.event} onChange={onEvent} />
                </li>
              )}
              {slot?.kind === "klique" && (
                <li>
                  <p className="eyebrow mb-2">Klique for you</p>
                  <KliqueCard crew={slot.klique} wide onDismiss={onDismissKlique ? () => onDismissKlique(slot.klique.id) : undefined} />
                </li>
              )}
              {joinable.length > 0 && (
                <li>
                  <Carousel id="communities-to-join" title="Communities to join" item={176}>
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
