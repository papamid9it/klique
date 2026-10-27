"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { EventService } from "@/app/services/EventService";
import { EventCrews } from "@/components/domain/crews/EventCrews";
import { crewsHref } from "@/components/domain/crews/parts";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { formatDateShort } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";

/**
 * An event's crews ("Going together"): who's heading there together, searchable by area with yours first, and Start
 * a crew. For events outside any community; a community's events keep their crews in its Crews view, so those
 * links land there.
 */
export function EventCrewsView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: event, loading, error, status, reload } = useApi(() => EventService.get(id), [id], { key: `event:${id}` });
  const elsewhere = event?.community ? crewsHref(event) : null;
  useEffect(() => {
    if (elsewhere) router.replace(elsewhere);
  }, [elsewhere, router]);

  if (loading || elsewhere) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (status === 404 || status === 403 || status === 400) {
    return (
      <EmptyState icon="lock" title="Event not found" action={<Button href="/events">Browse events</Button>}>
        This event doesn&apos;t exist, or it&apos;s members-only.
      </EmptyState>
    );
  }
  if (error || !event) return <ErrorState message={error} onRetry={reload} />;

  const cancelled = (event as typeof event & { cancelled?: boolean }).cancelled === true;
  const closed = event.online || event.isPast || cancelled;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <Link href={`/events/${event.id}`} className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
          <Icon name="chevron-left" size={15} /> Back to the event
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">{event.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {formatDateShort(event.startsAt)}
          {event.venue ? ` · ${event.venue}` : ""}
        </p>
      </header>
      {closed ? (
        <EmptyState icon="users" title={event.online ? "It's online" : cancelled ? "This event was cancelled" : "This event has ended"} action={<Button href={`/events/${event.id}`}>Back to the event</Button>}>
          {event.online ? "There's nowhere to meet up for an online event." : "Crews are for heading to an event together."}
        </EmptyState>
      ) : (
        <EventCrews event={event} />
      )}
    </div>
  );
}
