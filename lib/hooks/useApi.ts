"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, isApiError } from "@/app/ApiCore";
import type { Envelope } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Keep-what's-on-screen cache                                         */
/* ------------------------------------------------------------------ */

/**
 * Last good result per `key`, so coming back to a view (another channel, back from an event, a second visit)
 * paints at once from memory and refreshes quietly, instead of blanking to a skeleton. Entries belong to the
 * signed-in person: AuthProvider calls setApiCacheScope with their id, and a change of person drops them all.
 */
const cache = new Map<string, unknown>();
const CACHE_MAX = 400;
let cacheScope: string | null = null;

export function setApiCacheScope(scope: string | null) {
  if (scope === cacheScope) return;
  cacheScope = scope;
  cache.clear();
}

function cacheGet<T>(key: string | undefined): T | undefined {
  if (!key || !cache.has(key)) return undefined;
  const v = cache.get(key) as T;
  cache.delete(key); // move to the back: least recently used goes first
  cache.set(key, v);
  return v;
}

function cachePut(key: string | undefined, value: unknown) {
  if (!key) return;
  if (value === null || value === undefined) {
    cache.delete(key);
    return;
  }
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
}

/** Read and write the same cache from hooks that don't go through useApi/usePaged (e.g. chat). */
export const recallApi = cacheGet;
export const rememberApi = cachePut;

/**
 * Every mounted useApi with the same key shows the same thing: when one of them gets new data (a fetch, or a
 * local edit), the others take it too. So the community rail, the realtime listener and the preloader, which
 * all read "my-communities", never disagree.
 */
const listeners = new Map<string, Set<(v: unknown, from: object) => void>>();
function broadcast(key: string | undefined, value: unknown, from: object) {
  if (!key) return;
  listeners.get(key)?.forEach((fn) => fn(value, from));
}

/** Change cached data by key from anywhere, and update every component showing it. */
export function mutateApi<T>(key: string, update: (prev: T) => T) {
  const prev = cache.get(key) as T | undefined;
  if (prev === undefined) return;
  const next = update(prev);
  cachePut(key, next);
  broadcast(key, next, {});
}

export interface CacheOptions {
  /**
   * Identity of this request (include every input that changes the result). With a key, the last result is
   * shown at once on the next mount or when the deps come back to it, and refetched in the background.
   */
  key?: string;
}

export interface ApiState<T> {
  data: T | null;
  /** true only for the first load (no data yet) */
  loading: boolean;
  /** true while refetching with data already on screen */
  refreshing: boolean;
  error: string | null;
  status: number | null;
  reload: () => Promise<void>;
  setData: (next: T | null | ((prev: T | null) => T | null)) => void;
}

/**
 * Fetch-on-mount helper for the service layer. Ignores stale responses, keeps the
 * previous data on screen while refetching, and exposes a friendly error string.
 *   const { data, loading, error, reload } = useApi(() => EventService.get(id), [id]);
 * Pass `null` as the fetcher to skip (e.g. while waiting for a dependency).
 */
