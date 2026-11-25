"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { AdminService } from "@/app/services/AdminService";
import { AdminHeader, Badge, ConfirmDialog, LoadMore, Panel, SearchBox, Segmented, TableHead, Toolbar } from "@/components/domain/admin/AdminParts";
import { AdminGate } from "@/components/domain/admin/AdminShell";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { cx } from "@/components/ui/cx";
import { InterestChip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { relativeStamp } from "@/lib/format";
import { useDebounced, usePaged } from "@/lib/hooks/useApi";
import { placeShort } from "@/lib/places";
import type { AdminCommunityRow } from "@/lib/types";

const COLS = "md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.3fr)_88px_96px_112px]";

function AdminCommunitiesPageContent() {
  const toast = useToast();
  const [sort, setSort] = useState<"members" | "new">("members");
  const [q, setQ] = useState("");
  const router = useRouter();
  const shown = useSearchParams().get("view");
  const which = shown === "adult" || shown === "verification" ? shown : "all";
  const [rejecting, setRejecting] = useState<AdminCommunityRow | null>(null);
  const query = useDebounced(q.trim(), 300);
  const [pending, setPending] = useState<AdminCommunityRow | null>(null);
  const [acting, setActing] = useState<AdminCommunityRow | null>(null);
  const { items, loading, loadingMore, error, hasMore, loadMore, reload, setItems } = usePaged<AdminCommunityRow>((page) => AdminService.communities({ sort, q: query, page, ...(which === "adult" ? { adult: "1" as const } : which === "verification" ? { verification: "1" as const } : {}) }), [sort, query, which], { keepPrevious: true });

  return (
    <>
      <AdminHeader title="Communities">Every community on Klique.</AdminHeader>
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
        <Segmented
          label="Which communities"
          value={which}
          onChange={(v) => router.replace(v === "all" ? "/admin/communities" : `/admin/communities?view=${v}`, { scroll: false })}
          options={[
            { id: "all", label: "All" },
            { id: "verification", label: "Waiting to be verified" },
            { id: "adult", label: "18+ only" },
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
          <p className="px-4 py-12 text-center text-sm text-ink-muted">{query ? "No communities match that search." : which === "verification" ? "Nobody is waiting to be verified." : "No communities yet."}</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((c) => (
              <li key={c.id} className={`grid items-center gap-x-4 gap-y-2 px-4 py-3 ${COLS}`}>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="size-11 shrink-0 overflow-hidden rounded-control border border-line bg-raised">
                    {c.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img loading="lazy" src={c.coverImage} alt="" className="size-full object-cover" />
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
                      {c.verified && <Badge>Verified</Badge>}
                      {c.verificationPending && <Badge tone="bad">Waiting to be verified</Badge>}
                      {c.privacy === "private" && <Badge>Private</Badge>}
                      {c.adult && <Badge tone="bad">18+</Badge>}
                      {c.explicit && <Badge tone="bad">Explicit</Badge>}
                      {c.standing && <Badge tone="bad">{c.standing.state === "suspended" ? "Suspended" : "Restricted"}{c.standing.until ? ` until ${new Date(c.standing.until).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</Badge>}
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
                  {!c.official && (
                    <Button
                      size="sm"
                      onClick={() =>
                        void AdminService.communityFlags(c.id, { verified: !c.verified }).then(
                          () => setItems((list) => list.flatMap((x) => (x.id !== c.id ? [x] : which === "verification" ? [] : [{ ...x, verified: !c.verified, verificationPending: false }]))),
                          (e) => toast(errorMessage(e), "error"),
                        )
                      }
                    >
                      {c.verified ? "Unverify" : c.verificationPending ? "Approve" : "Verify"}
                    </Button>
                  )}
                  {c.verificationPending && (
                    <Button size="sm" onClick={() => setRejecting(c)}>
                      Turn down
                    </Button>
                  )}
                  {(c.adult || c.explicit) && (
                    <Button
                      size="sm"
                      onClick={() =>
                        void AdminService.communityFlags(c.id, c.explicit ? { explicit: false } : { adult: false }).then(
                          () => setItems((list) => list.map((x) => (x.id === c.id ? { ...x, explicit: false, adult: c.explicit ? x.adult : false } : x))),
                          (e) => toast(errorMessage(e), "error"),
                        )
                      }
                    >
                      {c.explicit ? "Remove explicit" : "Remove 18+"}
                    </Button>
                  )}
                  {!c.official && (
                    <Button size="sm" onClick={() => setActing(c)}>
                      <Icon name="shield" size={14} /> Act
                    </Button>
                  )}
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
      {acting && (
        <ActModal
          c={acting}
          onClose={() => setActing(null)}
          onDone={(next) => {
            if (next === "banned") setItems((list) => list.filter((x) => x.id !== acting.id));
            else setItems((list) => list.map((x) => (x.id === acting.id ? { ...x, standing: next } : x)));
            setActing(null);
          }}
        />
      )}
      <ConfirmDialog
        open={!!rejecting}
        title={`Turn down ${rejecting?.name ?? ""}?`}
        description="The note goes to its owner, so say why. They can apply again."
        confirm="Turn down"
        onCancel={() => setRejecting(null)}
        onConfirm={async (note) => {
          if (!rejecting) return;
          try {
            await AdminService.communityFlags(rejecting.id, { rejectVerification: true, note });
            setItems((list) => list.flatMap((x) => (x.id !== rejecting.id ? [x] : which === "verification" ? [] : [{ ...x, verificationPending: false }])));
            setRejecting(null);
          } catch (err) {
            toast(errorMessage(err), "error");
          }
        }}
      />
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

/**
 * Act on a community that broke the rules, in steps (as Discord's Trust & Safety does): warn its owner, restrict it
 * (out of Discover and search, causes paused), suspend it (also read only, nobody joins) for a time or until lifted,
 * lift it, or ban it for good (deleted, its owner's account suspended too if ticked). The owner sees the reason.
 */
function ActModal({ c, onClose, onDone }: { c: AdminCommunityRow; onClose: () => void; onDone: (standing: AdminCommunityRow["standing"] | "banned") => void }) {
  const toast = useToast();
  const [action, setAction] = useState<"warn" | "restrict" | "suspend" | "lift" | "ban">(c.standing ? "lift" : "warn");
  const [days, setDays] = useState("7");
  const [reason, setReason] = useState("");
  const [banOwner, setBanOwner] = useState(false);
  const [busy, setBusy] = useState(false);
  const steps: { id: typeof action; label: string; hint: string }[] = [
    { id: "warn", label: "Warn the owner", hint: "A message from the Klique Team; nothing else changes" },
    { id: "restrict", label: "Restrict", hint: "Out of Discover and search; causes paused" },
    { id: "suspend", label: "Suspend", hint: "Also read only, and nobody can join" },
    ...(c.standing ? [{ id: "lift" as const, label: "Lift", hint: "Back to normal" }] : []),
    { id: "ban", label: "Ban", hint: "Deleted for good, with everything in it" },
  ];
  async function go() {
    if (action !== "lift" && !reason.trim()) return toast("Say why: the owner sees it.", "error");
    if (action === "ban" && !window.confirm(`Ban ${c.name}? It's deleted with everything in it. This can't be undone.`)) return;
    setBusy(true);
    try {
      if (action === "ban") {
        await AdminService.deleteCommunity(c.id, reason.trim(), banOwner);
        toast(`${c.name} was banned`, "success");
        return onDone("banned");
      }
      const res = await AdminService.communityStanding(c.id, { action, days: action === "restrict" || action === "suspend" ? (Number(days) || null) : null, reason: reason.trim() });
      toast(action === "warn" ? "Warning sent" : action === "lift" ? `${c.name} is back to normal` : `${c.name} is ${action === "restrict" ? "restricted" : "suspended"}`, "success");
      onDone(res.data.standing);
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Act on ${c.name}`} description={c.owner ? `Owner @${c.owner.handle}. Everything here goes in the audit log.` : "Everything here goes in the audit log."} size="md">
      <div className="space-y-4">
        <div role="radiogroup" aria-label="What to do" className="space-y-1.5">
          {steps.map((x) => (
            <label key={x.id} className={cx("flex cursor-pointer items-center gap-3 rounded-control border px-3 py-2.5", action === x.id ? "border-ink bg-raised" : "border-line hover:bg-raised/60")}>
              <input type="radio" name="act" checked={action === x.id} onChange={() => setAction(x.id)} className="size-4" />
              <span className="min-w-0 flex-1">
                <span className={cx("block text-sm font-semibold", x.id === "ban" && "text-danger")}>{x.label}</span>
                <span className="block text-[12.5px] text-ink-muted">{x.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {(action === "restrict" || action === "suspend") && (
          <SelectField label="For how long" value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="1">1 day</option>
            <option value="3">3 days</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="0">Until lifted</option>
          </SelectField>
        )}
        {action !== "lift" && <TextField label="Reason (the owner sees it)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Repeated ticket scams reported in #general" />}
        {action === "ban" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={banOwner} onChange={(e) => setBanOwner(e.target.checked)} className="size-4" />
            Also suspend the owner&apos;s account
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={action === "ban" ? "danger" : "primary"} loading={busy} onClick={() => void go()}>
            {steps.find((x) => x.id === action)?.label}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function AdminCommunitiesPage() {
  return (
    <AdminGate>
      <Suspense fallback={null}>
        <AdminCommunitiesPageContent />
      </Suspense>
    </AdminGate>
  );
}
