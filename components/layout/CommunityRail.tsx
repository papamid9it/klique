"use client";

import Link from "next/link";
import { useEffect } from "react";
import { CommunityService } from "@/app/services/CommunityService";
import { useAuth } from "@/components/providers/AuthProvider";
import { Cover } from "@/components/ui/Cover";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { useRealtime, useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { useApi } from "@/lib/hooks/useApi";
import type { MyCommunityDTO } from "@/lib/types";

/**
 * Your communities, one tile each, so you can hop between them without going back to a list.
 * Shows an unread dot and an @mention count; the active one gets a marker on its left edge.
 * `horizontal` is the compact strip used inside the mobile drawer.
 */
export function CommunityRail({ activeSlug, horizontal, onNavigate }: { activeSlug: string | null; horizontal?: boolean; onNavigate?: () => void }) {
  const { status, user } = useAuth();
  const authed = status === "authed";
  const { data, loading, reload } = useApi(authed ? () => CommunityService.mine() : null, [authed, user?.id]);

  const { connected } = useRealtime();
  useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => document.visibilityState === "visible" && void reload(), connected ? 180_000 : 60_000);
    return () => clearInterval(t);
  }, [authed, reload, connected]);
  // activity in any of your communities: refresh the unread dots
  useRealtimeEvent(() => void reload(), { filter: (e) => e.type === "channel", debounceMs: 1500 });

  if (status === "loading" || (authed && loading && !data)) {
    // Same tile + label shape as the real thing, so nothing jumps when it loads.
    return (
      <nav aria-label="Your communities" aria-busy="true" className={horizontal ? "border-b border-line px-3 py-3" : "w-full"}>
        <ul className={horizontal ? "flex gap-2 overflow-hidden" : "flex w-full flex-col items-center gap-2.5"}>
          {[0, 1, 2].map((i) => (
            <li key={i} className={cx("flex flex-col items-center gap-1", horizontal ? "w-14 shrink-0" : "w-full")}>
              <span className={cx("skeleton block rounded-full", horizontal ? "size-11" : "size-14")} aria-hidden="true" />
              {horizontal && <span className="skeleton block h-2 w-10 rounded" aria-hidden="true" />}
            </li>
          ))}
          <li className={cx("flex justify-center", horizontal ? "shrink-0 self-start" : "w-full")}>
            <span className={cx("skeleton block rounded-full", horizontal ? "size-11" : "size-14")} aria-hidden="true" />
          </li>
        </ul>
      </nav>
    );
  }
  if (!authed) return null;
  const items: MyCommunityDTO[] = data ?? [];

  const tiles = items.map((c) => {
    const active = c.slug === activeSlug;
    return (
      <li key={c.id} className={cx("relative", horizontal ? "shrink-0" : "w-full")}>
        <Link
          href={`/communities/${c.slug}`}
          onClick={onNavigate}
          title={c.name}
          aria-label={`${c.name}${c.mentions ? `, ${c.mentions} mentions` : c.unread ? ", unread messages" : ""}`}
          aria-current={active ? "page" : undefined}
          className={cx("group flex flex-col items-center gap-1", horizontal ? "w-14" : "w-full")}
        >
          <span className={cx("relative block overflow-hidden transition-[border-radius,box-shadow]", horizontal ? "size-11" : "size-14", active ? "rounded-[14px] ring-2 ring-ink" : "rounded-full group-hover:rounded-[14px]")}>
            <Cover src={c.coverImage} seed={c.id} interest={c.interest} className="size-full" />
          </span>
          {(c.mentions > 0 || (c.unread && horizontal)) && (
            <span className={cx("absolute top-0 flex min-w-[18px] items-center justify-center rounded-full bg-accent text-[11px] leading-none font-bold text-accent-ink ring-2 ring-canvas", c.mentions > 0 ? "h-[18px] px-1" : "size-3", horizontal ? "right-1" : "right-1")}>
              {c.mentions > 0 ? (c.mentions > 99 ? "99+" : c.mentions) : ""}
            </span>
          )}
          {horizontal && <span className={cx("w-full truncate px-1 text-center text-[10px] leading-tight", active ? "font-semibold text-ink" : "text-ink-muted group-hover:text-ink")}>{c.name}</span>}
        </Link>
      </li>
    );
  });

  const add = (
    <li className={cx("flex justify-center", horizontal ? "shrink-0 self-start" : "w-full")}>
      <Link href="/communities" onClick={onNavigate} title="Find communities" aria-label="Find communities" className={cx("flex items-center justify-center rounded-full border border-dashed border-line text-ink-muted transition hover:border-ink hover:text-ink", horizontal ? "size-11" : "size-14")}>
        <Icon name="plus" size={18} />
      </Link>
    </li>
  );

  return (
    <nav aria-label="Your communities" className={horizontal ? "border-b border-line px-3 py-3" : "w-full"}>
      <ul className={horizontal ? "flex gap-2 overflow-x-auto no-bar" : "flex w-full flex-col items-center gap-2.5"}>
        {tiles}
        {add}
      </ul>
    </nav>
  );
}
