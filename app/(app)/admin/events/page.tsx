"use client";

import Link from "next/link";
import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { AdminService } from "@/app/services/AdminService";
import { AdminHeader, Badge, ConfirmDialog, LoadMore, Panel, SearchBox, Segmented, TableHead, Toolbar } from "@/components/domain/admin/AdminParts";
import { AdminGate } from "@/components/domain/admin/AdminShell";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { formatTime } from "@/lib/format";
import { useDebounced, usePaged } from "@/lib/hooks/useApi";
import { placeShort } from "@/lib/places";
import type { AdminEventFilter, AdminEventRow } from "@/lib/types";

const FILTERS: { id: AdminEventFilter; label: string }[] = [
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past" },
  { id: "cancelled", label: "Cancelled" },
  { id: "imported", label: "Imported" },
];
const COLS = "md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_56px_120px]";
const AUDIENCE: Record<AdminEventRow["audience"], string> = { public: "Public", community: "Community", subcommunity: "Group" };

type Pending = { kind: "cancel" | "restore" | "delete"; e: AdminEventRow } | null;

function AdminEventsPageContent() {
  const toast = useToast();
  const [filter, setFilter] = useState<AdminEventFilter>("upcoming");
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 300);
  const [pending, setPending] = useState<Pending>(null);
  const { items, loading, loadingMore, error, hasMore, loadMore, reload, setItems } = usePaged<AdminEventRow>((page) => AdminService.events({ filter, q: query, page }), [filter, query], { keepPrevious: true });

  async function run(note: string) {
    if (!pending) return;
    const { kind, e } = pending;
    try {
      if (kind === "delete") {
        await AdminService.deleteEvent(e.id, note);
        setItems((list) => list.filter((x) => x.id !== e.id));
        toast("Event deleted", "success");
      } else {
        await AdminService.setEventCancelled(e.id, kind === "cancel", note);
        // it no longer belongs in this filter
        setItems((list) => list.filter((x) => x.id !== e.id));
        toast(kind === "cancel" ? "Event cancelled" : "Event restored", "success");
      }
      setPending(null);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <>
      <AdminHeader title="Events">Every event on Klique, public and inside communities. Cancel one to keep it visible as cancelled, or delete it outright.</AdminHeader>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search event titles" />
        <Segmented label="Filter events" value={filter} onChange={setFilter} options={FILTERS} />
      </Toolbar>
      <Panel>
        <TableHead cols={["Event", "When", "Host", "Going", ""]} template={COLS} />
        {loading && !items.length ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-control" />
            ))}
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={reload} />
          </div>
        ) : !items.length ? (
          <p className="px-4 py-12 text-center text-sm text-ink-muted">{query ? "No events match that search." : "No events here."}</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((e) => (
              <li key={e.id} className={`grid items-center gap-x-4 gap-y-2 px-4 py-3 ${COLS}`}>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="size-11 shrink-0 overflow-hidden rounded-control border border-line bg-raised">
                    {e.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.coverImage} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="flex size-full items-center justify-center text-ink-muted">
                        <Icon name="calendar" size={16} />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <Link href={`/events/${e.id}`} className={`block truncate text-sm font-semibold hover:underline ${e.cancelled ? "text-ink-muted line-through" : ""}`}>
                      {e.title}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <Badge>{AUDIENCE[e.audience]}</Badge>
                      {e.community && (
                        <Link href={`/communities/${e.community.slug}`} className="truncate text-xs text-ink-muted hover:underline">
                          {e.community.name}
                        </Link>
                      )}
                      {e.imported && <Badge tone="accent">Imported</Badge>}
                      {e.cancelled && <Badge tone="bad">Cancelled</Badge>}
                    </div>
                  </div>
                </div>
                <div className="pl-14 text-[13px] md:pl-0">
                  <p>{new Date(e.startsAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</p>
                  <p className="text-xs text-ink-muted">
                    {formatTime(e.startsAt)} · {e.online ? "Online" : placeShort(e)}
                  </p>
                </div>
                <p className="truncate pl-14 text-[13px] text-ink-muted md:pl-0">{e.host ? `@${e.host.handle}` : "Deleted user"}</p>
                <p className="hidden font-mono text-sm tabular-nums md:block">{e.goingCount}</p>
                <div className="flex flex-wrap gap-1.5 pl-14 md:justify-end md:pl-0">
                  {e.cancelled ? (
                    <Button size="sm" onClick={() => setPending({ kind: "restore", e })}>
                      Restore
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => setPending({ kind: "cancel", e })}>
                      Cancel
                    </Button>
                  )}
                  <Button size="sm" variant="danger" onClick={() => setPending({ kind: "delete", e })} aria-label={`Delete ${e.title}`}>
                    <Icon name="trash" size={14} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <LoadMore hasMore={hasMore} loading={loadingMore} onClick={() => void loadMore()} />
      </Panel>
      <ConfirmDialog
        open={!!pending}
        title={pending?.kind === "delete" ? `Delete "${pending.e.title}"?` : pending?.kind === "cancel" ? `Cancel "${pending.e.title}"?` : `Restore "${pending?.e.title ?? ""}"?`}
        description={
          pending?.kind === "delete"
            ? "The event, its RSVPs and saves are removed for good. This can't be undone."
            : pending?.kind === "cancel"
              ? "It stays on Klique marked as cancelled, so people who planned to go can see what happened."
              : "It goes back to normal and shows in listings again."
        }
        confirm={pending?.kind === "delete" ? "Delete event" : pending?.kind === "cancel" ? "Cancel event" : "Restore event"}
        danger={pending?.kind !== "restore"}
        onCancel={() => setPending(null)}
        onConfirm={run}
      />
    </>
  );
}

export default function AdminEventsPage() {
  return (
    <AdminGate>
      <AdminEventsPageContent />
    </AdminGate>
  );
}
