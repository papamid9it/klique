"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { parseScope, scopeFromPlace, scopeLabel, scopeToString, WORLD, type Scope } from "@/lib/places";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { useAuth } from "./AuthProvider";

const KEY = "klique.where";
/** Their own city as of the last visit, so a refresh knows where to look without waiting for the account to load. */
const HOME_KEY = "klique.home";

interface PlaceCtx {
  /** where the person is looking: everywhere, a continent, a country, a state or a city */
  scope: Scope;
  /** the same thing as the string the API takes, e.g. "country:NG" */
  where: string;
  label: string;
  setScope: (s: Scope) => void;
  /** their own city (or everywhere when signed out): the "back to me" shortcut */
  home: Scope;
  /** the place is known. Until then show no place and ask for nothing, or everywhere's results flash up first. */
  ready: boolean;
}
const Ctx = createContext<PlaceCtx | null>(null);

/**
 * "Where am I looking?" — remembered across visits, and shared by Events, Communities, People and Discover.
 * Starts at the person's own city; they can widen it to a state, a country, a continent or everywhere.
 */
export function PlaceProvider({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const [chosen, setChosen] = useState<Scope | null>(null);
  const [lastHome, setLastHome] = useState<Scope | null>(null);
  const [read, setRead] = useState(false);

  useEffect(() => {
    try {
      setChosen(parseScope(localStorage.getItem(KEY)));
      setLastHome(parseScope(localStorage.getItem(HOME_KEY)));
    } catch {
      /* ignore */
    }
    setRead(true);
  }, []);

  const home = useMemo<Scope>(() => (user ? scopeFromPlace(user, "city") : status === "loading" && lastHome ? lastHome : WORLD), [user, status, lastHome]);
  const scope = chosen ?? home;
  const ready = read && (!!chosen || !!lastHome || status !== "loading");

  useEffect(() => {
    if (status === "loading") return;
    try {
      if (user) localStorage.setItem(HOME_KEY, scopeToString(scopeFromPlace(user, "city")));
      else localStorage.removeItem(HOME_KEY);
    } catch {
      /* ignore */
    }
  }, [user, status]);

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

  const value = useMemo(() => ({ scope, where: scopeToString(scope), label: scopeLabel(scope), setScope, home, ready }), [scope, setScope, home, ready]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** What the server renders: it can't know the remembered place or who's signed in. */
const SERVER_SCOPE = { scope: WORLD, label: scopeLabel(WORLD), home: WORLD, ready: false };

/**
 * The shared place. While a component hydrates it reports what the server rendered, so the page's HTML and the
 * browser's first render match. Check `ready` before showing the place or asking the server for anything by it.
 */
export function usePlace(): PlaceCtx {
  const c = useContext(Ctx);
  const hydrated = useHydrated();
  if (!c) throw new Error("usePlace must be used inside <Providers>");
  return hydrated ? c : { ...c, ...SERVER_SCOPE };
}
