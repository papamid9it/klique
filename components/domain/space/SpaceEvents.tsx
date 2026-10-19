"use client";

import { EventService } from "@/app/services/EventService";
import { EventRow } from "@/components/domain/events/EventRow";
import { Button } from "@/components/ui/Button";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Icon } from "@/components/ui/Icon";
import { usePaged } from "@/lib/hooks/useApi";
import type { EventDTO } from "@/lib/types";

export function SpaceEvents({ slug, subSlug, canHost }: { slug: string; subSlug?: string; canHost: boolean }) {
  const { items, loading, loadingMore, error, hasMore, loadMore, reload, setItems } = usePaged<EventDTO>(
    (page) => EventService.list({ community: slug, sub: subSlug, page }),
    [slug, subSlug],
  );
  const hostHref = `/events/new?community=${encodeURIComponent(slug)}${subSlug ? `&sub=${encodeURIComponent(subSlug)}` : ""}`;

  return (
    <div className="space-y-4">
      {canHost && (
        <div className="flex justify-end">
          <Button href={hostHref} variant="primary">
            <Icon name="plus" size={15} /> Host an event here
          </Button>
        </div>
      )}
      {loading ? (
        <RowSkeleton rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <EmptyState icon="calendar" title="No upcoming events" action={canHost ? <Button href={hostHref} variant="primary">Host the first one</Button> : undefined}>
          {canHost ? "Nothing is planned yet. Get something on the calendar." : "Nothing is planned yet. Check back soon."}
        </EmptyState>
      ) : (
        <>
          <div className="space-y-2.5">
            {items.map((e) => (
              <EventRow key={e.id} event={e} onChange={(next) => setItems((prev) => prev.map((x) => (x.id === next.id ? next : x)))} />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center">
              <Button onClick={loadMore} loading={loadingMore}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
