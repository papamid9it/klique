"use client";

import { useState } from "react";
import { CommunityService } from "@/app/services/CommunityService";
import { CommunityCard } from "@/components/domain/CommunityCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { CardGridSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { INTERESTS, isInterestId, type InterestId } from "@/lib/constants";
import { ScopeButton } from "@/components/domain/places/ScopeButton";
import { usePlace } from "@/components/providers/PlaceProvider";
import { useDebounced, usePaged } from "@/lib/hooks/useApi";
import type { CommunityCardDTO } from "@/lib/types";

export function CommunitiesBrowser({ initialInterest, scope = "discover" }: { initialInterest?: InterestId; scope?: "discover" | "joined" }) {
  const { where } = usePlace();
  const [interest, setInterest] = useState<InterestId | "">(initialInterest ?? "");
  // Follow the sidebar's ?interest= links without remounting (a remount blanks the grid and flickers).
  const [seenInitial, setSeenInitial] = useState(initialInterest);
  if (initialInterest !== seenInitial) {
    setSeenInitial(initialInterest);
    setInterest(initialInterest ?? "");
  }
  const [q, setQ] = useState("");
  const dq = useDebounced(q);

  const { items, loading, loadingMore, error, hasMore, loadMore, reload } = usePaged<CommunityCardDTO>(
    (page) => CommunityService.list({ where: scope === "joined" ? undefined : where, interest: interest || undefined, q: dq || undefined, scope, page }),
    [where, interest, dq, scope],
    { keepPrevious: true, key: `communities:${scope}:${where}:${interest}:${dq}` },
  );
  const filtered = !!(interest || q);

  return (
    <div>
      <div role="search" aria-label="Filter communities" className="mb-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-56 flex-1">
            <span className="sr-only">Search communities</span>
            <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-muted" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or neighbourhood" className="h-12 w-full rounded-full border border-line bg-surface pr-4 pl-11 text-[15px] text-ink placeholder:text-ink-muted/70 focus:border-accent-text focus:outline-none" />
          </label>
          <div className="w-full sm:w-72">
            <ScopeButton />
          </div>
        </div>
        <div className="no-bar -mx-1 flex gap-2 overflow-x-auto px-1" role="group" aria-label="Interest">
          {[{ id: "", name: "All", glyph: "" }, ...INTERESTS].map((i) => {
            const on = interest === i.id;
            return (
              <button key={i.id || "all"} type="button" aria-pressed={on} onClick={() => setInterest(isInterestId(i.id) ? i.id : "")} className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition ${on ? "border-transparent bg-accent text-accent-ink" : "border-line bg-surface text-ink-muted hover:border-ink-muted/50 hover:text-ink"}`}>
                {i.glyph && <span aria-hidden="true">{i.glyph}</span>}
                {"short" in i ? i.short : i.name}
              </button>
            );
          })}
        </div>
      </div>
      {loading && items.length === 0 ? (
        <CardGridSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <EmptyState icon="users" title={filtered ? "No communities match" : "No communities yet"} action={<Button href="/communities/new" variant="primary">Start one</Button>}>
          {filtered ? "Try another city or interest, or start the scene yourself." : "Your people are out there — give them a place to find you."}
        </EmptyState>
      ) : (
        <>
          <div aria-busy={loading} className={`grid gap-5 transition-opacity duration-200 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 ${loading ? "opacity-60" : "opacity-100"}`}>
            {items.map((c) => (
              <CommunityCard key={c.id} community={c} tag={c.interest ? undefined : undefined} />
            ))}
          </div>
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <Button onClick={loadMore} loading={loadingMore}>Load more</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
