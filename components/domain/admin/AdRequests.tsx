"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { CampaignService } from "@/app/services/CampaignService";
import { CampaignPreview, PhaseBadge, phaseLine, placementLabel } from "@/components/domain/ads/CampaignParts";
import { ConfirmDialog, Panel, Segmented } from "@/components/domain/admin/AdminParts";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { AD_PLACEMENTS, AD_REACHES, adPrice, type AdPricing } from "@/lib/ads";
import { formatPrice, relativeStamp } from "@/lib/format";
import { useApi, useNow } from "@/lib/hooks/useApi";
import type { AdCampaignDTO } from "@/lib/types";

type Tab = "review" | "approved" | "running" | "all";
type Ask = { c: AdCampaignDTO; action: "changes" | "reject" | "mark-paid" } | null;

/** Admin → Ads → Requests: ads people sent. Approve, ask for changes, reject, or mark paid (a transfer). */
export function AdRequests() {
  const toast = useToast();
  const now = useNow();
  const [tab, setTab] = useState<Tab>("review");
  const { data, loading, error, reload, setData } = useApi(() => CampaignService.adminList(tab), [tab], { key: `admin-ad-requests:${tab}` });
  const [ask, setAsk] = useState<Ask>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useRealtimeEvent(() => void reload(), { filter: (e) => e.type === "notify" && e.ref === "ad-review", debounceMs: 400 });

  async function act(c: AdCampaignDTO, action: "approve" | "changes" | "reject" | "mark-paid", note = "") {
    setBusy(c.id);
    try {
      const res = await CampaignService.review(c.id, action, note);
      // it leaves this list (unless we're looking at all of them)
      setData((list) => (tab === "all" ? (list ?? []).map((x) => (x.id === c.id ? res.data : x)) : (list ?? []).filter((x) => x.id !== c.id)));
      toast(action === "approve" ? "Approved. They've been asked to pay." : action === "changes" ? "Sent back for changes" : action === "reject" ? "Rejected" : "Marked paid. The ad is booked.", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  const list = data ?? [];
  return (
    <div className="space-y-4">
      <Segmented
        label="Ad requests"
        value={tab}
        onChange={setTab}
        options={[
          { id: "review", label: "To review" },
          { id: "approved", label: "Waiting for payment" },
          { id: "running", label: "Paid" },
          { id: "all", label: "All" },
        ]}
      />
      {loading ? (
        <Skeleton className="h-64 w-full rounded-card" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : list.length === 0 ? (
        <EmptyState icon="megaphone" title={tab === "review" ? "Nothing to review" : "Nothing here"}>
          {tab === "review" ? "When someone sends an ad, it shows up here, and you get a notification." : "No ads in this list."}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {list.map((c) => (
            <li key={c.id} className="grid gap-4 rounded-card border border-line bg-surface p-4 md:grid-cols-[13rem_minmax(0,1fr)]">
              <CampaignPreview c={c} />
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <PhaseBadge phase={c.phase} />
                  <span className="font-mono text-sm font-semibold">{formatPrice(c.amount, c.currency)}</span>
                  <span className="text-xs text-ink-muted">· {c.days} {c.days === 1 ? "day" : "days"}{c.startOn ? ` from ${new Date(c.startOn).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</span>
                </div>
                <h3 className="text-[16px] font-semibold">{c.title}</h3>
                <p className="flex items-center gap-2 text-sm text-ink-muted">
                  {c.user && <Avatar name={c.user.displayName} src={c.user.avatarUrl} size={20} />}
                  {c.user?.displayName} (@{c.user?.handle}) · {c.kind === "event" ? `event: ${c.event?.title ?? "?"}` : c.kind === "community" ? `community: ${c.community?.name ?? "?"}` : "their own ad"} · sent {now ? relativeStamp(c.createdAt, now) : ""}
                </p>
                <p className="text-xs text-ink-muted">
                  {c.placements.map(placementLabel).join(" · ")} · {c.placeLabel}
                </p>
                {c.kind === "brand" && c.url && (
                  <p className="truncate text-xs">
                    Link:{" "}
                    <a href={c.url} target="_blank" rel="noopener noreferrer nofollow" className="text-accent-text underline">
                      {c.url}
                    </a>
                  </p>
                )}
                {c.status === "paid" && <p className="text-sm">{phaseLine(c, now)} · {c.impressions} views · {c.clicks} taps · paid {c.paymentMethod === "manual" ? "by transfer" : "by card"}</p>}
                {c.reviewNote && <p className="text-xs text-ink-muted">Note: {c.reviewNote}</p>}
                <div className="flex flex-wrap gap-2 pt-1">
                  {c.status === "pending" && (
                    <>
                      <Button size="sm" variant="primary" loading={busy === c.id} onClick={() => void act(c, "approve")}>
                        <Icon name="check" size={14} /> Approve
                      </Button>
                      <Button size="sm" onClick={() => setAsk({ c, action: "changes" })}>
                        Ask for changes
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAsk({ c, action: "reject" })}>
                        Reject
                      </Button>
                    </>
                  )}
                  {(c.status === "approved" || c.status === "pending") && (
                    <Button size="sm" variant="ghost" onClick={() => setAsk({ c, action: "mark-paid" })}>
                      Mark paid (transfer)
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!ask}
        title={ask?.action === "changes" ? "Ask for changes" : ask?.action === "reject" ? "Reject this ad?" : "Mark as paid and start it?"}
        description={ask?.action === "changes" ? "Say what to change. They'll see this and can send it again." : ask?.action === "reject" ? "Say why. They'll see this." : `Only if you've received ${ask ? formatPrice(ask.c.amount, ask.c.currency) : ""} another way (a bank transfer). The ad starts${ask?.c.startOn ? " on its start date" : " now"}.`}
        confirm={ask?.action === "changes" ? "Send back" : ask?.action === "reject" ? "Reject" : "Mark paid"}
        danger={ask?.action === "reject"}
        withNote={ask?.action !== "mark-paid"}
        onCancel={() => setAsk(null)}
        onConfirm={async (note) => {
          if (!ask) return;
          await act(ask.c, ask.action, note);
          setAsk(null);
        }}
      />
    </div>
  );
}

/** Admin → Ads → Pricing: naira per day for each placement, a multiplier for reach, and the shortest/longest run. */
export function AdPricingForm() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useApi(() => CampaignService.adminPricing(), [], { key: "admin-ad-pricing" });
  const [draft, setDraft] = useState<AdPricing | null>(null);
  const [saving, setSaving] = useState(false);
  const p = draft ?? data;
  if (loading) return <Skeleton className="h-64 w-full rounded-card" />;
  if (error || !p) return <ErrorState message={error} onRetry={reload} />;
  const set = (next: AdPricing) => setDraft(next);
  const example = adPrice(p, ["home-feed"], "city", 1);

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await CampaignService.setPricing(draft);
      setData(res.data);
      setDraft(null);
      toast("Prices saved. New ads use them; ads already sent keep their price.", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Price per day, by placement (₦)">
        <div className="space-y-3 p-4">
          {AD_PLACEMENTS.map((pl) => (
            <TextField key={pl.id} label={pl.label} hint={pl.hint} type="number" inputMode="numeric" min={0} value={String(p.perDay[pl.id])} onChange={(e) => set({ ...p, perDay: { ...p.perDay, [pl.id]: Math.max(0, Math.round(Number(e.target.value) || 0)) } })} />
          ))}
        </div>
      </Panel>
      <div className="space-y-4">
        <Panel title="Reach multiplier">
          <div className="space-y-3 p-4">
            {AD_REACHES.map((r) => (
              <TextField key={r.id} label={`${r.label} ×`} hint={r.hint} type="number" inputMode="decimal" min={0.1} step={0.1} value={String(p.reach[r.id])} onChange={(e) => set({ ...p, reach: { ...p.reach, [r.id]: Number(e.target.value) || 1 } })} />
            ))}
          </div>
        </Panel>
        <Panel title="How long an ad can run">
          <div className="grid grid-cols-2 gap-3 p-4">
            <TextField label="Shortest (days)" type="number" min={1} value={String(p.minDays)} onChange={(e) => set({ ...p, minDays: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
            <TextField label="Longest (days)" type="number" min={1} value={String(p.maxDays)} onChange={(e) => set({ ...p, maxDays: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
          </div>
        </Panel>
        <p className="text-sm text-ink-muted">Example: one day on the homepage feed in one city costs {formatPrice(example, "NGN")}. The price is per placement chosen, times the reach multiplier, times the days.</p>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!draft}>
            Save prices
          </Button>
          {draft && (
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Undo
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
