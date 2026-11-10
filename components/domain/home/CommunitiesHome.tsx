"use client";

import { CommunityHomeFeed } from "./CommunityHomeFeed";
import Link from "next/link";
import { CommunityService } from "@/app/services/CommunityService";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { Button } from "@/components/ui/Button";
import { Cover } from "@/components/ui/Cover";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { communityNews, rankMyCommunities } from "@/lib/constants";
import { relativeStamp } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import type { MyCommunityDTO } from "@/lib/types";

const SHADE = "absolute inset-x-0 bottom-0 bg-black/40 px-3 py-2 text-white";
const PILL = "absolute top-2.5 right-2.5 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-white px-2 text-sm font-bold text-black";

function Place({ c, big }: { c: MyCommunityDTO; big?: boolean }) {
  const news = communityNews(c);
  const unread = c.mentions || c.unreadCount;
  return (
    <Link href={`/communities/${c.slug}`} aria-label={`${c.name}${news ? `, ${news}` : ""}`} className={big ? "relative col-span-2 h-56 overflow-hidden rounded-[20px] lg:col-span-1 lg:row-span-2 lg:h-auto" : "relative h-36 overflow-hidden rounded-card lg:h-auto"}>
      <Cover src={c.coverImage} seed={c.id} interest={c.interest} className="absolute inset-0" />
      {big ? news && <span className={PILL}>{news}</span> : !!unread && <span className={PILL}>{c.mentions ? `@${c.mentions}` : c.unreadCount >= 99 ? "99+" : c.unreadCount}</span>}
      <span className={SHADE}>
        <span className={big ? "block text-2xl font-bold leading-tight" : "block truncate text-[15px] font-bold leading-5"}>{c.name}</span>
        <span className="block truncate text-sm text-white/90">{big ? (news ?? (c.lastActivityAt ? `Active ${relativeStamp(c.lastActivityAt)}` : "Quiet lately")) : c.lastActivityAt ? relativeStamp(c.lastActivityAt) : "Quiet lately"}</span>
      </span>
    </Link>
  );
}

/**
 * Home in the Communities style: the places you joined (the one that needs you most big), more of them, then a scrolling
 * mix that's mostly events, with kliques you could join and a few posts from your places (CommunityHomeFeed).
 */
export function CommunitiesHome() {
  const mine = useApi(() => CommunityService.mine(), [], { key: "home-places" });
  useRealtimeEvent(() => void mine.reload(), { filter: (e) => e.type === "channel" || (e.type === "crew" && !!e.chat) || (e.type === "notify" && e.category === "community"), debounceMs: 1500 });

  const places = rankMyCommunities(mine.data ?? []);
  const more = places.slice(5, 9);

  return (
    <div className="px-4 py-6 lg:px-7">
      <h1 className="mb-3 text-2xl font-semibold tracking-[-0.02em]">Your places</h1>
      {mine.loading && !mine.data ? (
        <RowSkeleton rows={4} />
      ) : mine.error && !mine.data ? (
        <ErrorState message={mine.error} onRetry={mine.reload} />
      ) : !places.length ? (
        <EmptyState icon="users" title="Find your communities" action={<Button href="/communities" variant="primary">Find communities</Button>}>
          Join a few and they&apos;ll live here, ready to open.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-[2fr_1fr_1fr] lg:grid-rows-[150px_150px]">
          <Place c={places[0]} big />
          {places.slice(1, 5).map((c) => (
            <Place key={c.id} c={c} />
          ))}
        </div>
      )}

      {more.length > 0 && (
        <section aria-labelledby="more-places" className="mt-6">
          <h2 id="more-places" className="mb-2 text-sm font-semibold text-ink-muted">More of your places</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {more.map((c) => (
              <Link key={c.id} href={`/communities/${c.slug}`} className="flex items-center gap-3 rounded-card border border-line bg-surface p-2.5 hover:border-ink-muted/50">
                <Cover src={c.coverImage} seed={c.id} interest={c.interest} className="size-11 shrink-0 rounded-control" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{c.name}</span>
                  <span className="block truncate text-xs text-ink-muted">{communityNews(c) ?? (c.lastActivityAt ? relativeStamp(c.lastActivityAt) : "Quiet lately")}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* then mostly events, kliques you could join and a few posts from your places, scrolling */}
      <CommunityHomeFeed />
    </div>
  );
}
