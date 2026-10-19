"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AdminService } from "@/app/services/AdminService";
import { AdminHeader, LoadMore, Panel, SearchBox, Segmented, TableHead, Toolbar } from "@/components/domain/admin/AdminParts";
import { AdminGate } from "@/components/domain/admin/AdminShell";
import { PersonDrawer, UserBadges } from "@/components/domain/admin/PersonDrawer";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { relativeStamp } from "@/lib/format";
import { useDebounced, usePaged } from "@/lib/hooks/useApi";
import { placeShort } from "@/lib/places";
import type { AdminUserDTO, AdminUserFilter } from "@/lib/types";

const FILTERS: { id: AdminUserFilter; label: string }[] = [
  { id: "all", label: "Everyone" },
  { id: "new", label: "New this week" },
  { id: "hosts", label: "Verified hosts" },
  { id: "suspended", label: "Suspended" },
  { id: "unverified", label: "Unverified" },
  { id: "admins", label: "Admins" },
];
const COLS = "md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_minmax(0,1fr)_96px_24px]";

function People() {
  const params = useSearchParams();
  const initial = FILTERS.find((f) => f.id === params.get("filter"))?.id ?? "all";
  const [filter, setFilter] = useState<AdminUserFilter>(initial);
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 300);
  const [open, setOpen] = useState<string | null>(null);
  const { items, loading, loadingMore, error, hasMore, loadMore, reload, setItems } = usePaged<AdminUserDTO>((page) => AdminService.users({ filter, q: query, page }), [filter, query], { keepPrevious: true });

  return (
    <>
      <AdminHeader title="People">Every account on Klique. Open someone to see their activity, change what they can do, or suspend them.</AdminHeader>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search name, @handle or email" />
        <Segmented label="Filter people" value={filter} onChange={setFilter} options={FILTERS} />
      </Toolbar>
      <Panel>
        <TableHead cols={["Person", "Email", "Status", "Joined", ""]} template={COLS} />
        {loading && !items.length ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-control" />
            ))}
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={reload} />
          </div>
        ) : !items.length ? (
          <p className="px-4 py-12 text-center text-sm text-ink-muted">{query ? "Nobody matches that search." : "Nobody here yet."}</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => setOpen(u.id)} className={`grid w-full items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition hover:bg-raised/50 ${COLS}`}>
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar name={u.displayName} src={u.avatarUrl} size={34} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{u.displayName}</span>
                      <span className="block truncate font-mono text-[11px] text-ink-muted">
                        @{u.handle} · {placeShort(u)}
                      </span>
                    </span>
                  </span>
                  <span className="truncate pl-[46px] text-[13px] text-ink-muted md:pl-0">{u.email}</span>
                  <span className="flex flex-wrap gap-1 pl-[46px] md:pl-0">
                    <UserBadges u={u} />
                  </span>
                  <span className="hidden font-mono text-xs text-ink-muted md:block">{relativeStamp(u.createdAt)}</span>
                  <span className="hidden text-ink-muted md:block">
                    <Icon name="arrowdown" size={14} className="-rotate-90" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <LoadMore hasMore={hasMore} loading={loadingMore} onClick={() => void loadMore()} />
      </Panel>
      <PersonDrawer userId={open} onClose={() => setOpen(null)} onChange={(next) => setItems((list) => list.map((x) => (x.id === next.id ? next : x)))} />
    </>
  );
}

function AdminPeoplePageContent() {
  return (
    <Suspense fallback={null}>
      <People />
    </Suspense>
  );
}

export default function AdminPeoplePage() {
  return (
    <AdminGate>
      <AdminPeoplePageContent />
    </AdminGate>
  );
}
