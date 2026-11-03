"use client";

import ApiClient from "@/app/ApiCore";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { relativeStamp } from "@/lib/format";
import { useApi, useNow } from "@/lib/hooks/useApi";
import type { Envelope, ModLogEntryDTO } from "@/lib/types";

const api = new ApiClient();
const ACTION: Record<string, string> = { kick: "removed", ban: "banned", "role.create": "made the role", "role.delete": "deleted the role" };
const WEBHOOK: Record<string, string> = { "webhook.create": "made", "webhook.delete": "deleted", "webhook.regenerate": "made a new link for" };
const KIND: Record<string, string> = { feedPost: "post or comment", topic: "board post or comment", channelMessage: "chat message", event: "event", klique: "klique", kliqueMessage: "klique message" };

/**
 * Community settings → Moderation log (owner and admins): every time someone removed another person's content here,
 * who did it, whose it was and what it said. Site admins' removals show up here too.
 */
export function ModLogPanel({ slug }: { slug: string }) {
  const now = useNow();
  const { data, loading, error, reload } = useApi(() => api.get<Envelope<{ items: ModLogEntryDTO[]; hasMore: boolean }>>(`/api/communities/${slug}/modlog`), [slug], { key: `modlog:${slug}` });
  if (loading && !data) return <Skeleton className="h-60 w-full rounded-card" />;
  if (error || !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data.items.length) {
    return (
      <EmptyState icon="shield" title="Nothing removed yet">
        When you, your admins or Klique remove someone&apos;s post, comment, message, event or klique here, it&apos;s listed here.
      </EmptyState>
    );
  }
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
      {data.items.map((r) => (
        <li key={r.id} className="flex items-start gap-3 px-4 py-3">
          <Avatar name={r.actor?.displayName ?? "?"} src={r.actor?.avatarUrl} size={32} />
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="font-semibold">{r.actor?.displayName ?? "Someone"}</span>{" "}
              {r.action === "role.assign" ? (
                <>
                  set <span className="font-medium">{r.author?.displayName ?? "someone"}</span>&apos;s roles: {r.label}
                </>
              ) : ACTION[r.action] ? (
                <>
                  {ACTION[r.action]} <span className="font-medium">{r.label}</span>
                </>
              ) : r.action === "timeout" || r.action === "timeout.remove" ? (
                <>
                  {r.action === "timeout" ? "timed out" : "lifted the timeout on"} <span className="font-medium">{r.label}</span>
                </>
              ) : r.targetType === "webhook" ? (
                <>
                  {WEBHOOK[r.action] ?? "changed"} the webhook <span className="font-medium">{r.label}</span>
                </>
              ) : (
                <>
                  removed {r.author ? <span className="font-medium">{r.author.displayName}&apos;s</span> : "a"} {KIND[r.targetType] ?? r.targetType}
                </>
              )}
            </p>
            {r.targetType !== "webhook" && r.targetType !== "member" && r.targetType !== "role" && <p className="truncate text-xs text-ink-muted">{r.label}</p>}
          </div>
          <span className="shrink-0 font-mono text-[11px] text-ink-muted">{now ? relativeStamp(r.createdAt, now) : ""}</span>
        </li>
      ))}
    </ul>
  );
}
