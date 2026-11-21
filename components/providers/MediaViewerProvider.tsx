"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { MediaViewer, type ViewerItem } from "@/components/ui/MediaViewer";

/** `mine`: the viewer's own uploads (they can download them); off by default */
type Open = (items: (ViewerItem | string)[], start?: number, opts?: { mine?: boolean }) => void;
const Ctx = createContext<Open>(() => {});

/** Open pictures and videos fullscreen from anywhere: `useMediaViewer()(urls, index)`. */
export const useMediaViewer = () => useContext(Ctx);

export function MediaViewerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<{ items: ViewerItem[]; start: number } | null>(null);

  const show = useCallback<Open>((items, start = 0, opts) => {
    const list = items
      .map((x) => (typeof x === "string" ? { kind: /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(x) ? ("video" as const) : ("image" as const), url: x } : x))
      .map((x) => ({ ...x, mine: x.mine ?? !!opts?.mine }))
      .filter((x) => !!x.url);
    if (list.length) setOpen({ items: list, start });
  }, []);
  const close = useCallback(() => setOpen(null), []);

  return (
    <Ctx.Provider value={useMemo(() => show, [show])}>
      {children}
      {open && (
        <MediaViewer
          items={open.items}
          start={open.start}
          onClose={close}
          // stickers come from GIPHY now: a picture can't be turned into one
          actions={() => []}
        />
      )}
    </Ctx.Provider>
  );
}
