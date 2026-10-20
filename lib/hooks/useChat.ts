"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage, isApiError } from "@/app/ApiCore";
import { ChannelService, type SpaceRef } from "@/app/services/ChannelService";
import { useRealtime } from "@/components/providers/RealtimeProvider";
import { applyReaction, type ReactionKind } from "@/lib/reactions";
import { recallApi, rememberApi } from "./useApi";
import type { ChannelMessageDTO, ReactionDTO, ReplyRefDTO, UserBrief } from "@/lib/types";

const POLL_MS = 4000;
const isReal = (m: ChannelMessageDTO) => !m.pending;

/**
 * Live state for one channel's chat. Messages are kept oldest → newest.
 *  - first load: the newest page
 *  - `loadOlder()`: the page before the oldest message on screen (scroll-up history, no "next" button)
 *  - polling: asks only for messages newer than the newest one we have, every few seconds while the tab is visible
 *  - `send()`: optimistic — the message appears at once and is replaced by the server's copy
 * Nothing here decides who may read or post: the server does, and its refusal is shown as an error.
 */
export function useChat(space: SpaceRef, channelSlug: string, channelId?: string) {
  const { connected, on } = useRealtime();
  const slug = space.slug;
  const sub = space.sub ?? null;
  const ref = useMemo<SpaceRef>(() => ({ slug, sub }), [slug, sub]);
  // the last messages seen in this channel paint at once when you come back; the newest page refreshes behind them
  const cacheKey = `chat:${slug}:${sub ?? ""}:${channelSlug}`;
  const [initial] = useState(() => recallApi<{ items: ChannelMessageDTO[]; hasOlder: boolean }>(cacheKey));
  const [items, setItems] = useState<ChannelMessageDTO[]>(initial?.items ?? []);
  const [hasOlder, setHasOlder] = useState(initial?.hasOlder ?? false);
  const [loading, setLoading] = useState(!initial);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const itemsRef = useRef<ChannelMessageDTO[]>(initial?.items ?? []);
  const busyOlder = useRef(false);
  /** when each message was last reacted to locally: a poll that started earlier must not overwrite it */
  const touched = useRef(new Map<string, number>());
  const ticket = useRef(0);

  const commit = useCallback((next: ChannelMessageDTO[] | ((p: ChannelMessageDTO[]) => ChannelMessageDTO[])) => {
    const value = typeof next === "function" ? next(itemsRef.current) : next;
    itemsRef.current = value;
    setItems(value);
  }, []);
  // keep only the newest stretch: enough to fill the screen on return
  useEffect(() => {
    const real = items.filter(isReal);
    if (!loading && !error) rememberApi(cacheKey, { items: real.slice(-60), hasOlder: hasOlder || real.length > 60 });
  }, [items, hasOlder, loading, error, cacheKey]);

  const load = useCallback(async (quiet = false) => {
    const mine = ++ticket.current;
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const res = await ChannelService.messages(ref, channelSlug);
      if (mine !== ticket.current) return;
      // keep messages still sending; everything else comes from the server's newest page
      commit((prev) => [...res.data.items, ...prev.filter((m) => m.pending)]);
      setHasOlder(res.data.hasMore);
    } catch (e) {
      if (mine !== ticket.current) return;
      setError(errorMessage(e));
      setStatus(isApiError(e) ? e.status : 0);
    } finally {
      if (mine === ticket.current) setLoading(false);
    }
  }, [ref, channelSlug, commit]);

  useEffect(() => {
    const cached = recallApi<{ items: ChannelMessageDTO[]; hasOlder: boolean }>(cacheKey);
    if (cached) {
      commit(cached.items);
      setHasOlder(cached.hasOlder);
      setLoading(false);
      void load(true);
    } else {
      commit([]);
      setHasOlder(false);
      void load();
    }
    return () => {
      ticket.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, commit]);

  const loadOlder = useCallback(async () => {
    const oldest = itemsRef.current.find(isReal);
    if (!oldest || busyOlder.current) return false;
    busyOlder.current = true;
    setLoadingOlder(true);
    const mine = ticket.current;
    try {
      const res = await ChannelService.messages(ref, channelSlug, { before: oldest.id });
      if (mine !== ticket.current) return false;
      const have = new Set(itemsRef.current.map((m) => m.id));
      commit((prev) => [...res.data.items.filter((m) => !have.has(m.id)), ...prev]);
      setHasOlder(res.data.hasMore);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      busyOlder.current = false;
      setLoadingOlder(false);
    }
  }, [ref, channelSlug, commit]);

  // Poll for new messages.
  useEffect(() => {
    if (loading || error) return;
    let stopped = false;
    let running = false;
    let again = false;
    let n = 0;
    async function tick() {
      if (stopped || document.visibilityState !== "visible") return;
      if (running) {
        again = true; // a ping arrived mid-fetch: go round once more so nothing is missed
        return;
      }
      const newest = [...itemsRef.current].reverse().find(isReal);
      if (!newest) return;
      running = true;
      const mine = ticket.current;
      const startedAt = Date.now();
      try {
        const res = await ChannelService.messages(ref, channelSlug, { after: newest.id });
        if (stopped || mine !== ticket.current) return;
        const have = new Set(itemsRef.current.map((m) => m.id));
        const fresh = res.data.items.filter((m) => !have.has(m.id));
        if (fresh.length) commit((prev) => [...prev, ...fresh]);
        // Every few ticks, pick up edits and deletions made by other people in the newest page.
        if (n++ % 3 === 0) {
          const latest = await ChannelService.messages(ref, channelSlug);
          if (stopped || mine !== ticket.current) return;
          const byId = new Map(latest.data.items.map((m) => [m.id, m]));
          commit((prev) =>
            prev.map((m) => {
              const f = byId.get(m.id);
              if (!f || (f.editedAt === m.editedAt && f.deleted === m.deleted && f.pinned === m.pinned)) return m;
              return { ...m, body: f.body, mentions: f.mentions, mentionsMe: f.mentionsMe, editedAt: f.editedAt, deleted: f.deleted, pinned: f.pinned, canEdit: f.canEdit, canDelete: f.canDelete, canPin: f.canPin };
            }),
          );
        }
        // Other people's reactions on messages already on screen (the newest 60).
        const ids = itemsRef.current.filter((m) => isReal(m) && !m.deleted).slice(-60).map((m) => m.id);
        if (ids.length) {
          const rx = await ChannelService.reactions(ref, channelSlug, ids);
          if (stopped || mine !== ticket.current) return;
          commit((prev) =>
            prev.map((m) => {
              const fresh = rx.data[m.id];
              if (!fresh || (touched.current.get(m.id) ?? 0) >= startedAt) return m; // you changed it after this poll began
              return JSON.stringify(fresh) !== JSON.stringify(m.reactions) ? { ...m, reactions: fresh } : m;
            }),
          );
        }
      } catch {
        /* transient: try again on the next tick */
      } finally {
        running = false;
        if (again && !stopped) {
          again = false;
          void tick();
        }
      }
    }
    // With the live connection up, pings trigger the fetch and the timer is only a safety net.
    const off = on((e) => {
      if (e.type === "resync" || (e.type === "channel" && (!channelId || e.channelId === channelId))) {
        n = 0; // also pick up edits, deletions and reactions
        void tick();
      }
    });
    const t = setInterval(tick, connected ? 30_000 : POLL_MS);
    const onVis = () => document.visibilityState === "visible" && void tick();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stopped = true;
      off();
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ref, channelSlug, channelId, loading, error, commit, connected, on]);

  /** Returns an error message on failure (the text is NOT lost: the caller restores it to the composer). */
  const send = useCallback(
    async (input: { body: string; sticker?: string; images?: string[]; replyTo?: ReplyRefDTO | null }, me: UserBrief): Promise<string | null> => {
      const { body, sticker, images = [], replyTo = null } = input;
      const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const temp: ChannelMessageDTO = { id: tempId, channelId: "", body, sticker: sticker ?? null, images, replyTo, pinned: false, canPin: false, reactions: [], deleted: false, createdAt: new Date().toISOString(), author: me, canDelete: false, canEdit: false, editedAt: null, mentions: [], mentionsMe: false, pending: true };
      commit((prev) => [...prev, temp]);
      try {
        const res = await ChannelService.send(ref, channelSlug, { body, sticker, images, replyToId: replyTo?.id });
        commit((prev) => {
          const has = prev.some((m) => m.id === res.data.id); // the poll may have fetched it first
          return has ? prev.filter((m) => m.id !== tempId) : prev.map((m) => (m.id === tempId ? res.data : m));
        });
        return null;
      } catch (e) {
        commit((prev) => prev.filter((m) => m.id !== tempId));
        return errorMessage(e);
      }
    },
    [ref, channelSlug, commit],
  );

  const remove = useCallback(
    async (id: string): Promise<string | null> => {
      try {
        await ChannelService.deleteMessage(ref, channelSlug, id);
        commit((prev) => prev.map((m) => (m.id === id ? { ...m, body: "", images: [], pinned: false, deleted: true, canDelete: false, canEdit: false } : m)));
        return null;
      } catch (e) {
        return errorMessage(e);
      }
    },
    [ref, channelSlug, commit],
  );

  /** Save a new text for one of your messages. Returns an error message on failure (the editor stays open). */
  const edit = useCallback(
    async (id: string, body: string): Promise<string | null> => {
      try {
        const res = await ChannelService.editMessage(ref, channelSlug, id, body);
        // keep reactions as they are on screen; take the new text, mentions and edited time from the server
        commit((prev) => prev.map((m) => (m.id === id ? { ...m, body: res.data.body, mentions: res.data.mentions, mentionsMe: res.data.mentionsMe, editedAt: res.data.editedAt } : m)));
        return null;
      } catch (e) {
        return errorMessage(e);
      }
    },
    [ref, channelSlug, commit],
  );

  /** Pin or unpin a message (owners and admins). Returns an error message on failure. */
  const pin = useCallback(
    async (id: string, pinned: boolean): Promise<string | null> => {
      try {
        const res = await ChannelService.pin(ref, channelSlug, id, pinned);
        commit((prev) => prev.map((m) => (m.id === id ? { ...m, pinned: res.data.pinned } : m)));
        return null;
      } catch (e) {
        return errorMessage(e);
      }
    },
    [ref, channelSlug, commit],
  );

  /** Toggle a reaction. Shown at once, then replaced by the server's counts (rolled back if it fails). */
  const react = useCallback(
    async (id: string, kind: ReactionKind): Promise<string | null> => {
      const before = itemsRef.current.find((m) => m.id === id)?.reactions ?? [];
      touched.current.set(id, Date.now());
      commit((prev) => prev.map((m) => (m.id === id ? { ...m, reactions: applyReaction(m.reactions, kind) } : m)));
      try {
        const res = await ChannelService.react(ref, channelSlug, id, kind);
        touched.current.set(id, Date.now());
        commit((prev) => prev.map((m) => (m.id === id ? { ...m, reactions: res.data } : m)));
        return null;
      } catch (e) {
        commit((prev) => prev.map((m) => (m.id === id ? { ...m, reactions: before } : m)));
        return errorMessage(e);
      }
    },
    [ref, channelSlug, commit],
  );

  const reload = useCallback(() => load(), [load]);
  return { react, edit, pin, items, hasOlder, loading, loadingOlder, error, status, reload, loadOlder, send, remove };
}
