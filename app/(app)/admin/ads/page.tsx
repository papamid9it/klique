"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminService } from "@/app/services/AdminService";
import { AdPricingForm, AdRequests } from "@/components/domain/admin/AdRequests";
import { errorMessage } from "@/app/ApiCore";
import { AdService } from "@/app/services/AdService";
import { AdEditor, SLOTS } from "@/components/domain/admin/AdEditor";
import { AdminHeader, Badge, ConfirmDialog, Panel, Segmented, StatCard, TableHead, Toolbar } from "@/components/domain/admin/AdminParts";
import { AdminGate } from "@/components/domain/admin/AdminShell";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { formatDateShort, formatPrice, pluralize } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import type { AdminAdDTO } from "@/lib/types";

type Filter = "all" | "live" | "paused" | "ended";
const COLS = "md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_72px_64px_64px_196px]";
const ctr = (a: { impressions: number; clicks: number }) => (a.impressions ? `${((a.clicks / a.impressions) * 100).toFixed(1)}%` : "—");

function state(a: AdminAdDTO): { label: string; tone: "good" | "neutral" | "bad" | "accent" } {
  if (a.pendingReview) return { label: "Waiting", tone: "accent" };
  if (a.status === "paused") return { label: "Paused", tone: "neutral" };
  if (a.live) return { label: "Live", tone: "good" };
  if (a.startsAt && new Date(a.startsAt) > new Date()) return { label: "Scheduled", tone: "accent" };
  return { label: "Ended", tone: "neutral" };
}

function AdsContent() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useApi(() => AdService.list(), []);
  const [editing, setEditing] = useState<AdminAdDTO | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminAdDTO | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const ads = data ?? [];
  const shown = ads.filter((a) => filter === "all" || (filter === "live" ? a.live : filter === "paused" ? a.status === "paused" : !a.live && a.status === "active"));
  const totals = ads.reduce((t, a) => ({ impressions: t.impressions + a.impressions, clicks: t.clicks + a.clicks }), { impressions: 0, clicks: 0 });

  const upsert = (a: AdminAdDTO) => setData((list) => (list?.some((x) => x.id === a.id) ? list.map((x) => (x.id === a.id ? a : x)) : [a, ...(list ?? [])]));

  async function toggle(a: AdminAdDTO) {
    try {
      const { data: next } = await AdService.setStatus(a.id, a.status === "active" ? "paused" : "active");
      upsert(next);
      toast(next.status === "paused" ? `“${a.name}” is paused` : a.pendingReview ? `“${a.name}” is approved and live` : `“${a.name}” is running again`, "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <>
      <AdminHeader
        title="Ads"
        actions={
          <Button variant="primary" onClick={() => setEditing("new")}>
            <Icon name="plus" size={15} /> New ad
          </Button>
        }
      >
        Promoted events and brand ads. Each is labelled “Sponsored” in the app, chosen by place and scene only, and never shown in chats.
      </AdminHeader>

      {loading ? (
        <Skeleton className="h-64 w-full rounded-card" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon="megaphone" label="Live now" value={ads.filter((a) => a.live).length} hint={`${ads.length} ads in total`} />
            <StatCard icon="search" label="Times shown" value={totals.impressions} hint="Across all ads, all time" />
            <StatCard icon="link" label="Clicks" value={totals.clicks} hint="Across all ads, all time" />
            <StatCard icon="check" label="Click rate" value={ctr(totals)} hint="Clicks ÷ times shown" />
          </div>

          {ads.length === 0 ? (
            <EmptyState icon="megaphone" title="No ads yet" action={<Button variant="primary" onClick={() => setEditing("new")}>Create the first ad</Button>}>
              Start with a promoted event: pick an event and it shows as a “Promoted” card on the home page and Events list.
            </EmptyState>
          ) : (
            <>
              <Toolbar>
                <Segmented
                  label="Filter ads"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { id: "all", label: "All", count: ads.length },
                    { id: "live", label: "Live", count: ads.filter((a) => a.live).length },
                    { id: "paused", label: "Paused" },
                    { id: "ended", label: "Ended or scheduled" },
                  ]}
                />
              </Toolbar>
              <Panel>
                <TableHead cols={["Ad", "Shows on", "Shown", "Clicks", "Rate", ""]} template={COLS} />
                {shown.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-ink-muted">Nothing here.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {shown.map((a) => {
                      const st = state(a);
                      return (
                        <li key={a.id} className={`grid items-center gap-x-4 gap-y-2 px-4 py-3 ${COLS}`}>
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="size-11 shrink-0 overflow-hidden rounded-control border border-line bg-raised">
                              {a.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={a.imageUrl} alt="" className="size-full object-cover" />
                              ) : (
                                <span className="flex size-full items-center justify-center text-ink-muted">
                                  <Icon name={a.kind === "event" ? "calendar" : "megaphone"} size={16} />
                                </span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{a.name}</p>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                <Badge tone={st.tone}>{st.label}</Badge>
                                <Badge>{a.kind === "event" ? "Promoted event" : "Brand"}</Badge>
                                {a.pendingReview && <Badge tone="accent">Needs review</Badge>}
                                {a.paid && <Badge tone="good">Paid {formatPrice(a.paid.amount, a.paid.currency)}{a.paid.by ? ` · @${a.paid.by.handle}` : ""}</Badge>}
                                {a.reports > 0 && <Badge tone="bad">{pluralize(a.reports, "report")}</Badge>}
                                <span className="truncate text-xs text-ink-muted">
                                  {a.kind === "event" ? (a.event?.title ?? "Event deleted") : a.advertiser}
                                  {a.endsAt ? ` · until ${formatDateShort(a.endsAt)}` : ""}
                                </span>
                              </div>
                            </div>
                          </div>
                          <p className="pl-14 text-xs text-ink-muted md:pl-0">{a.slots.map((s) => SLOTS.find((x) => x.id === s)?.label ?? s).join(", ")}</p>
                          <p className="pl-14 font-mono text-sm tabular-nums md:pl-0">
                            {a.impressions.toLocaleString()}
                            <span className="text-ink-muted md:hidden"> shown · {a.clicks} clicks · {ctr(a)}</span>
                          </p>
                          <p className="hidden font-mono text-sm tabular-nums md:block">{a.clicks.toLocaleString()}</p>
                          <p className="hidden font-mono text-sm tabular-nums md:block">{ctr(a)}</p>
                          <div className="flex flex-wrap gap-1.5 pl-14 md:justify-end md:pl-0">
                            <Button size="sm" onClick={() => setEditing(a)}>
                              Edit
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => void toggle(a)}>
                              {a.status === "active" ? "Pause" : a.pendingReview ? "Approve" : "Resume"}
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => setDeleting(a)} aria-label={`Delete ${a.name}`}>
                              <Icon name="trash" size={14} />
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
            </>
          )}
        </div>
      )}

      {editing && (
        <AdEditor
          ad={editing}
          onClose={() => setEditing(null)}
          onSaved={(a) => {
            upsert(a);
            setEditing(null);
          }}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description="It stops showing right away and its numbers are deleted with it. To stop it but keep the numbers, pause it instead."
        confirm="Delete ad"
        withNote={false}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await AdService.remove(deleting.id);
            setData((list) => (list ?? []).filter((x) => x.id !== deleting.id));
            toast("Ad deleted", "success");
            setDeleting(null);
          } catch (e) {
            toast(errorMessage(e), "error");
          }
        }}
      />
    </>
  );
}

