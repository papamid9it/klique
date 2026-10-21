"use client";

import Link from "next/link";
import { Cover } from "@/components/ui/Cover";
import { eventPhoto } from "@/lib/fake";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { getInterest } from "@/lib/constants";
import { dateChip, formatDateShort, formatPrice, isFree } from "@/lib/format";
import { flag, placeShort } from "@/lib/places";
import { useEventActions } from "@/lib/hooks/useEventActions";
import type { EventDTO } from "@/lib/types";

/** The date block + price tag used on event covers. */
export function DateChip({ iso }: { iso: string }) {
  const d = dateChip(iso);
  return (
    <span className="inline-flex min-w-11 flex-col items-center rounded-lg bg-white px-2 py-1 text-center leading-none text-neutral-900 shadow-md">
      <span className="font-mono text-[10px] font-medium tracking-wider">{d.month}</span>
      <span className="mt-0.5 text-xl font-bold tracking-tight">{d.day}</span>
    </span>
  );
}

export function PriceTag({ amount, currency, className }: { amount: number; currency?: string; className?: string }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 font-mono text-[11px] font-medium shadow-sm", isFree(amount) ? "bg-accent text-accent-ink" : "bg-accent2 text-accent2-ink", className)}>
      {isFree(amount) ? "FREE" : formatPrice(amount, currency)}
    </span>
  );
}

export function EventCard({ event, onChange }: { event: EventDTO; onChange: (e: EventDTO) => void }) {
  const { busy, rsvp, toggleSave } = useEventActions(event, onChange);
  const going = event.viewer.rsvp === "going";
  const label = event.subcommunity?.name ?? event.community?.name ?? "Event";

  return (
    <article className="group flex flex-col overflow-hidden rounded-card border border-line bg-surface transition hover:border-ink-muted/50">
      <Link href={`/events/${event.id}`} className="block" aria-label={`${event.title} — open event`}>
        <Cover src={eventPhoto(event.id, event.coverImage)} seed={event.id} interest={event.interest} className="aspect-[16/9]">
          <div className="absolute inset-x-3 top-3 flex items-start justify-between">
            <DateChip iso={event.startsAt} />
            <PriceTag amount={event.priceNaira} currency={event.currency} />
          </div>
          {(event.isPast || event.online || event.audience !== "public") && (
            <div className="absolute bottom-3 left-3 flex gap-1.5">
              {event.isPast && <span className="rounded-full bg-black/70 px-2.5 py-1 font-mono text-[10px] text-white">PAST</span>}
              {event.online && <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 font-mono text-[10px] text-white"><Icon name="globe" size={10} /> ONLINE</span>}
              {event.audience !== "public" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 font-mono text-[10px] text-white">
                  <Icon name="lock" size={10} /> MEMBERS
                </span>
              )}
            </div>
          )}
        </Cover>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <p className="eyebrow truncate">
          {getInterest(event.interest).short} · {label}
        </p>
        <h3 className="mt-1.5 text-[17px] leading-snug font-semibold tracking-[-0.02em]">
          <Link href={`/events/${event.id}`} className="hover:underline hover:underline-offset-2">
            {event.title}
          </Link>
        </h3>
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-ink-muted">
          <Icon name="clock" size={13} className="shrink-0" /> {formatDateShort(event.startsAt)}
        </p>
        <p className="mt-1 flex items-center gap-1.5 truncate text-[13px] text-ink-muted">
          {event.online ? <Icon name="globe" size={13} className="shrink-0" /> : <span className="w-[13px] shrink-0 text-center leading-none" aria-hidden="true">{flag(event.country)}</span>}
          <span className="truncate">{event.online ? `Online · ${event.venue}` : [event.venue, event.neighborhood || placeShort(event)].filter(Boolean).join(" · ")}{!event.online && event.neighborhood ? `, ${placeShort(event)}` : ""}</span>
        </p>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3.5" style={{ marginTop: "1rem" }}>
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-ink-muted">
            <Icon name="users" size={13} /> {event.goingCount} going
          </span>
          <div className="flex items-center gap-1.5">
            {/* a community's event you're not in yet (seen on its page): joining comes first, so no save / RSVP here */}
            {!event.viewer.mustJoin && (
            <button
              type="button"
              onClick={toggleSave}
              disabled={busy === "save"}
              aria-pressed={event.viewer.saved}
              aria-label={event.viewer.saved ? "Remove from saved" : "Save event"}
              className={cx("inline-flex size-8 items-center justify-center rounded-full border border-line transition hover:bg-raised", event.viewer.saved ? "bg-raised text-accent-text" : "text-ink-muted")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill={event.viewer.saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
                <path d="M6.5 3.5h11v17l-5.5-4-5.5 4z" />
              </svg>
            </button>
            )}
            {event.viewer.isHost ? (
              <Button size="sm" href={`/events/${event.id}`}>
                Hosting
              </Button>
            ) : event.isPast || (event.isFull && !going) || (event.viewer.mustJoin && !going) ? (
              <Button size="sm" href={`/events/${event.id}`}>
                {event.isPast || event.viewer.mustJoin ? "View" : "Full"}
              </Button>
            ) : (
              <Button size="sm" variant={going ? "primary" : "secondary"} onClick={() => rsvp("going")} loading={busy === "rsvp"} aria-pressed={going}>
                {going ? (
                  <>
                    <Icon name="check" size={14} /> You&apos;re in
                  </>
                ) : (
                  <>
                    I&apos;m in <Icon name="arrow-up-right" size={13} />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
