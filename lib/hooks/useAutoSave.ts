"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Where a setting that saves by itself is: "saving" (spinner, field locked), "saved" (a check for a moment), or neither. */
export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * One way for every setting that saves the moment you change it (a dropdown, a switch): `run(fn)` locks the field and
 * shows a spinner while `fn` runs, then a short "Saved" check (or nothing on an error: the caller says why). `value`
 * is what was picked, shown straight away instead of jumping back while it saves; it clears once it's saved.
 */
export function useAutoSave<T = unknown>() {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [pending, setPending] = useState<T | undefined>(undefined);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const run = useCallback(async (fn: () => Promise<unknown>, next?: T) => {
    window.clearTimeout(timer.current);
    setPending(next);
    setStatus("saving");
    try {
      await fn();
      setStatus("saved");
      timer.current = window.setTimeout(() => setStatus("idle"), 1600);
      return true;
    } catch {
      setStatus("error");
      timer.current = window.setTimeout(() => setStatus("idle"), 2400);
      return false;
    } finally {
      setPending(undefined);
    }
  }, []);
  return { status, saving: status === "saving", pending, run };
}
