"use client";

import Link from "next/link";
import { CommunityService } from "@/app/services/CommunityService";
import { ReviewButtons } from "@/components/domain/events/ReviewBar";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { formatDateShort } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import type { CommunityDTO } from "@/lib/types";

/**
 * "To review", like Reddit's mod queue: members' events waiting for approval, decided right here, and a way to the
 * join requests. For the owner, admins and anyone whose role has "Approve and manage events".
 * `onDecided`: the badge beside "To review" counts down.
 */
export function ReviewView({ c, onDecided }: { c: CommunityDTO; onDecided: () => void }) {
  const { data: d, loading, error, reload, setData } = useApi(() => CommunityService.review(c.slug), [c.slug], { key: `review:${c.slug}` });
  // a member sent an event in, someone asked to join: refresh
  useRealtimeEvent(() => void reload(), { filter: (e) => e.type === "notify" && e.category === "admin", debounceMs: 800 });
  if (loading && !d) return <RowSkeleton rows={3} />;
  if (error || !d) return <ErrorState message={error} onRetry={reload} />;
  const nothing = !d.events.length && !(d.canRequests && d.requests);
  return (
    <div className="space-y-4">
      {d.canRequests && d.requests > 0 && (
        <Link href={`/communities/${c.slug}?settings=requests`} className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 hover:bg-raised">
          <Icon name="userplus" size={18} />
          <span className="flex-1 text-[14px] font-semibold">
            {d.requests} join {d.requests === 1 ? "request" : "requests"}
          </span>
          <span className="text-[13px] font-semibold text-accent-text">Open</span>
        </Link>
      )}
      {nothing ? (
        <EmptyState icon="check" title="All caught up">
          {c.memberEvents ? "When a member sends an event in, it waits here for approval." : "Members can't send events in right now. The owner can turn it on in Settings → Groups & events."}
        </EmptyState>
      ) : d.events.length ? (
        <section>
          <h2 className="mb-2 text-[13px] font-semibold text-ink-muted">Events waiting for approval · {d.events.length}</h2>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {d.events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar name={e.host.displayName} src={e.host.avatarUrl} size={34} />
                <div className="min-w-0 flex-1">
                  <Link href={`/events/${e.id}`} className="block truncate text-[14px] font-semibold hover:underline">
                    {e.title}
                  </Link>
                  <p className="truncate text-[12.5px] text-ink-muted">
                    {e.host.displayName} · {formatDateShort(e.startsAt, e.timeZone)} · {e.online ? "Online" : e.venue}
                  </p>
                </div>
                <div className="flex gap-2">
                  <ReviewButtons
                    event={e}
                    size="sm"
                    onDone={() => {
                      setData((x) => (x ? { ...x, events: x.events.filter((p) => p.id !== e.id) } : x));
                      onDecided();
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
