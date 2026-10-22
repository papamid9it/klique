"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { errorMessage } from "@/app/ApiCore";
import { StickerService } from "@/app/services/StickerService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { cdn } from "@/lib/cdn";
import type { SavedStickerDTO } from "@/lib/types";

/** The tray as a sticker thumbnail is drawn (the stored small copy, so the tray loads fast). */
export const stickerThumb = (url: string) => cdn(url, { w: 160 });

/**
 * Your saved stickers. The list lives on your account (so web, phone and desktop share it) and is cached on this
 * device, so the tray opens instantly and works on a flaky connection; the server's copy replaces it as soon as it
 * arrives, and live pings keep other devices in step.
 */
type State = { userId: string | null; list: SavedStickerDTO[]; loaded: boolean };
let state: State = { userId: null, list: [], loaded: false };
const subs = new Set<() => void>();
const KEY = (id: string) => `kq:stickers:${id}`;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  if (state.userId && next.list) {
    try {
      localStorage.setItem(KEY(state.userId), JSON.stringify(state.list));
    } catch {
      /* private mode: just no device cache */
    }
  }
  subs.forEach((f) => f());
}

/** warm the browser's image cache so the tray paints at once */
function warm(list: SavedStickerDTO[]) {
  if (typeof Image === "undefined") return;
  for (const s of list.slice(0, 40)) new Image().src = stickerThumb(s.url);
}

let inflight: Promise<void> | null = null;
function fetchList() {
  if (inflight) return inflight;
  const forUser = state.userId;
  inflight = StickerService.list()
    .then((r) => {
      if (state.userId !== forUser) return;
      set({ list: r.data, loaded: true });
      warm(r.data);
    })
    .catch(() => undefined)
    .finally(() => (inflight = null));
  return inflight;
}

function switchUser(id: string | null) {
  if (state.userId === id) return;
  let cached: SavedStickerDTO[] = [];
  if (id) {
    try {
      cached = (JSON.parse(localStorage.getItem(KEY(id)) ?? "[]") as SavedStickerDTO[]).map((x) => ({ ...x, uses: x.uses ?? 0, lastUsedAt: x.lastUsedAt ?? null }));
    } catch {
      cached = [];
    }
  }
  state = { userId: id, list: Array.isArray(cached) ? cached : [], loaded: false };
  subs.forEach((f) => f());
  if (id) void fetchList();
}

const MOST_USED = 8;
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));
const EMPTY: State = { userId: null, list: [], loaded: false };

export function useStickers() {
  const { user } = useAuth();
  const s = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  useEffect(() => switchUser(user?.id ?? null), [user?.id]);
  useRealtimeEvent(() => void fetchList(), { filter: (e) => e.type === "stickers", debounceMs: 300 });

  /** run a change optimistically, then take the server's tray; returns an error message on failure */
  const change = useCallback(async (optimistic: SavedStickerDTO[] | null, call: () => Promise<{ data: SavedStickerDTO[] }>): Promise<string | null> => {
    const before = state.list;
    if (optimistic) set({ list: optimistic });
    try {
      const r = await call();
      set({ list: r.data, loaded: true });
      return null;
    } catch (e) {
      set({ list: before });
      return errorMessage(e);
    }
  }, []);

  /** the stickers you send most (up to 8), most recent breaking ties */
  const mostUsed = [...s.list]
    .filter((x) => x.uses > 0)
    .sort((a, b) => b.uses - a.uses || (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? ""))
    .slice(0, MOST_USED);
  const base = (u: string) => u.split("#")[0].replace(/_sm\.(webp|jpe?g)$/i, ".$1");
  return {
    list: s.list,
    mostUsed,
    loaded: s.loaded,
    /** you just sent this one: count it here straight away (the server counts it for your other devices) */
    bump: (url: string) => set({ list: state.list.map((x) => (x.url === base(url) ? { ...x, uses: x.uses + 1, lastUsedAt: new Date().toISOString() } : x)) }),
    has: (url: string) => s.list.some((x) => x.url === base(url)),
    save: (url: string) => change([{ id: `tmp-${Date.now()}`, url: base(url), uses: 0, lastUsedAt: null }, ...state.list.filter((x) => x.url !== base(url))], () => StickerService.save(url)),
    remove: (id: string) => change(state.list.filter((x) => x.id !== id), () => StickerService.remove(id)),
    reorder: (ids: string[]) => {
      const byId = new Map(state.list.map((x) => [x.id, x]));
      const next = ids.flatMap((i) => byId.get(i) ?? []);
      return change(next, () => StickerService.reorder(ids));
    },
    refresh: fetchList,
  };
}
