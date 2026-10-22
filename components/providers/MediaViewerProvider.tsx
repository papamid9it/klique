"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { MediaViewer, type ViewerItem } from "@/components/ui/MediaViewer";
import { useStickers } from "@/lib/hooks/useStickers";
import { useAuth } from "./AuthProvider";
import { useToast } from "./ToastProvider";

type Open = (items: (ViewerItem | string)[], start?: number) => void;
const Ctx = createContext<Open>(() => {});

/** Open pictures and videos fullscreen from anywhere: `useMediaViewer()(urls, index)`. */
export const useMediaViewer = () => useContext(Ctx);

export function MediaViewerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<{ items: ViewerItem[]; start: number } | null>(null);
  const { user } = useAuth();
  const stickers = useStickers();
  const toast = useToast();

  const show = useCallback<Open>((items, start = 0) => {
    const list = items.map((x) => (typeof x === "string" ? { kind: /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(x) ? ("video" as const) : ("image" as const), url: x } : x)).filter((x) => !!x.url);
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
          actions={(item) =>
            user && item.kind === "image"
              ? [
                  {
                    label: stickers.has(item.url) ? "Saved" : "Save as sticker",
                    icon: "sticker",
                    done: stickers.has(item.url),
                    onSelect: (it) => void stickers.save(it.url).then((err) => toast(err ?? "Saved to your stickers.", err ? "error" : "success")),
                  },
                ]
              : []
          }
        />
      )}
    </Ctx.Provider>
  );
}
