"use client";

import { useState } from "react";
import { AdminService } from "@/app/services/AdminService";
import { AdminHeader, AUDIT_FILTERS, AuditRow, LoadMore, Panel, SearchBox, Segmented, Toolbar } from "@/components/domain/admin/AdminParts";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { useDebounced, usePaged } from "@/lib/hooks/useApi";
import type { AuditEntryDTO } from "@/lib/types";

export default function AdminAuditPage() {
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 300);
  const { items, loading, loadingMore, error, hasMore, loadMore, reload } = usePaged<AuditEntryDTO>((page) => AdminService.audit({ page, q: query, action }), [action, query], { keepPrevious: true });

  return (
    <>
      <AdminHeader title="Audit log">Every action an admin has taken, newest first. Entries can&apos;t be edited or deleted.</AdminHeader>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search by name of person, event or community" />
        <Segmented label="Filter by kind" value={action} onChange={setAction} options={AUDIT_FILTERS} />
      </Toolbar>
      <Panel>
        {loading && !items.length ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-control" />
            ))}
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={reload} />
          </div>
        ) : !items.length ? (
          <p className="px-4 py-12 text-center text-sm text-ink-muted">Nothing logged{action || query ? " that matches" : " yet"}.</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((e) => (
              <AuditRow key={e.id} e={e} />
            ))}
          </ul>
        )}
        <LoadMore hasMore={hasMore} loading={loadingMore} onClick={() => void loadMore()} />
      </Panel>
    </>
  );
}
