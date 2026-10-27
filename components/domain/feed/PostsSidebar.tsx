"use client";

import Link from "next/link";
import { EventService } from "@/app/services/EventService";
import { FeedService } from "@/app/services/FeedService";
import { JoinButton } from "@/components/domain/JoinButton";
import { SupportButtons } from "@/components/domain/money/Donate";
import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Cover } from "@/components/ui/Cover";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { UserName } from "@/components/ui/UserName";
import { compactCount, formatDateShort, formatTime } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import type { CommunityCardDTO, CommunityDTO } from "@/lib/types";

/**
 * Reddit-style panel beside a community's Posts on wide screens: what the community is (and Join), who can post,
 * who posted the most this week, and its next events.
 */
export function PostsSidebar({ c, onCommunity }: { c: CommunityDTO; onCommunity: (c: CommunityCardDTO) => void }) {
  const side = useApi(() => FeedService.sidebar(c.slug), [c.slug], { key: `feed-side:${c.slug}` });
  const events = useApi(() => EventService.list({ community: c.slug, page: 1 }), [c.slug], { key: `board-side-events:${c.slug}` });
  const upcoming = (events.data?.items ?? []).slice(0, 3);
  const top = side.data?.topPosters;

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      <section aria-label={`About ${c.name}`} className="rounded-card border border-line bg-surface p-4">
        <div className="flex items-center gap-3">
          <span className="relative block size-11 shrink-0 overflow-hidden rounded-[13px]">
            <Cover src={c.coverImage} seed={c.id} interest={c.interest} className="size-full" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold tracking-[-0.01em]">{c.name}</h2>
            {c.memberCount !== null && <p className="font-mono text-[11.5px] text-ink-muted">{compactCount(c.memberCount)} members</p>}
          </div>
          {!c.viewer.isMember && <JoinButton community={c} onChange={onCommunity} />}
        </div>
        {c.description && <p className="mt-3 line-clamp-4 text-[13px] text-ink-muted">{c.description}</p>}
        <div className="mt-3 empty:hidden">
          <SupportButtons slug={c.slug} communityName={c.name} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
          <div className="rounded-control bg-raised px-3 py-2">
            <dt className="text-[11px] text-ink-muted">Who can post</dt>
            <dd className="font-semibold">{c.feedPolicy === "admins" ? "Organisers" : "Members"}</dd>
          </div>
          <div className="rounded-control bg-raised px-3 py-2">
            <dt className="text-[11px] text-ink-muted">You</dt>
            <dd className="font-semibold">{c.canPostToFeed ? "Can post" : c.viewer.isMember ? "Can vote" : "Not joined"}</dd>
          </div>
        </dl>
      </section>

      <section aria-label="Top posters this week" className="rounded-card border border-line bg-surface p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon name="users" size={15} className="text-accent-text" /> Top posters this week
        </h3>
        {!top ? (
          <Rows />
        ) : top.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-muted">No posts this week yet.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {top.map((t) => (
              <li key={t.user.id}>
                <ProfileTrigger handle={t.user.handle} className="flex w-full items-center gap-2.5 rounded-control px-2 py-1.5 text-left transition hover:bg-raised">
                  <Avatar name={t.user.displayName} src={t.user.avatarUrl} frame={t.user.avatarFrame} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold">
                      <UserName name={t.user.displayName} effect={t.user.nameEffect} />
                    </span>
                    <span className="block font-mono text-[11px] text-ink-muted">
                      {t.posts} {t.posts === 1 ? "post" : "posts"} · {compactCount(t.upvotes)} up
                    </span>
                  </span>
                </ProfileTrigger>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Coming up" className="rounded-card border border-line bg-surface p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon name="calendar" size={15} className="text-accent-text" /> Coming up
        </h3>
        {events.loading && !events.data ? (
          <Rows />
        ) : upcoming.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-muted">No events planned yet.</p>
        ) : (
          <ul className="mt-2 space-y-0.5">
            {upcoming.map((e) => (
              <li key={e.id}>
                <Link href={`/events/${e.id}`} className="flex items-center gap-3 rounded-control px-2 py-1.5 transition hover:bg-raised">
                  <span className="flex w-11 shrink-0 flex-col items-center rounded-control bg-raised py-1 leading-none">
                    <span className="text-[10px] font-semibold text-accent-text uppercase">{formatDateShort(e.startsAt).split(" ")[2]}</span>
                    <span className="text-base font-semibold">{formatDateShort(e.startsAt).split(" ")[1]}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{e.title}</span>
                    <span className="block truncate text-[11.5px] text-ink-muted">
                      {formatTime(e.startsAt)} · {e.online ? "Online" : e.venue}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Rows() {
  return (
    <div className="mt-3 space-y-2" aria-busy="true">
      <Skeleton className="h-8" />
      <Skeleton className="h-8" />
    </div>
  );
}
