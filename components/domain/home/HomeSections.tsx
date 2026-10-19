"use client";

import Link from "next/link";
import { Fragment } from "react";
import { SponsoredCard } from "@/components/domain/ads/Sponsored";
import { DateChip, EventCard } from "@/components/domain/EventCard";
import { SectionHeader } from "@/components/domain/SectionHeader";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { getInterest } from "@/lib/constants";
import { formatTime } from "@/lib/format";
import { placeShort } from "@/lib/places";
import type { AdDTO, DiscoverDTO, EventDTO } from "@/lib/types";

/* The event sections under "Happening around you" on the home page. */

/** 1, 2, then 3 cards across, following the width this column actually has (the right rail takes some). */
export function EventGrid({ events, onChange, ad }: { events: EventDTO[]; onChange: (e: EventDTO) => void; ad?: AdDTO }) {
  // an ad takes the third spot, so the first things people see are real events; one card drops to keep rows full
  const shown = ad ? events.slice(0, Math.max(events.length - 1, 2)) : events;
  return (
    <div className="@container">
      <div className="grid gap-4 @lg:grid-cols-2 @3xl:grid-cols-3">
        {shown.map((e, i) => (
          <Fragment key={e.id}>
            {ad && i === 2 && <SponsoredCard ad={ad} />}
            <EventCard event={e} onChange={onChange} />
          </Fragment>
        ))}
        {ad && shown.length < 3 && <SponsoredCard ad={ad} />}
      </div>
    </div>
  );
}

export function EventSection({ id, title, href, hrefLabel, events, onChange, ad }: { id: string; title: string; href?: string; hrefLabel?: string; events: EventDTO[]; onChange: (e: EventDTO) => void; ad?: AdDTO }) {
  if (!events.length) return null;
  return (
    <section aria-labelledby={id}>
      <SectionHeader title={title} href={href} hrefLabel={hrefLabel} />
      <h2 id={id} className="sr-only">
        {title}
      </h2>
      <EventGrid events={events} onChange={onChange} ad={ad} />
    </section>
  );
}

/** Your next events you're going to, as compact tickets. */
export function YourPlans({ events }: { events: EventDTO[] }) {
  if (!events.length) return null;
  return (
    <section aria-labelledby="plans-h">
      <SectionHeader title="Your plans" href="/saved" hrefLabel="All your events" />
      <h2 id="plans-h" className="sr-only">
        Your plans
      </h2>
      <div className="@container">
        <ul className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-3">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/events/${e.id}`} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3 transition hover:border-ink-muted/40 hover:bg-raised/40">
                <DateChip iso={e.startsAt} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{e.title}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {formatTime(e.startsAt)} · {e.online ? "Online" : e.venue || placeShort(e)}
                  </span>
                </span>
                <Icon name="check" size={15} className="ml-auto shrink-0 text-success" aria-label="You're going" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const dayParts = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  return { weekday: d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }), date: d.getUTCDate() };
};

/** The next 7 days with how much is on each; a day opens the Events page on that date. */
export function WeekStrip({ week }: { week: DiscoverDTO["week"] }) {
  if (!week.length || !week.some((d) => d.count)) return null;
  return (
    <section aria-labelledby="week-h">
      <SectionHeader title="This week" href="/events?date=week" hrefLabel="Next 7 days" />
      <h2 id="week-h" className="sr-only">
        This week
      </h2>
      <ol className="no-bar -mx-1 grid auto-cols-[minmax(84px,1fr)] grid-flow-col gap-2 overflow-x-auto px-1 pb-1">
        {week.map((d, i) => {
          const p = dayParts(d.day);
          const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : p.weekday;
          const body = (
            <>
              <span className="eyebrow">{label}</span>
              <span className="mt-1 text-2xl leading-none font-semibold tabular-nums">{p.date}</span>
              <span className={cx("mt-2 text-xs", d.count ? "font-medium text-ink" : "text-ink-muted")}>{d.count ? `${d.count} ${d.count === 1 ? "event" : "events"}` : "Nothing yet"}</span>
            </>
          );
          const cls = "flex h-full flex-col rounded-card border px-3 py-3";
          return (
            <li key={d.day}>
              {d.count ? (
                <Link href={`/events?day=${d.day}`} aria-label={`${label}: ${d.count} events`} className={cx(cls, "border-line bg-surface transition hover:border-ink-muted/40 hover:bg-raised/40", i === 0 && "border-ink-muted/40")}>
                  {body}
                </Link>
              ) : (
                <div className={cx(cls, "border-dashed border-line opacity-60")}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The viewer's interests (or the busiest scenes) with how many events each has coming up. */
export function BrowseScenes({ scenes }: { scenes: DiscoverDTO["yourScenes"] }) {
  if (!scenes.length) return null;
  return (
    <section aria-labelledby="scenes-h">
      <SectionHeader title="Browse by scene" href="/events" hrefLabel="All events" />
      <h2 id="scenes-h" className="sr-only">
        Browse by scene
      </h2>
      <div className="flex flex-wrap gap-2">
        {scenes.map((s) => {
          const i = getInterest(s.interest);
          return (
            <Link key={s.interest} href={`/events?interest=${s.interest}`} className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-semibold transition hover:border-ink-muted/50 hover:bg-raised/40">
              <span aria-hidden="true">{i.glyph}</span>
              {i.name}
              <span className="font-mono text-[11px] font-normal text-ink-muted">{s.count}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
