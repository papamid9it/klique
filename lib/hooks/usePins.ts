"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/** "Pin to top" for a list of things with ids, remembered in this browser. Read after mounting, so the first paint matches the server. */
export function usePins(name: string) {
  const key = `klique.pins.${name}`;
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      setIds(JSON.parse(localStorage.getItem(key) ?? "[]") as string[]);
    } catch {
      /* private window, or a damaged value: nothing is pinned */
    }
  }, [key]);

  const toggle = useCallback(
    (id: string) =>
      setIds((prev) => {
        const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev];
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* still pinned until the page closes */
        }
        return next;
      }),
    [key],
  );

  return useMemo(
    () => ({
      has: (id: string) => ids.includes(id),
      toggle,
      /** the same list, pinned ones first (newest pin on top), everything else in its own order */
      first: <T extends { id: string }>(list: T[]) => (ids.length ? [...list].sort((a, b) => (ids.includes(a.id) ? ids.indexOf(a.id) : Infinity) - (ids.includes(b.id) ? ids.indexOf(b.id) : Infinity)) : list),
    }),
    [ids, toggle],
  );
}
