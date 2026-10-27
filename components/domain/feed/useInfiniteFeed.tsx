"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { recallApi, rememberApi } from "@/lib/hooks/useApi";

/** One page from the server. `at`: when page 1 was made, sent back for later pages so they line up. */
export interface FeedPage<T> {
  items: T[];
  hasMore: boolean;
  at?: number;
}

interface FeedState<T> {
  items: T[];
  page: number;
  hasMore: boolean;
  at?: number;
  loadedAt: number;
}

/** Where each feed was scrolled to, and when Back was last pressed: coming back with Back lands where you were. */
const leftAt = new Map<string, number>();
/**
 * The address of the last page opened with a link. When the page showing isn't it, we got here with Back or
 * Forward (which, unlike a link, can render the page before the browser even says so).
 */
let pushedTo: string | null = null;
const here = () => location.pathname + location.search;
if (typeof window !== "undefined") {
  const push = history.pushState.bind(history);
  history.pushState = (...args: Parameters<History["pushState"]>) => {
    const url = args[2];
    if (url != null) {
      const u = new URL(String(url), location.href);
      pushedTo = u.pathname + u.search;
    }
    return push(...args);
  };
}
const cameBack = () => pushedTo !== null && pushedTo !== here();
/** A feed older than this starts over from the top on the next visit (unless you came back with Back). */
const STALE_MS = 10 * 60_000;

/** The element that scrolls `el`: a panel with its own scrollbar (a community), or the page. */
function scrollerOf(el: HTMLElement | null): HTMLElement | Window {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if (y === "auto" || y === "scroll") return p;
  }
  return window;
}
const topOf = (s: HTMLElement | Window) => (s instanceof Window ? s.scrollY : s.scrollTop);

/**
 * An endless list of posts: the first page, the next as the bottom comes near (`sentinel`), posts already shown
 * skipped when a page repeats them. What's loaded is kept under `key`, so Back returns to the same spot (`anchor`
 * goes on the list, to find what scrolls it) with nothing fetched again.
 */
export function useInfiniteFeed<T>(key: string, fetchPage: (page: number, at?: number) => Promise<FeedPage<T>>, idOf: (t: T) => string, enabled = true) {
  const [feed, setFeedRaw] = useState<FeedState<T> | null>(() => recallApi<FeedState<T>>(key) ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const feedRef = useRef(feed);
  const loading = useRef(false);
  const cached = useRef(feed !== null);
  const sentinel = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLElement>(null);
  const fetchRef = useRef(fetchPage);
  const idRef = useRef(idOf);
  useEffect(() => {
    fetchRef.current = fetchPage;
    idRef.current = idOf;
  });

  const setFeed = useCallback(
    (update: (f: FeedState<T> | null) => FeedState<T> | null) => {
      setFeedRaw((prev) => {
        const next = update(prev);
        rememberApi(key, next);
        return next;
      });
    },
    [key],
  );
  useEffect(() => {
    feedRef.current = feed;
  }, [feed]);

  /** The first page (starting over), or the next one. */
  const load = useCallback(
    async (fresh: boolean) => {
      if (loading.current) return;
      loading.current = true;
      setBusy(true);
      setError(null);
      try {
        const cur = fresh ? null : feedRef.current;
        const res = await fetchRef.current(cur ? cur.page + 1 : 1, cur?.at);
        setFeed((f) => {
          const base = fresh ? null : f;
          const seen = new Set(base?.items.map((x) => idRef.current(x)));
          const added = res.items.filter((x) => !seen.has(idRef.current(x)) && !!seen.add(idRef.current(x)));
          return { items: [...(base?.items ?? []), ...added], page: (cur?.page ?? 0) + 1, hasMore: res.hasMore, at: res.at ?? base?.at, loadedAt: base?.loadedAt ?? Date.now() };
        });
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        loading.current = false;
        setBusy(false);
      }
    },
    [setFeed],
  );

  // first page, or a fresh start when what's kept is old (not when coming back with Back)
  useEffect(() => {
    if (!enabled) return;
    const kept = feedRef.current;
    if (!kept || (!cameBack() && Date.now() - kept.loadedAt > STALE_MS)) void load(true);
  }, [enabled, load]);

  // back to where you were (once), and remember where you are; the list may only appear after the first page
  const shown = feed !== null;
  useLayoutEffect(() => {
    if (!shown) return;
    const s = scrollerOf(anchor.current);
    const y = leftAt.get(key);
    if (cached.current && y && cameBack()) {
      cached.current = false;
      s.scrollTo(0, y);
      requestAnimationFrame(() => s.scrollTo(0, y));
    }
    // while leaving, the list can be swapped out first and the panel jump to the top: that's not a place to keep
    const onScroll = () => {
      const a = anchor.current;
      if (a?.isConnected && a.offsetHeight > 0) leftAt.set(key, topOf(s));
    };
    s.addEventListener("scroll", onScroll, { passive: true });
    return () => s.removeEventListener("scroll", onScroll);
  }, [key, shown]);

  // the next page when the bottom comes near
  const hasMore = !!feed?.hasMore;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || busy || error) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && void load(false), { rootMargin: "900px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [feed, hasMore, busy, error, load]);

  const setItems = useCallback((update: (items: T[]) => T[]) => setFeed((f) => (f ? { ...f, items: update(f.items) } : f)), [setFeed]);

  return { items: feed?.items ?? null, hasMore, busy, error, load, setItems, sentinel, anchor };
}

function PostSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-3 rounded-card border border-line bg-surface p-4">
      <div className="flex items-center gap-2.5">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="h-3 w-40" />
      </div>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
    </div>
  );
}

/** Under an endless list: a skeleton post while the next page comes, a retry on failure, "all caught up" at the end. */
export function FeedFooter({ hasMore, error, onRetry, sentinel, end }: { hasMore: boolean; error: string | null; onRetry: () => void; sentinel: React.RefObject<HTMLDivElement | null>; end: React.ReactNode }) {
  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <p className="text-sm text-danger">{error}</p>
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }
  if (hasMore) {
    return (
      <div ref={sentinel} role="status" aria-label="Loading more posts">
        <PostSkeleton />
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1.5 py-6 text-center">
      <span className="inline-flex size-10 items-center justify-center rounded-full bg-raised text-accent-text">
        <Icon name="check" size={18} />
      </span>
      <p className="text-[14px] font-semibold">You&apos;re all caught up</p>
      <p className="text-[13px] text-ink-muted">{end}</p>
    </div>
  );
}

/** "Find more communities", for the end of a feed. */
export function FindMore() {
  return (
    <Link href="/communities" className="font-semibold text-accent-text hover:underline">
      Find more communities
    </Link>
  );
}
