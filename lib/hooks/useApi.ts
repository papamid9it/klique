"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, isApiError } from "@/app/ApiCore";
import type { Envelope } from "@/lib/types";

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
export function useApi<T>(fetcher: (() => Promise<Envelope<T>>) | null, deps: unknown[]): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(fetcher !== null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const ticket = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

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
  }, []);

  useEffect(() => {
    setData(null);
    setError(null);
    void run(true);
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
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  reload: () => Promise<void>;
  setItems: (next: T[] | ((prev: T[]) => T[])) => void;
}

/**
 * Paginated variant: `fetchPage(page)` returns the standard Paginated envelope.
 * `keepPrevious` leaves the old items on screen while new deps load, instead of blanking to a skeleton.
 */
export function usePaged<T>(
  fetchPage: (page: number) => Promise<Envelope<{ items: T[]; page: number; hasMore: boolean }>>,
  deps: unknown[],
  { keepPrevious = false }: { keepPrevious?: boolean } = {},
): PagedState<T> {
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ticket = useRef(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const first = useCallback(async () => {
    const mine = ++ticket.current;
    setLoading(true);
    try {
      const res = await fetchRef.current(1);
      if (mine !== ticket.current) return;
      setItems(res.data.items);
      setPage(1);
      setHasMore(res.data.hasMore);
      setError(null);
    } catch (e) {
      if (mine !== ticket.current) return;
      setError(errorMessage(e));
    } finally {
      if (mine === ticket.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!keepPrevious) setItems([]);
    void first();
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
      setItems((prev) => [...prev, ...res.data.items]);
      setPage(page + 1);
      setHasMore(res.data.hasMore);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }, [page]);

  return { items, loading, loadingMore, error, hasMore, loadMore, reload: first, setItems };
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
