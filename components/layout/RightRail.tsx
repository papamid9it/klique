"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DiscoverService } from "@/app/services/DiscoverService";
import { CommunityRow } from "@/components/domain/CommunityRow";
import { usePlace } from "@/components/providers/PlaceProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { useApi } from "@/lib/hooks/useApi";

export function RightRail() {
  const router = useRouter();
  const { where } = usePlace();
  const [q, setQ] = useState("");
  const { data, loading, error } = useApi(() => DiscoverService.discover(where), [where]);

  const picks = data?.suggestedCommunities.filter((c) => !c.viewer.isMember).slice(0, 4) ?? [];

  return (
    <aside className="sticky top-0 hidden h-dvh flex-col gap-7 overflow-y-auto no-bar border-l border-line px-6 py-7 xl:flex" aria-label="Suggestions">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <label htmlFor="rail-search" className="sr-only">
          Search scenes, people, events
        </label>
        <div className="relative">
          <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" />
          <input
            id="rail-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search scenes, people, events"
            className="h-11 w-full rounded-control border border-line bg-surface pr-3 pl-10 text-sm text-ink placeholder:text-ink-muted/80 focus:border-accent-text"
          />
        </div>
      </form>

      <section aria-labelledby="rail-communities">
        <h2 id="rail-communities" className="mb-3 text-base font-semibold tracking-tight">
          Communities for you
        </h2>
        {loading ? (
          <RowSkeleton rows={3} />
        ) : error ? (
          <p className="text-sm text-ink-muted">Couldn&apos;t load suggestions right now.</p>
        ) : picks.length ? (
          <ul className="divide-y divide-line">
            {picks.map((c) => (
              <li key={c.id}>
                <CommunityRow community={c} compact />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">You&apos;re in every community here. Start a new one?</p>
        )}
      </section>

      <section className="rounded-card bg-raised p-5" aria-labelledby="rail-crew">
        <p className="eyebrow">Got a crew?</p>
        <h2 id="rail-crew" className="mt-2 text-[15px] leading-snug font-semibold">
          Your people are already out there. Give them a place to find you.
        </h2>
        <Button href="/communities/new" variant="ink" size="sm" className="mt-4">
          List your community <Icon name="arrow-up-right" size={13} />
        </Button>
      </section>

      <p className="eyebrow mt-auto leading-relaxed normal-case">
        klique. is built for Lagos and Abuja.{" "}
        <Link href="/settings#appearance" className="underline underline-offset-2 hover:text-ink">
          Change the mood
        </Link>
        .
      </p>
    </aside>
  );
}
