"use client";

import Link from "next/link";
import { PriceTag } from "@/components/domain/EventCard";
import { Button } from "@/components/ui/Button";
import { Cover } from "@/components/ui/Cover";
import { eventPhoto } from "@/lib/fake";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { getInterest } from "@/lib/constants";
import { dateChip, formatTime } from "@/lib/format";
import { useEventActions } from "@/lib/hooks/useEventActions";
import { flag, placeShort } from "@/lib/places";
import type { EventDTO } from "@/lib/types";
import { crewsHref } from "@/components/domain/crews/parts";
import { SoftLink } from "@/components/ui/SoftLink";

/** Compact one-line event for the list view: date · poster · what and where · RSVP. */
export function EventRow({ event, onChange }: { event: EventDTO; onChange: (e: EventDTO) => void }) {
  const { busy, rsvp } = useEventActions(event, onChange);
  const going = event.viewer.rsvp === "going";
  const d = dateChip(event.startsAt);

  return (
    <article className="group flex items-center gap-3.5 rounded-card border border-line bg-surface p-3 transition hover:border-ink-muted/50 sm:gap-4 sm:p-3.5">
      <div className="w-12 shrink-0 text-center leading-none sm:w-14" aria-hidden="true">
        <p className="eyebrow text-[10px]">{d.month}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{d.day}</p>
        <p className="mt-1 font-mono text-[10px] text-ink-muted">{d.weekday}</p>
      </div>
      <Link href={`/events/${event.id}`} tabIndex={-1} aria-hidden="true" className="hidden shrink-0 sm:block">
        <Cover src={eventPhoto(event.id, event.coverImage)} seed={event.id} interest={event.interest} className="size-[4.5rem] rounded-xl" />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="eyebrow truncate">{getInterest(event.interest).short}{event.subcommunity?.name ?? event.community?.name ? ` · ${event.subcommunity?.name ?? event.community?.name}` : ""}</p>
        <h3 className="mt-0.5 truncate text-[16px] font-semibold tracking-[-0.02em]">
          <Link href={`/events/${event.id}`} className="hover:underline">{event.title}</Link>
        </h3>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-ink-muted">
          <span className="inline-flex items-center gap-1"><Icon name="clock" size={12} /> {formatTime(event.startsAt)}</span>
          <span className="inline-flex min-w-0 items-center gap-1">
            {event.online ? <Icon name="globe" size={12} /> : <span aria-hidden="true">{flag(event.country)}</span>}
            <span className="truncate">{event.online ? "Online" : `${event.venue} · ${placeShort(event)}`}</span>
          </span>
          {!event.online && !event.isPast && (
            <SoftLink href={crewsHref(event)} scroll={false} className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline">
              <Icon name="users" size={12} /> {event.crewCount ? `${event.crewCount} ${event.crewCount === 1 ? "crew" : "crews"} going` : "Find a crew"}
            </SoftLink>
          )}
        </p>
      </div>
      <div className="hidden shrink-0 flex-col items-end gap-1.5 md:flex">
        <PriceTag amount={event.priceNaira} currency={event.currency} />
        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-muted"><Icon name="users" size={12} /> {event.goingCount}</span>
      </div>
      {event.viewer.isHost || event.isPast || (event.isFull && !going) ? (
        <Button size="sm" href={`/events/${event.id}`}>{event.viewer.isHost ? "Hosting" : event.isPast ? "View" : "Full"}</Button>
      ) : (
        <Button size="sm" variant={going ? "primary" : "secondary"} onClick={() => rsvp("going")} loading={busy === "rsvp"} aria-pressed={going} className={cx("shrink-0")}>
          {going ? <><Icon name="check" size={14} /> In</> : <>I&apos;m in</>}
        </Button>
      )}
    </article>
  );
}
