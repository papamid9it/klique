"use client";

import { useState } from "react";
import { EventService } from "@/app/services/EventService";
import { EventCard } from "@/components/domain/EventCard";
import { CommunitiesPanel } from "@/components/layout/CommunitiesPanel";
import { PageBanner, PillTabs } from "@/components/layout/PageTitle";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { CardGridSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { usePaged } from "@/lib/hooks/useApi";
import type { EventDTO } from "@/lib/types";

type Scope = "saved" | "going" | "hosted";
const TABS: { id: Scope; label: string; empty: string; hint: string }[] = [
  { id: "saved", label: "Saved", empty: "Nothing saved yet", hint: "Tap the bookmark on any event to keep it here." },
  { id: "going", label: "Going", empty: "You're not going to anything yet", hint: "RSVP to an event and it'll show up here." },
  { id: "hosted", label: "Hosting", empty: "You aren't hosting anything", hint: "Put something on the calendar for your scene." },
];

function List({ scope }: { scope: Scope }) {
  const tab = TABS.find((t) => t.id === scope)!;
  const { items, loading, loadingMore, error, hasMore, loadMore, reload, setItems } = usePaged<EventDTO>((page) => EventService.list({ scope, page }), [scope], { key: `my-events:${scope}` });
  if (loading) return <CardGridSkeleton count={4} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={scope === "saved" ? "bookmark" : "calendar"}
        title={tab.empty}
        action={
          scope === "hosted" ? (
            <Button href="/communities" variant="primary">
              Your communities
            </Button>
          ) : (
            <Button href="/events" variant="primary">
              Browse events
            </Button>
          )
        }
      >
        {tab.hint}
      </EmptyState>
    );
  }
  return (
    <>
      <p className="mb-4 font-mono text-xs text-ink-muted">
        {items.length}{hasMore ? "+" : ""} {items.length === 1 ? "event" : "events"}
      </p>
      <div className="grid gap-5 min-[540px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {items.map((e) => (
          <EventCard
            key={e.id}
            event={e}
            onChange={(next) =>
              setItems((list) => {
                // drop it from the list if the change removed it from this tab
                const gone = (scope === "saved" && !next.viewer.saved) || (scope === "going" && next.viewer.rsvp !== "going");
                return gone ? list.filter((x) => x.id !== next.id) : list.map((x) => (x.id === next.id ? next : x));
              })
            }
          />
        ))}
      </div>
      {hasMore && (
        <div className="mt-6 flex justify-center">
          <Button onClick={loadMore} loading={loadingMore}>
            Load more
          </Button>
        </div>
      )}
    </>
  );
}

export default function SavedPage() {
  const { status, requireAuth } = useAuth();
  const [scope, setScope] = useState<Scope>("saved");

  return (
    <div>
      <CommunitiesPanel section="saved" />
      <PageBanner
        eyebrow="Your calendar"
        title="Your events"
        action={
          <div className="flex flex-wrap gap-2">
            <Button href="/events" variant="secondary">
              Browse events
            </Button>
          </div>
        }
        footer={
          status === "authed" ? (
            <PillTabs
              label="Your events"
              active={scope}
              onChange={setScope}
              items={[
                { id: "saved", label: "Saved", icon: <Icon name="bookmark" size={15} /> },
                { id: "going", label: "Going", icon: <Icon name="check" size={15} /> },
                { id: "hosted", label: "Hosting", icon: <Icon name="calendar" size={15} /> },
              ]}
            />
          ) : undefined
        }
      >
        Events you&apos;ve saved, plan to attend, or are hosting.
      </PageBanner>
      {status === "loading" ? (
        <CardGridSkeleton count={4} />
      ) : status === "anon" ? (
        <EmptyState icon="bookmark" title="Sign in to see your events" action={<Button variant="primary" onClick={() => requireAuth()}>Sign in</Button>}>
          Save events, RSVP and host your own with a free account.
        </EmptyState>
      ) : (
        <List key={scope} scope={scope} />
      )}
    </div>
  );
}
