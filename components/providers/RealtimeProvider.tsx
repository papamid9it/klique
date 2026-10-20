"use client";

import type { Realtime, RealtimeChannel } from "ably";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CommunityService } from "@/app/services/CommunityService";
import { RealtimeService } from "@/app/services/RealtimeService";
import { useApi } from "@/lib/hooks/useApi";
import type { RealtimeEvent, RealtimeTokenDTO } from "@/lib/types";
import { useAuth } from "./AuthProvider";

type Handler = (e: RealtimeEvent) => void;
interface Ctx {
  /** the live connection is up: screens can poll far less often */
  connected: boolean;
  /** listen for events; returns the unsubscribe function */
  on: (h: Handler) => () => void;
}
const RealtimeCtx = createContext<Ctx>({ connected: false, on: () => () => undefined });

/**
 * One Ably connection for the whole app (signed-in people only). The server sends small pings
 * ("something changed in channel X"); screens listen with `useRealtimeEvent` and refetch through the normal API.
 * If Ably isn't configured, or the connection drops, nothing breaks: screens simply keep polling.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { status, user, refresh } = useAuth();
  const authed = status === "authed" && !!user;
  const handlers = useRef(new Set<Handler>());
  const [connected, setConnected] = useState(false);
  const resync = useRef<(() => Promise<void>) | null>(null);

  const on = useCallback((h: Handler) => {
    handlers.current.add(h);
    return () => {
      handlers.current.delete(h);
    };
  }, []);
  const emit = useCallback((e: RealtimeEvent) => {
    handlers.current.forEach((h) => {
      try {
        h(e);
      } catch {
        /* one listener's bug must not stop the others */
      }
    });
  }, []);

  // communities you belong to decide which channels you may listen on
  const mine = useApi(authed ? () => CommunityService.mine() : null, [authed, user?.id], { key: "my-communities" });
  const membershipKey = (mine.data ?? []).map((c) => c.id).sort().join(",");

  useEffect(() => {
    if (!authed) return;
    let dead = false;
    let client: Realtime | undefined;
    (async () => {
      let first: RealtimeTokenDTO;
      try {
        first = (await RealtimeService.token()).data;
      } catch {
        return; // not configured (503) or offline: stay on polling
      }
      if (!first?.tokenRequest || !Array.isArray(first.channels)) return;
      const { Realtime: RealtimeClient } = await import("ably");
      if (dead) return;
      let wanted = first.channels;
      let pending: RealtimeTokenDTO | null = first;
      const rt = new RealtimeClient({
        authCallback: (_params, cb) => {
          const use = pending;
          pending = null;
          (use ? Promise.resolve(use) : RealtimeService.token().then((r) => r.data)).then(
            (t) => {
              wanted = t.channels;
              cb(null, t.tokenRequest as never);
            },
            (e: Error) => cb(e.message as never, null as never),
          );
        },
      });
      client = rt;
      const subscribed = new Map<string, RealtimeChannel>();
      const sync = () => {
        for (const name of wanted) {
          if (subscribed.has(name)) continue;
          const ch = rt.channels.get(name);
          void ch.subscribe("e", (m) => emit(m.data as RealtimeEvent));
          subscribed.set(name, ch);
        }
        for (const [name, ch] of subscribed) {
          if (wanted.includes(name)) continue;
          ch.unsubscribe();
          rt.channels.release(name);
          subscribed.delete(name);
        }
      };
      sync();
      resync.current = async () => {
        try {
          await rt.auth.authorize(); // asks the server again, so newly joined communities are included
          sync();
        } catch {
          /* keep what we have */
        }
      };
      let wasUp = false;
      rt.connection.on((change) => {
        const up = change.current === "connected";
        setConnected(up);
        if (up && wasUp) emit({ type: "resync" }); // reconnected: catch up on anything missed
        if (up) wasUp = true;
      });
    })();
    return () => {
      dead = true;
      resync.current = null;
      setConnected(false);
      client?.close();
    };
  }, [authed, user?.id, emit]);

  // joined or left a community: refresh what we may listen to
  useEffect(() => {
    void resync.current?.();
  }, [membershipKey]);

  // a new DM: refresh the unread count in the sidebar
  const lastMe = useRef(0);
  useEffect(
    () =>
      on((e) => {
        if (e.type !== "dm" || Date.now() - lastMe.current < 3000) return;
        lastMe.current = Date.now();
        void refresh();
      }),
    [on, refresh],
  );

  const value = useMemo(() => ({ connected, on }), [connected, on]);
  return <RealtimeCtx.Provider value={value}>{children}</RealtimeCtx.Provider>;
}

export const useRealtime = () => useContext(RealtimeCtx);

/**
 * Run `fn` when a matching event arrives. `filter` picks the events you care about; `debounceMs` merges a burst
 * into one call (good for "reload the list"). Also fires on `resync` (the connection came back after a gap).
 */
export function useRealtimeEvent(fn: Handler, opts: { filter?: (e: RealtimeEvent) => boolean; debounceMs?: number } = {}) {
  const { on } = useRealtime();
  const latest = useRef({ fn, filter: opts.filter });
  useEffect(() => {
    latest.current = { fn, filter: opts.filter };
  });
  const debounceMs = opts.debounceMs ?? 0;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = on((e) => {
      const { fn: run, filter } = latest.current;
      if (e.type !== "resync" && filter && !filter(e)) return;
      if (!debounceMs) return run(e);
      clearTimeout(timer);
      timer = setTimeout(() => run(e), debounceMs);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [on, debounceMs]);
}
