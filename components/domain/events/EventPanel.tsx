"use client";

import Link from "next/link";
import { useState } from "react";
import { useProfileCard } from "@/components/providers/ProfileCardProvider";
import { Modal } from "@/components/ui/Modal";
import { UserName } from "@/components/ui/UserName";
import { CommunityService } from "@/app/services/CommunityService";
import { EventService } from "@/app/services/EventService";
import { JoinButton } from "@/components/domain/JoinButton";
import { crewsHref } from "@/components/domain/crews/parts";
import { PagePanel, PanelItem, PanelSection } from "@/components/layout/PagePanel";
import { usePlace } from "@/components/providers/PlaceProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Cover } from "@/components/ui/Cover";
import { Icon } from "@/components/ui/Icon";
import { compactCount, dateChip } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import type { EventDTO, UserBrief } from "@/lib/types";

/** A small event row in the panel: a date badge, the title and where. */
function MiniEvent({ e }: { e: EventDTO }) {
  const d = dateChip(e.startsAt);
  return (
    <li>
      <Link href={`/events/${e.id}`} className="flex items-center gap-2.5 rounded-control px-2 py-1.5 transition hover:bg-raised/60">
        <span className="flex size-9 shrink-0 flex-col items-center justify-center rounded-[10px] bg-raised leading-none">
          <span className="font-mono text-[8px] text-ink-muted uppercase">{d.month}</span>
          <span className="text-[14px] font-semibold">{d.day}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink">{e.title}</span>
          <span className="block truncate text-[11.5px] text-ink-muted">{e.online ? "Online" : e.venue}</span>
        </span>
      </Link>
    </li>
  );
}

/**
 * An event's own left panel: back to Home or all events, the community it's in (with Join), who's going (a list
 * that opens profiles) and its crews, what else that community has coming up, and similar events nearby.
 */
export function EventPanel({ event, people, namesHidden }: { event: EventDTO; people: UserBrief[]; namesHidden: boolean }) {
  const { where } = usePlace();
  const card = useProfileCard();
  const [goingOpen, setGoingOpen] = useState(false);
  const slug = event.community?.slug;
  const community = useApi(slug ? () => CommunityService.get(slug) : null, [slug], { key: slug ? `community:${slug}` : undefined });
  const more = useApi(slug ? () => EventService.list({ community: slug }) : null, [slug], { key: slug ? `event-panel:community:${slug}` : undefined });
  const similar = useApi(() => EventService.list({ interest: event.interest, where }), [event.interest, where], { key: `event-panel:similar:${where}:${event.interest}` });
  const fromCommunity = (more.data?.items ?? []).filter((e) => e.id !== event.id && !e.isPast).slice(0, 3);
  const alike = (similar.data?.items ?? []).filter((e) => e.id !== event.id && !e.isPast && !fromCommunity.some((x) => x.id === e.id)).slice(0, 3);
  const c = community.data;

  return (
    <PagePanel label="Event">
      <ul>
        <li>
          <PanelItem href="/events" icon="calendar">
            All events
          </PanelItem>
        </li>
      </ul>

      {event.community && (
        <section aria-label="Community" className="rounded-card border border-line bg-surface p-3">
          <Link href={`/communities/${event.community.slug}`} className="flex items-center gap-2.5">
            <span className="relative block size-10 shrink-0 overflow-hidden rounded-[11px]">
              {c ? <Cover src={c.coverImage} seed={c.id} interest={c.interest} className="size-full" /> : <span className="block size-full bg-raised" />}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold hover:underline">{event.community.name}</span>
              <span className="block font-mono text-[11px] text-ink-muted">{c?.memberCount != null ? `${compactCount(c.memberCount)} members` : event.community.privacy === "private" ? "Private" : " "}</span>
            </span>
          </Link>
          {c && !event.community.official && (
            <div className="mt-2.5 [&>*]:w-full [&_button]:w-full">
              <JoinButton community={c} onChange={(next) => community.setData((d) => (d ? { ...d, ...next } : d))} />
            </div>
          )}
        </section>
      )}

      <PanelSection title="On this page">
        <li>
          <button type="button" onClick={() => setGoingOpen(true)} className="flex h-10 w-full items-center gap-3 rounded-control px-3 text-left text-[14px] font-medium text-ink-muted transition hover:bg-raised/60 hover:text-ink">
            <Icon name="users" size={16} />
            <span className="flex-1">Who&apos;s going</span>
            <span className="flex -space-x-1.5">
              {people.slice(0, 3).map((p) => (
                <Avatar key={p.id} name={p.displayName} src={p.avatarUrl} size={20} className="ring-2 ring-canvas" />
              ))}
            </span>
            <span className="font-mono text-[11px]">{compactCount(event.goingCount)}</span>
          </button>
        </li>
        {!event.online && (
          <li>
            <PanelItem href={crewsHref(event)} icon="pin" count={event.crewCount}>
              Crews
            </PanelItem>
          </li>
        )}
      </PanelSection>

      {fromCommunity.length > 0 && event.community && (
        <PanelSection title={`More from ${event.community.name}`}>
          {fromCommunity.map((e) => (
            <MiniEvent key={e.id} e={e} />
          ))}
        </PanelSection>
      )}
      {alike.length > 0 && (
        <PanelSection title="Similar events">
          {alike.map((e) => (
            <MiniEvent key={e.id} e={e} />
          ))}
        </PanelSection>
      )}
      <Modal open={goingOpen} onClose={() => setGoingOpen(false)} size="sm" title={`Who's going · ${compactCount(event.goingCount)}`}>
        {people.length ? (
          <ul className="-mx-2 max-h-[60dvh] space-y-0.5 overflow-y-auto">
            {people.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => card.openFull(p.handle)} className="flex w-full items-center gap-3 rounded-control px-2 py-2 text-left transition hover:bg-raised">
                  <Avatar name={p.displayName} src={p.avatarUrl} frame={p.avatarFrame} size={36} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold">
                      <UserName name={p.displayName} effect={p.nameEffect} />
                    </span>
                    <span className="block truncate font-mono text-[11px] text-ink-muted">@{p.handle}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">Nobody yet. Be the first.</p>
        )}
        {namesHidden && <p className="mt-3 text-[12.5px] text-ink-muted">Some people keep their attendance private.</p>}
      </Modal>
    </PagePanel>
  );
}
