"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { parseScope, scopeFromPlace, scopeLabel, scopeToString, WORLD, type Scope } from "@/lib/places";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { useAuth } from "./AuthProvider";

const KEY = "klique.where";

interface PlaceCtx {
  /** where the person is looking: everywhere, a continent, a country, a state or a city */
  scope: Scope;
  /** the same thing as the string the API takes, e.g. "country:NG" */
  where: string;
  label: string;
  setScope: (s: Scope) => void;
  /** their own city (or everywhere when signed out): the "back to me" shortcut */
  home: Scope;
}
const Ctx = createContext<PlaceCtx | null>(null);

/**
 * "Where am I looking?" — remembered across visits, and shared by Events, Communities, People and Discover.
 * Starts at the person's own city; they can widen it to a state, a country, a continent or everywhere.
 */
export function PlaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [chosen, setChosen] = useState<Scope | null>(null);

  useEffect(() => {
    try {
      const stored = parseScope(localStorage.getItem(KEY));
      if (stored) setChosen(stored);
    } catch {
      /* ignore */
    }
  }, []);

  const home = useMemo<Scope>(() => (user ? scopeFromPlace(user, "city") : WORLD), [user]);
  const scope = chosen ?? home;

  const setScope = useCallback((s: Scope) => {
    setChosen(s);
    try {
      localStorage.setItem(KEY, scopeToString(s));
    } catch {
      /* ignore */
    }
    // also a cookie, so the server and other tabs/clients can read where the person is looking
    document.cookie = `klique_where=${encodeURIComponent(scopeToString(s))}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, []);

  const value = useMemo(() => ({ scope, where: scopeToString(scope), label: scopeLabel(scope), setScope, home }), [scope, setScope, home]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** What the server renders: it can't know the remembered place or who's signed in, so it shows everywhere. */
const SERVER_SCOPE = { scope: WORLD, label: scopeLabel(WORLD), home: WORLD };

/**
 * The shared place. While a component hydrates it reports what the server rendered (everywhere), so the
 * page's HTML and the browser's first render match; the real place follows straight after. `where` is
 * always the real one (it only drives requests, which start after hydration).
 */
export function usePlace(): PlaceCtx & { ready: boolean } {
  const c = useContext(Ctx);
  const hydrated = useHydrated();
  if (!c) throw new Error("usePlace must be used inside <Providers>");
  return hydrated ? { ...c, ready: true } : { ...c, ...SERVER_SCOPE, ready: false };
}
