"use client";

import { useHydrated } from "@/lib/hooks/useHydrated";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isApiError } from "@/app/ApiCore";
import { AuthService } from "@/app/services/AuthService";
import { NotificationService } from "@/app/services/NotificationService";
import { ProfileService } from "@/app/services/ProfileService";
import type { UserMe } from "@/lib/types";
import { setApiCacheScope } from "@/lib/hooks/useApi";
import { SignInPrompt } from "@/components/domain/SignInPrompt";

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
  /**
   * For actions that need an account: returns true when signed in. Otherwise it asks them to log in or sign up (a
   * pop-up that brings them back here after) and returns false; `redirect`: straight to /login instead (pages that
   * only make sense signed in).
   */
  requireAuth: (opts?: { redirect?: boolean }) => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUserState] = useState<UserMe | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  // remembered API results belong to whoever is signed in; a different person starts with none
  setApiCacheScope(user?.id ?? null);

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

  // Browsers rotate notification subscriptions now and then; tell the server about this one once per visit.
  useEffect(() => {
    if (status === "authed") void NotificationService.refresh();
  }, [status]);

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

  // where the "log in or sign up" pop-up sends them back to (null: closed)
  const [asking, setAsking] = useState<string | null>(null);
  const requireAuth = useCallback(
    (opts?: { redirect?: boolean }) => {
      if (status === "authed") return true;
      const next = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
      if (opts?.redirect) router.push(`/login?next=${encodeURIComponent(next)}`);
      else setAsking(next);
      return false;
    },
    [status, router],
  );

  const value = useMemo<AuthCtx>(
    () => ({ user, status, setSession, setUser: setUserState, signOut, refresh, requireAuth }),
    [user, status, setSession, signOut, refresh, requireAuth],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      <SignInPrompt next={asking} onClose={() => setAsking(null)} />
    </Ctx.Provider>
  );
}

/**
 * Who's signed in. While a component hydrates it sees what the server rendered ("loading", nobody), even if
 * the sign-in check already came back, so a part of the page that hydrates late (inside Suspense) matches its
 * HTML; the real answer follows straight after. Actions (requireAuth, signOut…) always work on the real state.
 */
export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  const hydrated = useHydrated();
  if (!c) throw new Error("useAuth must be used inside <Providers>");
  return hydrated ? c : { ...c, user: null, status: "loading" };
}
