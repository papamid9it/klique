"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { errorMessage, isApiError } from "@/app/ApiCore";
import { FeedService } from "@/app/services/FeedService";
import { ReportDialog } from "@/components/domain/ReportDialog";
import { absoluteUrl } from "@/components/domain/ShareButton";
import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { CrewService } from "@/app/services/CrewService";
import { EventService } from "@/app/services/EventService";
import { SponsoredCard, useAds } from "@/components/domain/ads/Sponsored";
import { KliqueCard } from "@/components/domain/crews/parts";
import { EventFeedCard } from "@/components/domain/home/HomeFeed";
import { mixReels, newFeedSeed } from "@/lib/feedMix";
import { useApi } from "@/lib/hooks/useApi";
import { Spinner } from "@/components/ui/Button";
import { UserName } from "@/components/ui/UserName";
import { cdn, videoPoster, videoSrc } from "@/lib/cdn";
import { isDataSaver } from "@/lib/data-saver";
import { compactCount } from "@/lib/format";
import type { EventDTO, FeedPostDTO } from "@/lib/types";
import { postHref, useVote } from "./PostCard";
import { PostDialog } from "./PostDialog";
import { RichText } from "./RichText";

function RailButton({ icon, label, count, on, filled, onClick }: { icon: IconName; label: string; count?: number; /** its colour when it's chosen */ on?: string; filled?: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={!!on} onClick={onClick} className="flex w-12 flex-col items-center gap-1 text-white">
      <span className={cx("inline-flex size-11 items-center justify-center rounded-full backdrop-blur transition", on ?? "bg-white/15 hover:bg-white/25")}>
        <Icon name={icon} size={21} className={filled ? "fill-current" : undefined} />
      </span>
      {count !== undefined && <span className="text-xs font-semibold drop-shadow">{compactCount(count)}</span>}
    </button>
  );
}

