"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DiscoverService } from "@/app/services/DiscoverService";
import { CommunityRow } from "@/components/domain/CommunityRow";
import { SponsoredBox, useAds } from "@/components/domain/ads/Sponsored";
import { usePlace } from "@/components/providers/PlaceProvider";
import { Icon } from "@/components/ui/Icon";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { useApi } from "@/lib/hooks/useApi";
import { DesktopPrompt } from "@/components/domain/DesktopPrompt";

export function RightRail() {
  const router = useRouter();
  const { where } = usePlace();
  const [q, setQ] = useState("");
  const { data, loading, error } = useApi(() => DiscoverService.discover(where), [where], { key: `discover:${where}` });

  const [railAd] = useAds("home-rail");
  const picks = data?.suggestedCommunities.filter((c) => !c.viewer.isMember).slice(0, 4) ?? [];

  return (
    // the suggestions scroll; the "built for your city" line stays pinned at the bottom, below them (never over them)
    <aside className="sticky top-0 hidden h-dvh flex-col border-l border-line xl:flex" aria-label="Suggestions">
      <div className="no-bar flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-6 pt-7 pb-4">
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
        {loading && !data ? (
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

      {railAd && <SponsoredBox ad={railAd} />}

      <DesktopPrompt />

      {/* plans: Lite and Pro, opening the pricing page */}
      <Link href="/pricing" className="group block rounded-card border border-line bg-surface p-5 transition hover:border-ink-muted/60" aria-labelledby="rail-pro">
        <p className="eyebrow flex items-center gap-2">
          <span className="rounded-full bg-accent px-1.5 py-px text-[10px] font-bold tracking-wide text-accent-ink">PRO</span>
          <span className="rounded-full border border-accent-text/60 px-1.5 py-px text-[10px] font-bold tracking-wide text-accent-text">LITE</span>
        </p>
        <h2 id="rail-pro" className="mt-2.5 text-[15px] leading-snug font-semibold">
          Start more kliques, show more of you.
        </h2>
        <p className="mt-1 text-[13px] text-ink-muted">More kliques, more profile photos and videos, and a badge by your name.</p>
        <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold group-hover:underline">
          See plans <Icon name="arrow-up-right" size={13} />
        </span>
      </Link>

      </div>

      <p className="eyebrow shrink-0 px-6 pt-3 pb-7 leading-relaxed normal-case">
        klique. is built for your city{" "}
        <Link href="/settings#appearance" className="underline underline-offset-2 hover:text-ink">
          Change the mood
        </Link>
        .
      </p>
    </aside>
  );
}