type View = "requests" | "ads" | "pricing";

/** Admin → Ads: ads people sent (to review), every ad on Klique, and what ads cost. */
function AdsAdmin() {
  const sp = useSearchParams();
  const router = useRouter();
  const v = sp.get("view");
  const view: View = v === "ads" || v === "pricing" ? v : "requests";
  const { data: summary } = useApi(() => AdminService.summary(), [], { key: "admin-summary" });
  return (
    <>
      <div className="mb-5">
        <Segmented
          label="Ads"
          value={view}
          onChange={(next) => router.replace(`/admin/ads?view=${next}`, { scroll: false })}
          options={[
            { id: "requests", label: "Requests", count: summary?.pendingAds ?? null },
            { id: "ads", label: "All ads" },
            { id: "pricing", label: "Pricing" },
          ]}
        />
      </div>
      {view === "ads" ? (
        <AdsContent />
      ) : (
        <>
          <AdminHeader title={view === "requests" ? "Ad requests" : "Ad pricing"}>
            {view === "requests" ? "Ads people sent. Approve one and they're asked to pay; it starts once paid. Ask for changes or reject with a reason they'll see." : "What ads cost. People see these prices when they create an ad; the server works out the total from them."}
          </AdminHeader>
          {view === "requests" ? <AdRequests /> : <AdPricingForm />}
        </>
      )}
    </>
  );
}

export default function AdminAdsPage() {
  return (
    <AdminGate>
      <Suspense fallback={null}>
        <AdsAdmin />
      </Suspense>
    </AdminGate>
  );
}