function Reel({ post: p, active, next, held, muted, onMuted, onChange, onComments, onReport }: { post: FeedPostDTO; active: boolean; /** one of the next two: its video gets ready */ next: boolean; /** comments or a report are open over it: it waits where it is */ held: boolean; muted: boolean; onMuted: () => void; onChange: (p: FeedPostDTO) => void; onComments: () => void; onReport: () => void }) {
  const toast = useToast();
  const vote = useVote(p, onChange);
  const video = useRef<HTMLVideoElement>(null);
  const [at, setAt] = useState(0);
  const [more, setMore] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hearts, setHearts] = useState(0);
  const item = p.media[Math.min(at, p.media.length - 1)];
  // an album moves with a finger, left or right; up and down is the next reel
  const touch = useRef<{ x: number; y: number } | null>(null);
  const swipeStart = (e: TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const swipeEnd = (e: TouchEvent) => {
    const from = touch.current;
    touch.current = null;
    if (!from || p.media.length < 2) return;
    const dx = e.changedTouches[0].clientX - from.x;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(e.changedTouches[0].clientY - from.y)) return;
    setAt((i) => Math.max(0, Math.min(p.media.length - 1, i + (dx < 0 ? 1 : -1))));
  };
  // two taps: love, with a heart every time (it never takes love back)
  const oneTap = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (oneTap.current) clearTimeout(oneTap.current);
  }, []);
  const tapped = () => {
    if (oneTap.current) {
      clearTimeout(oneTap.current);
      oneTap.current = null;
      setHearts((n) => n + 1);
      if (p.myVote !== 1) void vote(1);
      return;
    }
    // one tap: play or pause, once it's clear a second isn't coming
    oneTap.current = setTimeout(() => {
      oneTap.current = null;
      const v = video.current;
      if (v) void (v.paused ? v.play() : v.pause());
    }, 280);
  };
  const backdrop = item.kind === "video" ? (item.poster ?? videoPoster(item.url)) : item.url;

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (!active) {
      v.pause();
      v.currentTime = 0;
    } else if (held) v.pause();
    else void v.play().catch(() => setPaused(true));
    // leaving the page mustn't leave it playing out of sight
    return () => v.pause();
  }, [active, held, item.url]);

  const share = () => {
    const url = absoluteUrl(postHref(p));
    if (navigator.share) void navigator.share({ url }).catch(() => {});
    else void navigator.clipboard?.writeText(url).then(() => toast("Link copied", "success"));
  };

  return (
    <section aria-label={`Post by ${p.author.displayName}`} onTouchStart={swipeStart} onTouchEnd={swipeEnd} className="relative flex h-dvh w-full shrink-0 snap-start snap-always items-center justify-center overflow-hidden bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {backdrop && !p.plainBackdrop && <img src={cdn(backdrop, { w: 200 })} alt="" aria-hidden="true" className="absolute inset-0 size-full scale-110 object-cover opacity-30 blur-2xl" />}
      <div className="relative flex h-full max-w-full items-center justify-center gap-3 sm:max-w-[calc(100%-11rem)] sm:py-4">
        <div className="relative flex h-full max-w-full items-center justify-center overflow-hidden sm:h-auto sm:max-w-[min(100%,44rem)] sm:rounded-card">
          {item.kind === "video" ? (
            <video
              ref={video}
              src={videoSrc(item.url)}
              poster={backdrop ?? undefined}
              muted={muted}
              loop
              playsInline
              preload={active || (next && !isDataSaver()) ? "auto" : "none"}
              onPlay={() => setPaused(false)}
              onPause={() => setPaused(true)}
              className="max-h-full max-w-full object-contain sm:max-h-[86dvh]"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cdn(item.url, { w: 1200 })} alt="" loading={active ? "eager" : "lazy"} className="max-h-full max-w-full object-contain sm:max-h-[86dvh]" />
          )}
          {/* every tap on the picture lands here, the caption's strip included */}
          <button type="button" aria-label={item.kind === "video" ? "Play or pause. Two taps to love" : "Two taps to love"} onClick={tapped} className="absolute inset-0 cursor-pointer touch-manipulation" />
          {hearts > 0 && (
            <span key={hearts} className="vote-burst pointer-events-none absolute inset-0 m-auto inline-flex size-24 items-center justify-center text-[#ff3040] drop-shadow-[0_4px_18px_rgba(0,0,0,.45)]" aria-hidden="true">
              <Icon name="heart" size={88} className="fill-current" />
            </span>
          )}
          {item.kind === "video" && paused && active && !held && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-white/90">
              <span className="inline-flex size-16 items-center justify-center rounded-full bg-black/50"><Icon name="play" size={28} /></span>
            </span>
          )}
          {p.media.length > 1 && (
            <>
              {at > 0 && <button type="button" aria-label="Previous picture" onClick={() => setAt(at - 1)} className="absolute top-1/2 left-2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white"><Icon name="chevron-left" size={18} /></button>}
              {at < p.media.length - 1 && <button type="button" aria-label="Next picture" onClick={() => setAt(at + 1)} className="absolute top-1/2 right-2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white"><Icon name="chevron-right" size={18} /></button>}
              <span aria-label={`Picture ${at + 1} of ${p.media.length}`} className="pointer-events-none absolute inset-x-0 bottom-2 z-10 flex justify-center gap-1.5">
                {p.media.map((_, i) => <span key={i} className={`size-[7px] rounded-full ${i === at ? "bg-white" : "bg-white/40"}`} />)}
              </span>
            </>
          )}
          {item.kind === "video" && (
            <button type="button" aria-label={muted ? "Turn the sound on" : "Turn the sound off"} onClick={onMuted} className="absolute top-3 right-3 inline-flex size-9 items-center justify-center rounded-full bg-black/55 text-white">
              <Icon name={muted ? "volumeoff" : "volume"} size={17} />
            </button>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-4 pt-14 pr-16 pb-4 text-white sm:pr-4">
            <div className="pointer-events-auto flex w-fit max-w-full items-center gap-2">
              <ProfileTrigger handle={p.author.handle} className="flex min-w-0 items-center gap-2 text-left">
                <Avatar name={p.author.displayName} src={p.author.avatarUrl} size={34} />
                <span className="truncate text-sm font-semibold"><UserName name={p.author.displayName} effect={p.author.nameEffect} /></span>
              </ProfileTrigger>
              <span aria-hidden="true">·</span>
              <Link href={`/communities/${p.community.slug}?view=posts`} className="truncate text-[13px] font-medium text-white/85 hover:underline">{p.community.name}</Link>
            </div>
            {p.caption && (
              <div className={`pointer-events-auto mt-1.5 text-sm leading-snug [&_a]:text-white [&_a]:underline ${more ? "max-h-40 overflow-y-auto" : "line-clamp-2"}`}>
                <RichText text={p.caption} refs={p.refs} formatted />
              </div>
            )}
            {p.caption.length > 90 && (
              <button type="button" onClick={() => setMore((m) => !m)} className="pointer-events-auto mt-0.5 text-[13px] font-semibold text-white/80 hover:text-white">
                {more ? "Less" : "More"}
              </button>
            )}
          </div>
        </div>
        <div className="absolute right-1.5 bottom-20 flex flex-col items-center gap-2.5 sm:static sm:self-end sm:pb-2">
          <RailButton icon="heart" filled={p.myVote === 1} label={p.myVote === 1 ? "Take your love back" : "Love"} count={p.upCount} on={p.myVote === 1 ? "bg-[#ff3040] text-white" : undefined} onClick={() => void vote(1)} />
          <RailButton icon="message" label="Comments" count={p.commentCount} onClick={onComments} />
          <RailButton icon="send" label="Share" onClick={share} />
          <RailButton icon="flag" label="Report" onClick={onReport} />
        </div>
      </div>
    </section>
  );
}

