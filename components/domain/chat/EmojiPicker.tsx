"use client";

import { useEffect, useRef } from "react";
import ApiClient from "@/app/ApiCore";
import { Skeleton } from "@/components/ui/Skeleton";
import { cdn } from "@/lib/cdn";
import { useApi } from "@/lib/hooks/useApi";
import { cx } from "@/components/ui/cx";
import type { Envelope } from "@/lib/types";

const api = new ApiClient();
type Group = { community: { slug: string; name: string }; items: { id: string; name: string; url: string; animated: boolean }[]; usable: boolean };

/**
 * Custom emoji to put in a message: this community's first, then (for Pro members) every other community's they're
 * in. Picking one adds `:name:` (this community's) or the emoji's token (another community's) at the cursor.
 */
export function EmojiPicker({ community, onPick, onClose, className }: { community?: string; onPick: (text: string) => void; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { data, loading } = useApi(() => api.get<Envelope<{ groups: Group[]; pro: boolean }>>(`/api/me/emoji${community ? `?community=${encodeURIComponent(community)}` : ""}`), [community], { key: `emoji-picker:${community ?? ""}` });
  useEffect(() => {
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);
  return (
    <div ref={ref} role="dialog" aria-label="Custom emoji" className={cx("z-30 w-[19rem] max-w-[calc(100vw-2rem)] rounded-card border border-line bg-surface p-3 shadow-xl", className)}>
      {loading && !data ? (
        <Skeleton className="h-32" />
      ) : !data?.groups.length ? (
        <p className="p-2 text-sm text-ink-muted">No custom emoji yet. A community&apos;s owner can add some in its settings → Emoji.</p>
      ) : (
        <div className="max-h-72 space-y-3 overflow-y-auto">
          {data.groups.map((g) => (
            <section key={g.community.slug}>
              <h3 className="mb-1 text-[11px] font-bold tracking-[0.06em] text-ink-muted uppercase">{g.community.name}</h3>
              <div className={cx("grid grid-cols-7 gap-1", !g.usable && "opacity-40")}>
                {g.items.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    disabled={!g.usable}
                    title={g.usable ? `:${e.name}:` : `:${e.name}: (Pro lets you use other communities' emoji)`}
                    onClick={() => onPick(g.community.slug === community ? `:${e.name}:` : `<:${e.name}:${e.id}>`)}
                    className="inline-flex size-9 items-center justify-center rounded-control hover:bg-raised disabled:cursor-not-allowed"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img loading="lazy" src={e.animated ? e.url : cdn(e.url, { w: 64 })} alt={`:${e.name}:`} className="size-7 object-contain" />
                  </button>
                ))}
              </div>
            </section>
          ))}
          {!data.pro && data.groups.some((g) => !g.usable) && <p className="text-xs text-ink-muted">With Pro you can use emoji from all your communities, anywhere.</p>}
        </div>
      )}
    </div>
  );
}
