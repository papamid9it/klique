import Link from "next/link";
import { Cover } from "@/components/ui/Cover";
import { eventPhoto } from "@/lib/fake";
import { Icon } from "@/components/ui/Icon";
import { formatDateShort } from "@/lib/format";
import { buttonClass } from "@/components/ui/Button";
import type { EventDTO } from "@/lib/types";

/** The big featured-event banner at the top of Discover. Text sits on a scrim so it reads over any image or mood. */
export function EventHero({ event, eyebrow = "Your scene, IRL" }: { event: EventDTO; eyebrow?: string }) {
  return (
    <section aria-label="Featured event" className="relative isolate overflow-hidden rounded-[1.25rem] border border-line">
      <Cover src={eventPhoto(event.id, event.coverImage)} seed={event.id} interest={event.interest} className="absolute inset-0 -z-10" />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/45 to-black/10" />
      <div className="flex min-h-[19rem] flex-col justify-end gap-3 p-6 text-white sm:min-h-[22rem] sm:p-9">
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-accent px-3 py-1.5 font-mono text-[11px] font-medium tracking-wider text-accent-ink uppercase">
          <span className="size-1.5 rounded-full bg-accent-ink" aria-hidden="true" /> {eyebrow}
        </span>
        <h2 className="display max-w-xl text-[clamp(2rem,5vw,3.25rem)] text-balance">{event.title}</h2>
        <p className="max-w-md text-[15px] text-white/85">{event.description.split(/(?<=[.!?])\s/)[0] || `${event.venue} · ${formatDateShort(event.startsAt)}`}</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <Link href={`/events/${event.id}`} className={buttonClass("ink", "md", "bg-white !text-neutral-900")}>
            See who&apos;s going <Icon name="arrow-up-right" size={14} />
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full bg-black/55 px-3.5 py-2 font-mono text-[11px] text-white backdrop-blur-sm">
            <Icon name="users" size={13} /> {event.goingCount} going · {event.venue}
          </span>
        </div>
      </div>
    </section>
  );
}
