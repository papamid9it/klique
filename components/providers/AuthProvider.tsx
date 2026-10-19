"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isApiError } from "@/app/ApiCore";
import { AuthService } from "@/app/services/AuthService";
import { ProfileService } from "@/app/services/ProfileService";
import type { UserMe } from "@/lib/types";

type Status = "loading" | "authed" | "anon";

interface AuthCtx {
  user: UserMe | null;
  status: Status;
  /** Call after a successful login / signup. */
  setSession: (user: UserMe) => void;
  /** Patch the cached user (after editing a profile, etc.). */
  setUser: (user: UserMe) => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  /** For actions that need an account: returns true when signed in, otherwise sends them to /login and returns false. */
  requireAuth: () => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUserState] = useState<UserMe | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const lastRun = useRef(0);
  const refresh = useCallback(async () => {
    lastRun.current = Date.now();
    try {
      const res = await ProfileService.me();
      setUserState(res.data);
      setStatus("authed");
    } catch (e) {
      // 401 = signed out. Anything else (offline, DB down) shouldn't kick a signed-in user out of the UI.
      if (isApiError(e) && e.status === 401) {
        setUserState(null);
        setStatus("anon");
      } else {
        setStatus((s) => (s === "loading" ? "anon" : s));
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Keep the unread-message badge fresh.
  useEffect(() => {
    if (status !== "authed") return;
    // at most every few minutes, and coming back to the tab only counts after a minute away
    const tick = () => document.visibilityState === "visible" && Date.now() - lastRun.current > 60_000 && void refresh();
    const t = setInterval(tick, 180_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [status, refresh]);

  const setSession = useCallback((u: UserMe) => {
    setUserState(u);
    setStatus("authed");
  }, []);

  const signOut = useCallback(async () => {
    try {
      await AuthService.logout();
    } finally {
      setUserState(null);
      setStatus("anon");
      router.push("/");
    }
  }, [router]);

  const requireAuth = useCallback(() => {
    if (status === "authed") return true;
    const next = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
    router.push(`/login?next=${encodeURIComponent(next)}`);
    return false;
  }, [status, router]);

  const value = useMemo<AuthCtx>(
    () => ({ user, status, setSession, setUser: setUserState, signOut, refresh, requireAuth }),
    [user, status, setSession, signOut, refresh, requireAuth],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside <Providers>");
  return c;
}
