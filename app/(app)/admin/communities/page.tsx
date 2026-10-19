"use client";

import Link from "next/link";
import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { AdminService } from "@/app/services/AdminService";
import { AdminHeader, Badge, ConfirmDialog, LoadMore, Panel, SearchBox, Segmented, TableHead, Toolbar } from "@/components/domain/admin/AdminParts";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { InterestChip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { relativeStamp } from "@/lib/format";
import { useDebounced, usePaged } from "@/lib/hooks/useApi";
import { placeShort } from "@/lib/places";
import type { AdminCommunityRow } from "@/lib/types";

const COLS = "md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.3fr)_88px_96px_112px]";

export default function AdminCommunitiesPage() {
  const toast = useToast();
  const [sort, setSort] = useState<"members" | "new">("members");
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 300);
  const [pending, setPending] = useState<AdminCommunityRow | null>(null);
  const { items, loading, loadingMore, error, hasMore, loadMore, reload, setItems } = usePaged<AdminCommunityRow>((page) => AdminService.communities({ sort, q: query, page }), [sort, query], { keepPrevious: true });

  return (
    <>
      <AdminHeader title="Communities">Every community on Klique. Ones above the member threshold let their owner post public events.</AdminHeader>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search communities" />
        <Segmented
          label="Sort communities"
          value={sort}
          onChange={setSort}
          options={[
            { id: "members", label: "Most members" },
            { id: "new", label: "Newest" },
          ]}
        />
      </Toolbar>
      <Panel>
        <TableHead cols={["Community", "Owner", "Members", "Created", ""]} template={COLS} />
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
          <p className="px-4 py-12 text-center text-sm text-ink-muted">{query ? "No communities match that search." : "No communities yet."}</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((c) => (
              <li key={c.id} className={`grid items-center gap-x-4 gap-y-2 px-4 py-3 ${COLS}`}>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="size-11 shrink-0 overflow-hidden rounded-control border border-line bg-raised">
                    {c.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.coverImage} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="flex size-full items-center justify-center text-ink-muted">
                        <Icon name="hash" size={16} />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <Link href={`/communities/${c.slug}`} className="block truncate text-sm font-semibold hover:underline">
                      {c.name}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <InterestChip id={c.interest} short />
                      {c.privacy === "private" && <Badge>Private</Badge>}
                      {c.hostsPublic && <Badge tone="good">Can host public</Badge>}
                      <span className="text-xs text-ink-muted">{placeShort(c)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex min-w-0 items-center gap-2 pl-14 md:pl-0">
                  {c.owner ? (
                    <>
                      <Avatar name={c.owner.displayName} src={c.owner.avatarUrl} size={22} />
                      <span className="truncate text-[13px] text-ink-muted">@{c.owner.handle}</span>
                    </>
                  ) : (
                    <span className="text-[13px] text-ink-muted">Deleted user</span>
                  )}
                </div>
                <p className="pl-14 font-mono text-sm tabular-nums md:pl-0">
                  {c.memberCount.toLocaleString()}
                  <span className="text-ink-muted md:hidden"> members</span>
                </p>
                <p className="hidden font-mono text-xs text-ink-muted md:block">{relativeStamp(c.createdAt)}</p>
                <div className="flex gap-1.5 pl-14 md:justify-end md:pl-0">
                  <Button size="sm" href={`/communities/${c.slug}`}>
                    Open
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setPending(c)} aria-label={`Delete ${c.name}`}>
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
        title={`Delete ${pending?.name ?? ""}?`}
        description={`Deletes the community with all ${pending?.memberCount ?? 0} memberships, its groups, channels, messages and posts. This can't be undone. To deal with one bad actor, suspend them instead.`}
        confirm="Delete community"
        onCancel={() => setPending(null)}
        onConfirm={async (note) => {
          if (!pending) return;
          try {
            await AdminService.deleteCommunity(pending.id, note);
            setItems((list) => list.filter((x) => x.id !== pending.id));
            toast(`${pending.name} was deleted`, "success");
            setPending(null);
          } catch (err) {
            toast(errorMessage(err), "error");
          }
        }}
      />
    </>
  );
}