// the same mix for this visit, as more reels load
const REEL_SEED = newFeedSeed();

/** A full screen of its own for what comes between reels. */
function Between({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section aria-label={label} className="flex h-dvh w-full shrink-0 snap-start snap-always items-center justify-center bg-black px-4">
      <div className="w-full max-w-md rounded-card bg-canvas p-3 text-ink">{children}</div>
    </section>
  );
}

/** Pictures and videos, full screen, one after another (mostly videos), with an event, a klique or an ad now and then. Scroll, the arrows or the arrow keys move on. */
export function ReelsView() {
  const sp = useSearchParams();
  // the app keeps pages it has shown: each tap on a post starts again, from that post
  return <Reels key={`${sp.get("start")}:${sp.get("from")}`} start={sp.get("start") ?? undefined} />;
}

function Reels({ start }: { start?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<FeedPostDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [commentsOn, setCommentsOn] = useState<FeedPostDTO | null>(null);
  const [reporting, setReporting] = useState<FeedPostDTO | null>(null);
  const { status, requireAuth } = useAuth();
  useEffect(() => {
    if (status === "anon") requireAuth({ redirect: true });
  }, [status, requireAuth]);
  // opened from a link there may be nothing to go back to
  const leave = useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.replace("/");
  }, [router]);
  const box = useRef<HTMLDivElement>(null);
  // now and then, between reels
  // nothing goes between the first few, so these wait until someone gets that far
  const farEnough = items.length >= 8;
  const events = useApi(farEnough ? () => EventService.list({ page: 1 }) : null, [farEnough], { key: "reels-events" });
  const kliques = useApi(farEnough ? () => CrewService.forYou({ limit: 30 }) : null, [farEnough], { key: "reels-kliques" });
  const ads = useAds("home-feed", { count: 3 }, farEnough);
  const [eventsNow, setEventsNow] = useState<Record<string, EventDTO>>({});
  const paging = useRef({ page: 0, at: undefined as number | undefined, hasMore: true, busy: false });

  const loadMore = useCallback(async () => {
    const s = paging.current;
    if (s.busy || !s.hasMore) return;
    s.busy = true;
    try {
      const res = (await FeedService.reels(s.page + 1, s.at, start)).data;
      s.page = res.page;
      s.at = res.at;
      s.hasMore = res.hasMore;
      setItems((now) => [...now, ...res.items.filter((x) => !now.some((y) => y.id === x.id))]);
    } catch (e) {
      // reels are switched off: a saved link just goes to the post, or home
      if (isApiError(e) && e.code === "reels_off") return router.replace(start ? `/p/${start}` : "/");
      // no connection: the list carries on by itself once it's back
      if (navigator.onLine) toast(errorMessage(e), "error");
    } finally {
      s.busy = false;
      setLoading(false);
    }
  }, [start, toast, router]);

  useEffect(() => {
    if (status === "authed") void loadMore();
  }, [loadMore, status]);
  useEffect(() => {
    const again = () => void loadMore();
    window.addEventListener("online", again);
    return () => window.removeEventListener("online", again);
  }, [loadMore]);

  useEffect(() => {
    if (items.length && active >= items.length - 6) void loadMore();
  }, [active, items.length, loadMore]);

  const go = useCallback((to: number) => {
    const el = box.current;
    if (el) el.scrollTo({ top: to * el.clientHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (commentsOn || reporting) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        go(active + (e.key === "ArrowDown" ? 1 : -1));
      }
      if (e.key === "Escape") leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, go, leave, commentsOn, reporting]);

  const entries = useMemo(() => {
    const slots = mixReels(items.length, kliques.data?.items ?? [], (events.data?.items ?? []).filter((e) => !e.isPast && !e.review), ads.length, REEL_SEED);
    return items.flatMap((p, i) => {
      const slot = slots.get(i);
      return slot ? [{ post: p, at: i }, { slot, at: i }] : [{ post: p, at: i }];
    });
  }, [items, kliques.data, events.data, ads.length]);

  const change = (p: FeedPostDTO) => {
    setItems((now) => now.map((x) => (x.id === p.id ? p : x)));
    setCommentsOn((c) => (c?.id === p.id ? p : c));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div ref={box} onScroll={(e) => setActive(Math.round(e.currentTarget.scrollTop / Math.max(1, e.currentTarget.clientHeight)))} className="no-bar h-full snap-y snap-mandatory overflow-y-auto overscroll-contain">
        {entries.map((e, i) =>
          e.post ? (
            <Reel key={e.post.id} post={e.post} active={i === active} next={i > active && i <= active + 2} held={!!commentsOn || !!reporting} muted={muted} onMuted={() => setMuted((m) => !m)} onChange={change} onComments={() => setCommentsOn(e.post)} onReport={() => setReporting(e.post)} />
          ) : e.slot?.kind === "ad" ? (
            <Between key={`ad:${e.at}`} label="Sponsored"><SponsoredCard ad={ads[e.slot.ad]} /></Between>
          ) : e.slot?.kind === "event" ? (
            <Between key={`event:${e.slot.event.id}`} label="An event for you"><EventFeedCard e={eventsNow[e.slot.event.id] ?? e.slot.event} onChange={(x) => setEventsNow((m) => ({ ...m, [x.id]: x }))} /></Between>
          ) : e.slot?.kind === "klique" ? (
            <Between key={`klique:${e.slot.klique.id}`} label="A klique for you"><p className="eyebrow mb-2">Klique for you</p><KliqueCard crew={e.slot.klique} wide /></Between>
          ) : null,
        )}
        {loading ? (
          <div className="flex h-full items-center justify-center text-white"><Spinner size={28} /></div>
        ) : !items.length ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-white">
            <p className="text-lg font-semibold">No videos or pictures yet</p>
            <p className="text-sm text-white/70">When communities post them, they show here.</p>
          </div>
        ) : null}
      </div>
      <button type="button" aria-label="Close" onClick={leave} className="absolute top-3 left-3 inline-flex size-11 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70">
        <Icon name="arrow-left" size={21} />
      </button>
      <div className="absolute top-1/2 right-5 hidden -translate-y-1/2 flex-col gap-3 sm:flex">
        <button type="button" aria-label="Previous" disabled={active === 0} onClick={() => go(active - 1)} className="inline-flex size-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 disabled:opacity-30"><Icon name="chevron-up" size={22} /></button>
        <button type="button" aria-label="Next" disabled={active >= entries.length - 1} onClick={() => go(active + 1)} className="inline-flex size-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 disabled:opacity-30"><Icon name="chevron-down" size={22} /></button>
      </div>
      <PostDialog post={commentsOn} onChange={change} onClose={() => setCommentsOn(null)} />
      {reporting && <ReportDialog open onClose={() => setReporting(null)} targetType="feedPost" targetId={reporting.id} subject="this post" />}
    </div>
  );
}
