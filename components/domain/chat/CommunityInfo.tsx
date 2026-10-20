"use client";

import { placeLabel } from "@/lib/places";
import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import Link from "next/link";
import { ChannelService } from "@/app/services/ChannelService";
import { EventService } from "@/app/services/EventService";
import { MemberCount } from "@/components/domain/CommunityRow";
import { JoinButton } from "@/components/domain/JoinButton";
import { ShareButton } from "@/components/domain/ShareButton";
import { RoleBadge } from "@/components/domain/space/parts";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Chip, InterestChip } from "@/components/ui/Chip";
import { Cover } from "@/components/ui/Cover";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";

import { formatDateShort } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import type { CommunityDTO } from "@/lib/types";
import { UserName } from "@/components/ui/UserName";

/**
 * Right pane of the community workspace (the Reddit sidebar / Discord member panel):
 * what this community is, who runs it, and what's coming up. It replaces the generic
 * suggestions rail that other pages show.
 */
export function CommunityInfo({ community: c, onJoined, onNavigate, onLeave }: { community: CommunityDTO; onJoined: (c: CommunityDTO) => void; onNavigate?: () => void; onLeave: () => void }) {
  const base = `/communities/${c.slug}`;
  const staff = useApi(() => ChannelService.staff({ slug: c.slug }), [c.slug, c.viewer.role], { key: `staff:${c.slug}:${c.viewer.role}` });
  const events = useApi(() => EventService.list({ community: c.slug, page: 1 }), [c.slug], { key: `info-events:${c.slug}` });
  const upcoming = (events.data?.items ?? []).slice(0, 3);
  const v = c.viewer;

  return (
    <div className="flex flex-col gap-6 px-5 py-5 pt-14 lg:pt-5">
      <section aria-labelledby="about-h">
        <Cover src={c.coverImage} seed={c.id} interest={c.interest} className="aspect-[16/8] rounded-card" />
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <InterestChip id={c.interest} />
          <Chip>
            <Icon name={c.privacy === "private" ? "lock" : "globe"} size={11} /> {c.privacy === "private" ? "Private" : "Public"}
          </Chip>
          {v.role && <RoleBadge role={v.role} />}
        </div>
        <h2 id="about-h" className="mt-3 text-xl font-semibold tracking-[-0.03em] break-words">
          {c.name}
        </h2>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <Icon name="pin" size={13} /> {c.neighborhood ? `${c.neighborhood}, ` : ""}
            {placeLabel(c)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon name="users" size={13} /> <MemberCount community={c} />
          </span>
        </p>
        {c.description ? (
          <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-ink">{c.description}</p>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">No description yet.</p>
        )}
        <p className="mt-3 font-mono text-[11px] text-ink-muted">Created {new Date(c.createdAt).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "Africa/Lagos" })}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {v.isMember ? (
            v.role === "owner" ? (
              <Chip tone="accent">You own this</Chip>
            ) : (
              <Button size="sm" onClick={onLeave}>
                Leave
              </Button>
            )
          ) : (
            <JoinButton size="md" community={c} onChange={(next) => onJoined(next as CommunityDTO)} />
          )}
          <ShareButton path={base} text={`${c.name} on klique`} label="Share" />
          {v.canManage && c.privacy === "private" && (
            <Button size="sm" href={`${base}?settings=invites`}>
              <Icon name="link" size={13} /> Invite
            </Button>
          )}
        </div>
      </section>

      <section aria-labelledby="staff-h">
        <h3 id="staff-h" className="eyebrow mb-3">
          Admins
        </h3>
        {staff.loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : staff.error ? (
          <p className="text-sm text-ink-muted">Couldn&apos;t load the team.</p>
        ) : (
          <ul className="space-y-1">
            {(staff.data ?? []).map((s) => (
              <li key={s.user.id}>
                <ProfileTrigger handle={s.user.handle} className="flex items-center gap-3 rounded-control p-1.5 hover:bg-raised text-left">
                  <Avatar name={s.user.displayName} src={s.user.avatarUrl} frame={s.user.avatarFrame} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold"><UserName name={s.user.displayName} effect={s.user.nameEffect} /></span>
                    <span className="block truncate font-mono text-[11px] text-ink-muted">@{s.user.handle}</span>
                  </span>
                  <RoleBadge role={s.role} />
                </ProfileTrigger>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="up-h">
        <div className="mb-3 flex items-center justify-between">
          <h3 id="up-h" className="eyebrow">
            Coming up
          </h3>
          {upcoming.length > 0 && (
            <Link href={`${base}?view=events`} onClick={onNavigate} className="text-xs font-semibold text-accent-text hover:underline">
              See all
            </Link>
          )}
        </div>
        {events.loading ? (
          <Skeleton className="h-16" />
        ) : upcoming.length ? (
          <ul className="space-y-2">
            {upcoming.map((e) => (
              <li key={e.id}>
                <Link href={`/events/${e.id}`} className="block rounded-card border border-line bg-surface p-3 hover:bg-raised">
                  <p className="truncate text-sm font-semibold">{e.title}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-muted">{formatDateShort(e.startsAt)}</p>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">No events planned yet.</p>
        )}
      </section>

      {(c.subcommunityCount ?? 0) > 0 && (
        <Link href={`${base}?view=groups`} onClick={onNavigate} className="flex items-center justify-between rounded-card border border-line bg-surface p-3.5 text-sm font-semibold hover:bg-raised">
          <span className="inline-flex items-center gap-2">
            <Icon name="folder" size={16} className="text-accent-text" /> {c.subcommunityCount} {c.subcommunityCount === 1 ? "group" : "groups"}
          </span>
          <Icon name="chevron-right" size={15} className="text-ink-muted" />
        </Link>
      )}
    </div>
  );
}
