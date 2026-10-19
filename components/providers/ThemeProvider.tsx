"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ProfileService } from "@/app/services/ProfileService";
import { DEFAULT_MOOD, isMoodId, type MoodId } from "@/lib/moods";
import { useAuth } from "./AuthProvider";

export const MOOD_STORAGE_KEY = "klique.mood";

/**
 * Runs in <head> before first paint so a returning visitor never sees a flash of the wrong mood.
 * (Kept as a plain string: it must not depend on React or the bundle.)
 */
export const MOOD_BOOT_SCRIPT = `(function(){try{var m=localStorage.getItem("${MOOD_STORAGE_KEY}");if(m&&/^[a-z-]{3,20}$/.test(m))document.documentElement.setAttribute("data-theme",m)}catch(e){}})()`;

function apply(id: MoodId) {
  document.documentElement.setAttribute("data-theme", id);
}
function remember(id: MoodId) {
  try {
    localStorage.setItem(MOOD_STORAGE_KEY, id);
  } catch {
    /* private mode / storage blocked — the mood still applies for this session */
  }
}

interface ThemeCtx {
  mood: MoodId;
  setMood: (id: MoodId) => void;
}
const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const [mood, setMoodState] = useState<MoodId>(DEFAULT_MOOD);

  // Pick up the stored mood after hydration (the boot script already painted it).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(MOOD_STORAGE_KEY);
      if (isMoodId(stored)) setMoodState(stored);
    } catch {
      /* ignore */
    }
  }, []);

  // For a signed-in person, their saved mood wins on any device.
  useEffect(() => {
    if (status === "authed" && user && isMoodId(user.mood)) {
      setMoodState(user.mood);
      apply(user.mood);
      remember(user.mood);
    }
  }, [status, user]);

  const setMood = useCallback(
    (id: MoodId) => {
      setMoodState(id); // instant
      apply(id);
      remember(id);
      if (status === "authed") void ProfileService.updateMe({ mood: id }).catch(() => {}); // best-effort sync
    },
    [status],
  );

  const value = useMemo(() => ({ mood, setMood }), [mood, setMood]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMood() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMood must be used inside <Providers>");
  return c;
}
