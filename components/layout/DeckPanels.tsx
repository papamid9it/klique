"use client";

import Link from "next/link";
import { useState } from "react";
import { CommunityService } from "@/app/services/CommunityService";
import { DiscoverService } from "@/app/services/DiscoverService";
import { DesktopPrompt } from "@/components/domain/DesktopPrompt";
import { JoinButton } from "@/components/domain/JoinButton";
import { crewHref } from "@/components/domain/crews/parts";
import { useHomeKliques } from "@/components/domain/home/useHomeKliques";
import { usePlace } from "@/components/providers/PlaceProvider";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Cover } from "@/components/ui/Cover";
import { Icon } from "@/components/ui/Icon";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { communityNews, rankMyCommunities } from "@/lib/constants";
import { compactCount, relativeStamp } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import type { CommunityCardDTO } from "@/lib/types";
import { PlansCard, RailFooter } from "./RightRail";

/** One floating panel: surface, a 1px line, rounded; its own scrolling. */
export const PANEL = "rounded-[18px] border border-line bg-surface";

/**
 * Communities home on big screens, left: all your communities (latest news and unread on each, scrolling; it stands
 * in for the icon rail), then a few to join, and a way to start or find one.
 */
export function DeckLeftPanel() {
  const mine = useApi(() => CommunityService.mine(), [], { key: "home-places" });
  useRealtimeEvent(() => void mine.reload(), { filter: (e) => e.type === "channel" || (e.type === "notify" && e.category === "community"), debounceMs: 1500 });
  const { where, ready } = usePlace();
  const discover = useApi(() => DiscoverService.discover(where), [where], { key: `discover:${where}`, wait: !ready });
  const [joined, setJoined] = useState<Record<string, CommunityCardDTO>>({});
  const places = rankMyCommunities(mine.data ?? []);
  const suggested = (discover.data?.suggestedCommunities ?? []).filter((c) => !c.viewer.isMember).slice(0, 4);
  return (
    <aside aria-label="Communities" className={`${PANEL} no-bar hidden w-[260px] shrink-0 flex-col gap-1.5 overflow-y-auto p-4 lg:flex`}>
      <div className="mb-1.5 flex items-baseline">
        <h2 className="text-[15px] font-semibold">Your communities</h2>
        <Link href="/communities" className="ml-auto text-xs font-semibold text-ink-muted hover:text-ink">
          See all
        </Link>
      </div>
      {mine.loading && !mine.data ? (
        <RowSkeleton rows={4} />
      ) : !places.length ? (
        <p className="py-2 text-[13px] text-ink-muted">Join a few communities and they&apos;ll live here.</p>
      ) : (
        places.map((c) => {
          const unread = c.mentions || c.unreadCount;
          return (
            <Link key={c.id} href={`/communities/${c.slug}`} className="flex items-center gap-2.5 rounded-[12px] bg-raised/60 p-2.5 transition hover:bg-raised">
              <Cover src={c.coverImage} seed={c.id} interest={c.interest} className="size-9 shrink-0 rounded-[10px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{c.name}</span>
                <span className="block truncate text-xs text-ink-muted">{communityNews(c) ?? (c.lastActivityAt ? `Active ${relativeStamp(c.lastActivityAt)}` : "Quiet lately")}</span>
              </span>
              {!!unread && <span className="shrink-0 rounded-full bg-accent px-1.5 py-px text-[11px] font-semibold text-accent-ink">{c.mentions ? `@${c.mentions}` : unread >= 99 ? "99+" : unread}</span>}
            </Link>
          );
        })
      )}
      {suggested.length > 0 && (
        <>
          <h2 className="mt-4 mb-1 text-[15px] font-semibold">Communities for you</h2>
          {suggested.map((c) => (
            <div key={c.id} className="flex items-center gap-2.5 px-1 py-1.5">
              <Link href={`/communities/${c.slug}`} className="flex min-w-0 flex-1 items-center gap-2.5">
                <Cover src={c.coverImage} seed={c.id} interest={c.interest} className="size-9 shrink-0 rounded-[10px]" />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold">{c.name}</span>
                  <span className="block truncate text-xs text-ink-muted">{c.memberCount != null ? `${compactCount(c.memberCount)} ${c.memberCount === 1 ? "member" : "members"}` : "Public"}</span>
                </span>
              </Link>
              <JoinButton iconOnly community={joined[c.id] ?? c} onChange={(n) => setJoined((j) => ({ ...j, [c.id]: n }))} />
            </div>
          ))}
        </>
      )}
      <Link href="/communities" className="mt-3 flex h-11 shrink-0 items-center justify-center gap-2 rounded-[12px] border border-dashed border-line text-[13px] font-semibold text-ink-muted hover:text-ink">
        <Icon name="plus" size={15} /> Start or find a community
      </Link>
    </aside>
  );
}

/**
 * Communities home on big screens, right: kliques (who's in, spots left), Start a klique, the desktop app (website
 * only), plans, and the footer line at the bottom.
 */
export function DeckRightPanel({ className = "" }: { className?: string }) {
  return (
    <aside aria-label="Kliques and more" className={`${PANEL} no-bar w-[300px] shrink-0 flex-col gap-3 overflow-y-auto p-4 ${className}`}>
      <DeckKliques />
      <DesktopPrompt />
      <PlansCard />
      <RailFooter className="mt-auto pt-2" />
    </aside>
  );
}

/** Kliques as cards: the event (or community), the title, a few faces and the spots left; then Start a klique. */
export function DeckKliques() {
  const { forYou, yours } = useHomeKliques();
  return (
    <section aria-labelledby="deck-kliques" className="flex flex-col gap-2.5">
      <div className="flex items-baseline">
        <h2 id="deck-kliques" className="text-[15px] font-semibold">Kliques</h2>
        <Link href="/kliques" className="ml-auto text-xs font-semibold text-ink-muted hover:text-ink">
          See all
        </Link>
      </div>
      {!forYou.length && <p className="text-[13px] text-ink-muted">No kliques yet. Start one and people join you.</p>}
      {forYou.map((k) => {
        const left = Math.max(0, k.maxMembers - k.memberCount);
        return (
          <Link key={k.id} href={crewHref(k)} className="flex flex-col gap-2.5 rounded-[14px] bg-raised/60 p-3.5 transition hover:bg-raised">
            <span className="truncate text-xs text-ink-muted">{yours.some((y) => y.id === k.id) ? "Yours · " : ""}{k.event?.title ?? k.community?.name ?? "Klique"}</span>
            <span className="text-[14px] leading-snug font-semibold">{k.title}</span>
            <span className="flex items-center">
              {k.faces.slice(0, 4).map((f, i) => (
                <Avatar key={f.id} name={f.displayName} src={f.avatarUrl} size={26} className={i ? "-ml-2.5 ring-2 ring-surface" : "ring-2 ring-surface"} />
              ))}
              <span className="ml-auto text-xs text-ink-muted">{left === 0 ? "Full" : `${left} ${left === 1 ? "spot" : "spots"} left`}</span>
            </span>
          </Link>
        );
      })}
      <Link href="/kliques?start=1" className="flex h-11 items-center justify-center rounded-[12px] bg-accent text-sm font-bold text-accent-ink transition hover:opacity-90">
        Start a klique
      </Link>
    </section>
  );
}
