"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ProfileService } from "@/app/services/ProfileService";
import { DEFAULT_PREF, isMoodPref, resolveMood, type MoodId, type MoodPref } from "@/lib/moods";
import { useAuth } from "./AuthProvider";

export const MOOD_STORAGE_KEY = "klique.mood";
// Monochrome and then Paper Mono were once saved for everyone as the default, chosen or not: a saved mood only counts
// with this marker (set when someone picks one, or when their account has one picked)
export const MOOD_PICKED_KEY = "klique.mood.picked";

/**
 * Runs in <head> before first paint, so nobody sees a flash of the wrong mood. No choice saved (or "system"):
 * Paper Mono, or Monochrome when the device is in dark mode. (A plain string: no React, no bundle.)
 */
export const MOOD_BOOT_SCRIPT = `(function(){try{var m=localStorage.getItem("${MOOD_STORAGE_KEY}");if(m!=="system"&&!localStorage.getItem("${MOOD_PICKED_KEY}"))m=null;if(!m||m==="system"){m=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"monochrome":"paper-mono"}if(/^[a-z-]{3,20}$/.test(m))document.documentElement.setAttribute("data-theme",m)}catch(e){}})()`;

const darkQuery = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null);

function apply(id: MoodId) {
  document.documentElement.setAttribute("data-theme", id);
  // the browser's own bars (address bar on phones) follow along
  const colour = getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim() || (id === "monochrome" ? "#0a0a0a" : "#f6f6f6");
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute("content", colour));
}
function remember(pref: MoodPref) {
  try {
    localStorage.setItem(MOOD_STORAGE_KEY, pref);
    if (pref === "system") localStorage.removeItem(MOOD_PICKED_KEY);
    else localStorage.setItem(MOOD_PICKED_KEY, "1");
  } catch {
    /* private mode / storage blocked: it still applies for this visit */
  }
}

interface ThemeCtx {
  /** what they chose: a mood, or "system" (match the device) */
  mood: MoodPref;
  /** the mood actually showing */
  shown: MoodId;
  setMood: (pref: MoodPref) => void;
}
const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const [pref, setPref] = useState<MoodPref>(DEFAULT_PREF);
  const [dark, setDark] = useState(false);

  // the stored choice (the boot script already painted it), and the device's light / dark setting, live
  useEffect(() => {
    try {
      const stored = localStorage.getItem(MOOD_STORAGE_KEY);
      if (isMoodPref(stored) && (stored === "system" || localStorage.getItem(MOOD_PICKED_KEY))) setPref(stored);
    } catch {
      /* ignore */
    }
    const q = darkQuery();
    if (!q) return;
    setDark(q.matches);
    const on = () => setDark(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);

  // signed in: their saved choice wins, on any device
  useEffect(() => {
    if (status === "authed" && user && isMoodPref(user.mood)) {
      setPref(user.mood);
      remember(user.mood);
    }
  }, [status, user]);

  const shown = resolveMood(pref, dark);
  useEffect(() => {
    apply(shown);
  }, [shown]);

  const setMood = useCallback(
    (next: MoodPref) => {
      setPref(next); // instant
      remember(next);
      if (status === "authed") void ProfileService.updateMe({ mood: next }).catch(() => {}); // best-effort sync
    },
    [status],
  );

  const value = useMemo(() => ({ mood: pref, shown, setMood }), [pref, shown, setMood]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMood() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMood must be used inside <Providers>");
  return c;
}
