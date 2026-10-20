"use client";

import { useState } from "react";
import { ProfileService } from "@/app/services/ProfileService";
import { PersonRow } from "@/components/domain/PersonRow";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { INTERESTS, isInterestId, type InterestId } from "@/lib/constants";
import { usePlace } from "@/components/providers/PlaceProvider";
import { useDebounced, usePaged } from "@/lib/hooks/useApi";
import type { UserBrief } from "@/lib/types";

export function PeopleBrowser() {
  const { where } = usePlace();
  const [interest, setInterest] = useState<InterestId | "">("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const { items, loading, loadingMore, error, hasMore, loadMore, reload } = usePaged<UserBrief>(
    (page) => ProfileService.people({ where, interest: interest || undefined, q: dq || undefined, page }),
    [where, interest, dq],
    { keepPrevious: true, key: `people:${where}:${interest}:${dq}` },
  );
  return (
    <div>
      <div role="search" aria-label="Find people" className="mb-6 grid gap-3 sm:grid-cols-2">
        <TextField label="Search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or @handle" />
        <SelectField label="Interest" value={interest} onChange={(e) => setInterest(isInterestId(e.target.value) ? e.target.value : "")}>
          <option value="">All interests</option>
          {INTERESTS.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </SelectField>
      </div>
      {loading && items.length === 0 ? (
        <RowSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <EmptyState icon="user" title="No one found">People with private profiles don&apos;t appear here.</EmptyState>
      ) : (
        <>
          <div className={`grid gap-3 transition-opacity duration-200 sm:grid-cols-2 ${loading ? "opacity-60" : ""}`} aria-busy={loading || undefined}>
            {items.map((u) => (
              <PersonRow key={u.id} user={u} />
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
