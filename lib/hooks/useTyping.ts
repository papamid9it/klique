"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TypingService } from "@/app/services/TypingService";
import { useRealtime } from "@/components/providers/RealtimeProvider";
import type { TypingTarget } from "@/lib/types";

/** how often a typer says "still typing" */
const PING_MS = 3_000;
/** quiet this long and you've stopped */
const IDLE_MS = 5_000;
/** someone else's last sign of typing counts this long */
const SHOW_MS = 6_000;
/** without a live connection, ask who's typing this often (while the tab is visible) */
const POLL_MS = 3_000;

/**
 * "X is typing…" for one chat. `typed()` on every keystroke (it tells the others at most every few seconds, and
 * that you stopped after a quiet moment); `stopped()` when you send or leave the box. `names`: who else is typing.
 * Live with Ably, otherwise by asking every few seconds. Never you.
 */
export function useTyping(target: TypingTarget | null) {
  const { connected, on } = useRealtime();
  const key = target ? JSON.stringify(target) : "";
  const [where, setWhere] = useState<string | null>(null);
  const [people, setPeople] = useState<Map<string, { name: string; until: number }>>(new Map());
  const lastPing = useRef(0);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typing = useRef(false);
  const t = useRef(target);
  t.current = target;

  const take = useCallback((list: { id: string; name: string }[]) => {
    const until = Date.now() + SHOW_MS;
    setPeople(new Map(list.map((p) => [p.id, { name: p.name, until }])));
  }, []);

  // where this chat's typing lives, and who's typing already
  useEffect(() => {
    setWhere(null);
    setPeople(new Map());
    if (!key) return;
    let live = true;
    TypingService.who(JSON.parse(key) as TypingTarget).then(
      (r) => {
        if (!live) return;
        setWhere(r.data.where);
        take(r.data.typing);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [key, take]);

  // live: someone started or stopped
  useEffect(() => {
    if (!where) return;
    return on((e) => {
      if (e.type !== "typing" || e.where !== where) return;
      setPeople((m) => {
        const next = new Map(m);
        if (e.on) next.set(e.user.id, { name: e.user.name, until: Date.now() + SHOW_MS });
        else next.delete(e.user.id);
        return next;
      });
    });
  }, [where, on]);

  // no live connection: ask every few seconds while the chat is on screen
  useEffect(() => {
    if (!key || connected) return;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      TypingService.who(JSON.parse(key) as TypingTarget).then((r) => take(r.data.typing), () => undefined);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [key, connected, take]);

  // a sign of typing fades on its own (a missed "stopped")
  useEffect(() => {
    if (!people.size) return;
    const id = setInterval(() => {
      setPeople((m) => {
        const now = Date.now();
        const next = new Map([...m].filter(([, p]) => p.until > now));
        return next.size === m.size ? m : next;
      });
    }, 1_000);
    return () => clearInterval(id);
  }, [people.size]);

  const stopped = useCallback(() => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = null;
    if (!typing.current || !t.current) return;
    typing.current = false;
    lastPing.current = 0;
    void TypingService.set(t.current, false).catch(() => undefined);
  }, []);

  const typed = useCallback(() => {
    if (!t.current) return;
    const now = Date.now();
    if (!typing.current || now - lastPing.current > PING_MS) {
      typing.current = true;
      lastPing.current = now;
      void TypingService.set(t.current, true).catch(() => undefined);
    }
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(stopped, IDLE_MS);
  }, [stopped]);

  // leaving the chat stops it
  useEffect(() => stopped, [key, stopped]);

  return { names: [...people.values()].map((p) => p.name), typed, stopped };
}