export function useApi<T>(fetcher: (() => Promise<Envelope<T>>) | null, deps: unknown[], { key }: CacheOptions = {}): ApiState<T> {
  const cacheKey = fetcher ? key : undefined;
  const [data, setDataRaw] = useState<T | null>(() => cacheGet<T>(cacheKey) ?? null);
  const [loading, setLoading] = useState(fetcher !== null && data === null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const ticket = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const keyRef = useRef(cacheKey);
  keyRef.current = cacheKey;

  // local edits (optimistic updates) go into the cache too, so they survive leaving and coming back,
  // and reach any other component showing the same key
  const self = useRef({});
  const setData = useCallback((next: T | null | ((prev: T | null) => T | null)) => {
    setDataRaw((prev) => {
      const v = typeof next === "function" ? (next as (p: T | null) => T | null)(prev) : next;
      cachePut(keyRef.current, v);
      if (v !== null) queueMicrotask(() => broadcast(keyRef.current, v, self.current));
      return v;
    });
  }, []);
  useEffect(() => {
    if (!cacheKey) return;
    const fn = (v: unknown, from: object) => {
      if (from !== self.current) setDataRaw(v as T);
    };
    let set = listeners.get(cacheKey);
    if (!set) listeners.set(cacheKey, (set = new Set()));
    set.add(fn);
    return () => void set.delete(fn);
  }, [cacheKey]);

  const run = useCallback(async (initial: boolean) => {
    const fn = fetcherRef.current;
    if (!fn) {
      setLoading(false);
      return;
    }
    const mine = ++ticket.current;
    if (initial) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fn();
      if (mine !== ticket.current) return;
      setData(res.data);
      setError(null);
      setStatus(null);
    } catch (e) {
      if (mine !== ticket.current) return;
      setError(errorMessage(e));
      setStatus(isApiError(e) ? e.status : 0);
    } finally {
      if (mine === ticket.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [setData]);

  useEffect(() => {
    const cached = cacheGet<T>(keyRef.current);
    setDataRaw(cached ?? null);
    if (cached !== undefined) setLoading(false);
    setError(null);
    void run(cached === undefined);
    return () => {
      ticket.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const reload = useCallback(() => run(false), [run]);
  return { data, loading, refreshing, error, status, reload, setData };
}

export interface PagedState<T> {
  items: T[];
  /** true only while there is nothing to show yet */
  loading: boolean;
  /** true while refetching with items already on screen */
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  /** refetch page 1 in place; what's on screen stays until the new page arrives */
  reload: () => Promise<void>;
  setItems: (next: T[] | ((prev: T[]) => T[])) => void;
}

type PagedSnapshot<T> = { items: T[]; page: number; hasMore: boolean };

/**
 * Paginated variant: `fetchPage(page)` returns the standard Paginated envelope.
 * `keepPrevious` leaves the old items on screen while new deps load, instead of blanking to a skeleton.
 * `key` remembers the list (see useApi), so coming back to it is instant.
 */
export function usePaged<T>(
  fetchPage: (page: number) => Promise<Envelope<{ items: T[]; page: number; hasMore: boolean }>>,
  deps: unknown[],
  { keepPrevious = false, key }: { keepPrevious?: boolean } & CacheOptions = {},
): PagedState<T> {
  const [initial] = useState(() => cacheGet<PagedSnapshot<T>>(key));
  const [items, setItemsRaw] = useState<T[]>(initial?.items ?? []);
  const [page, setPage] = useState(initial?.page ?? 1);
  const [hasMore, setHasMore] = useState(initial?.hasMore ?? false);
  const [loading, setLoading] = useState(!initial);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ticket = useRef(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const keyRef = useRef(key);
  keyRef.current = key;
  const snap = useRef<PagedSnapshot<T>>({ items: initial?.items ?? [], page: initial?.page ?? 1, hasMore: initial?.hasMore ?? false });
  const remember = useCallback((patch: Partial<PagedSnapshot<T>>) => {
    snap.current = { ...snap.current, ...patch };
    cachePut(keyRef.current, snap.current);
  }, []);

  const setItems = useCallback(
    (next: T[] | ((prev: T[]) => T[])) => {
      setItemsRaw((prev) => {
        const v = typeof next === "function" ? next(prev) : next;
        remember({ items: v });
        return v;
      });
    },
    [remember],
  );

  /** `blank`: nothing worth showing meanwhile, so show the skeleton */
  const first = useCallback(
    async (blank: boolean) => {
      const mine = ++ticket.current;
      if (blank) setLoading(true);
      else setRefreshing(true);
      try {
        const res = await fetchRef.current(1);
        if (mine !== ticket.current) return;
        setItemsRaw(res.data.items);
        setPage(1);
        setHasMore(res.data.hasMore);
        remember({ items: res.data.items, page: 1, hasMore: res.data.hasMore });
        setError(null);
      } catch (e) {
        if (mine !== ticket.current) return;
        setError(errorMessage(e));
      } finally {
        if (mine === ticket.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [remember],
  );

  useEffect(() => {
    const cached = cacheGet<PagedSnapshot<T>>(keyRef.current);
    if (cached) {
      snap.current = cached;
      setItemsRaw(cached.items);
      setPage(cached.page);
      setHasMore(cached.hasMore);
      setLoading(false);
      setError(null);
      void first(false);
    } else {
      snap.current = { items: [], page: 1, hasMore: false };
      if (!keepPrevious) setItemsRaw([]);
      void first(true);
    }
    return () => {
      ticket.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const loadMore = useCallback(async () => {
    const mine = ticket.current;
    setLoadingMore(true);
    try {
      const res = await fetchRef.current(page + 1);
      if (mine !== ticket.current) return;
      setItemsRaw((prev) => {
        const v = [...prev, ...res.data.items];
        remember({ items: v, page: page + 1, hasMore: res.data.hasMore });
        return v;
      });
      setPage(page + 1);
      setHasMore(res.data.hasMore);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }, [page, remember]);

  const reload = useCallback(() => first(false), [first]);
  return { items, loading, refreshing, loadingMore, error, hasMore, loadMore, reload, setItems };
}

/** Debounced copy of a value (for search-as-you-type). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Current time that is only available after mount. Keeps render output identical on
 * server and client (and safe under Cache Components) for anything that depends on "now".
 */
export function useNow(refreshMs = 60_000): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), refreshMs);
    return () => clearInterval(t);
  }, [refreshMs]);
  return now;
}
