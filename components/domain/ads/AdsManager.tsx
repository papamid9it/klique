"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { CampaignService } from "@/app/services/CampaignService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { ConfirmModal } from "@/components/domain/space/parts";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Cover } from "@/components/ui/Cover";
import { Dropdown, type MenuEntry } from "@/components/ui/Dropdown";
import { Icon, type IconName } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { AD_PLACEMENTS, AD_REACHES } from "@/lib/ads";
import { formatPrice } from "@/lib/format";
import { useApi, useNow } from "@/lib/hooks/useApi";
import { softNavigate } from "@/lib/nav";
import type { AdCampaignDTO, AdCampaignPhase } from "@/lib/types";
import { PhaseBadge, phaseLine, placementLabel } from "./CampaignParts";

export type AdsTab = "overview" | "ads" | "billing" | "help" | "create";

const NAV: { id: Exclude<AdsTab, "create">; label: string; icon: IconName }[] = [
  { id: "overview", label: "Overview", icon: "home" },
  { id: "ads", label: "Ads", icon: "megaphone" },
  { id: "billing", label: "Billing", icon: "ticket" },
  { id: "help", label: "How ads work", icon: "info" },
];

const hrefOf = (t: Exclude<AdsTab, "create">) => (t === "overview" ? "/ads" : `/ads?tab=${t}`);
const short = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });
const rate = (views: number, taps: number) => (views ? `${((taps / views) * 100).toFixed(1)}%` : "–");

/** Your ads, shared by every part of Ads Manager (one fetch, kept in memory). */
export function useMyAds() {
  const { status } = useAuth();
  return useApi(status === "authed" ? () => CampaignService.mine() : null, [status], { key: "my-ads" });
}

export function totalsOf(list: AdCampaignDTO[]) {
  const paid = list.filter((c) => c.status === "paid");
  return {
    running: list.filter((c) => c.phase === "live").length,
    waiting: list.filter((c) => c.phase === "pending").length,
    action: list.filter((c) => c.phase === "approved" || c.phase === "changes").length,
    spent: paid.reduce((s, c) => s + c.amount, 0),
    views: paid.reduce((s, c) => s + c.impressions, 0),
    taps: paid.reduce((s, c) => s + c.clicks, 0),
  };
}

/* ------------------------------ the panel ------------------------------ */

/** Ads Manager's left panel: who's advertising, a summary, the sections, and Create ad. */
export function AdsPanel({ tab }: { tab: AdsTab }) {
  const { user } = useAuth();
  const { data } = useMyAds();
  const t = totalsOf(data ?? []);
  return (
    <div className="flex h-full flex-col gap-5 p-4">
      <div className="flex items-center gap-2.5 px-1 pt-1">
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-accent text-accent-ink">
          <Icon name="megaphone" size={17} />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold tracking-[-0.01em]">Ads Manager</p>
          {user && (
            <p className="flex items-center gap-1.5 truncate text-xs text-ink-muted">
              <Avatar name={user.displayName} src={user.avatarUrl} size={14} /> {user.displayName}
            </p>
          )}
        </div>
      </div>

      <Button variant="primary" href="/ads/new" className="w-full">
        <Icon name="plus" size={15} /> Create ad
      </Button>

      <nav aria-label="Ads Manager">
        <ul className="space-y-0.5">
          {NAV.map((n) => {
            const on = tab === n.id;
            const count = n.id === "ads" ? t.action || null : null;
            return (
              <li key={n.id}>
                <Link href={hrefOf(n.id)} scroll={false} onClick={(e) => { e.preventDefault(); softNavigate(hrefOf(n.id)); }} aria-current={on ? "page" : undefined} className={cx("flex h-10 items-center gap-3 rounded-control px-3 text-[14px] font-medium transition", on ? "bg-raised text-ink" : "text-ink-muted hover:bg-raised/60 hover:text-ink")}>
                  <Icon name={n.icon} size={17} />
                  {n.label}
                  {count && <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-ink">{count}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <section className="space-y-2.5 rounded-card border border-line bg-surface p-3.5" aria-label="Account summary">
        <p className="eyebrow">Account</p>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Running now</dt>
            <dd className="font-mono">{t.running}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">In review</dt>
            <dd className="font-mono">{t.waiting}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">Total spent</dt>
            <dd className="font-mono">{formatPrice(t.spent, "NGN")}</dd>
          </div>
        </dl>
      </section>
      <p className="mt-auto px-1 text-xs text-ink-muted">Ads are reviewed by the Klique team before they run, and always say &ldquo;Sponsored&rdquo;.</p>
    </div>
  );
}

/** On phones: the sections as a row of tabs, with Create ad. */
export function AdsMobileBar({ tab }: { tab: AdsTab }) {
  return (
    <div className="flex items-center gap-2">
      <div className="no-bar flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
        {NAV.map((n) => (
          <button key={n.id} type="button" onClick={() => softNavigate(hrefOf(n.id))} className={cx("h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-semibold", tab === n.id ? "border-transparent bg-accent text-accent-ink" : "border-line bg-surface text-ink-muted")}>
            {n.label}
          </button>
        ))}
      </div>
      <Button size="sm" variant="primary" href="/ads/new" aria-label="Create ad">
        <Icon name="plus" size={14} />
      </Button>
    </div>
  );
}

/* ------------------------------ actions ------------------------------ */

function useAdActions() {
  const router = useRouter();
  const toast = useToast();
  const { setData } = useMyAds();
  const [paying, setPaying] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<AdCampaignDTO | null>(null);

  async function pay(c: AdCampaignDTO) {
    setPaying(c.id);
    try {
      window.location.href = (await CampaignService.pay(c.id)).data.authorizationUrl;
    } catch (e) {
      toast(errorMessage(e), "error");
      setPaying(null);
    }
  }
  const menu = (c: AdCampaignDTO): MenuEntry[] => [
    ...(c.phase === "approved" && c.canPayOnline ? ([{ label: `Pay ${formatPrice(c.amount, c.currency)}`, icon: "ticket", onSelect: () => void pay(c) }] as MenuEntry[]) : []),
    ...(["pending", "changes", "rejected", "approved"].includes(c.phase) ? ([{ label: c.phase === "pending" ? "Edit" : "Change and resend", icon: "edit", onSelect: () => router.push(`/ads/new?edit=${c.id}`) }] as MenuEntry[]) : []),
    { label: "Run it again", icon: "copy", onSelect: () => router.push(`/ads/new?again=${c.id}`) },
    ...(["pending", "changes", "approved"].includes(c.phase) ? ([{ type: "sep" }, { label: "Cancel ad", icon: "x", danger: true, onSelect: () => setCancelling(c) }] as MenuEntry[]) : []),
  ];
  const confirm = (
    <ConfirmModal
      open={!!cancelling}
      onClose={() => setCancelling(null)}
      title="Cancel this ad?"
      description="It won't run, and you won't be charged."
      confirmLabel="Cancel ad"
      onConfirm={async () => {
        if (!cancelling) return;
        const res = await CampaignService.cancel(cancelling.id);
        setData((list) => (list ?? []).map((x) => (x.id === res.data.id ? res.data : x)));
        setCancelling(null);
        toast("Ad cancelled", "success");
      }}
    />
  );
  return { pay, paying, menu, confirm };
}

/* ------------------------------ overview ------------------------------ */

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-card border border-line bg-surface p-3.5 sm:p-4">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-1 truncate font-mono text-xl font-semibold tracking-tight sm:text-2xl">{value}</p>
      {hint && <p className="mt-0.5 hidden text-xs text-ink-muted sm:block">{hint}</p>}
    </div>
  );
}

export function AdsOverview({ list }: { list: AdCampaignDTO[] }) {
  const now = useNow();
  const t = totalsOf(list);
  const { pay, paying, confirm } = useAdActions();
  const attention = list.filter((c) => c.phase === "approved" || c.phase === "changes");
  if (!list.length) {
    return (
      <EmptyState icon="megaphone" title="Get in front of people looking for things to do" action={<Button variant="primary" href="/ads/new">Create your first ad</Button>}>
        Promote an event you host, a community you run, or your own business, on the homepage, the Events page and search.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-7">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Stat label="Running now" value={String(t.running)} />
        <Stat label="Views" value={t.views.toLocaleString("en-NG")} hint="Times your ads were shown" />
        <Stat label="Taps" value={t.taps.toLocaleString("en-NG")} hint="Times people tapped them" />
        <Stat label="Tap rate" value={rate(t.views, t.taps)} hint="Taps ÷ views" />
        <Stat label="Spent" value={formatPrice(t.spent, "NGN")} hint="All time" />
      </div>

      {attention.length > 0 && (
        <section aria-label="Needs your attention" className="space-y-2">
          <h2 className="text-base font-semibold">Needs your attention</h2>
          {attention.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-card border border-accent-text/50 bg-surface p-3.5">
              <Icon name={c.phase === "approved" ? "check" : "edit"} size={17} className="text-accent-text" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{c.title}</p>
                <p className="text-xs text-ink-muted">{c.phase === "approved" ? phaseLine(c, now) : `The Klique team asked for a change: ${c.reviewNote}`}</p>
              </div>
              {c.phase === "approved" && c.canPayOnline ? (
                <Button size="sm" variant="primary" loading={paying === c.id} onClick={() => void pay(c)}>
                  Pay {formatPrice(c.amount, c.currency)}
                </Button>
              ) : c.phase === "approved" ? (
                <span className="basis-full pl-8 text-xs text-ink-muted sm:basis-auto sm:pl-0">We&apos;ll contact you about paying by transfer.</span>
              ) : (
                <Button size="sm" href={`/ads/new?edit=${c.id}`}>
                  Change and resend
                </Button>
              )}
            </div>
          ))}
        </section>
      )}

      <section aria-label="Recent ads" className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Recent ads</h2>
          <button type="button" onClick={() => softNavigate("/ads?tab=ads")} className="text-sm font-semibold text-accent-text hover:underline">
            See all
          </button>
        </div>
        <AdsTable list={list.slice(0, 5)} />
      </section>
      {confirm}
    </div>
  );
}

/* ------------------------------ the table ------------------------------ */

const FILTERS: { id: "all" | "live" | "review" | "action" | "ended"; label: string; match: (p: AdCampaignPhase) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "live", label: "Running", match: (p) => p === "live" || p === "scheduled" },
  { id: "review", label: "In review", match: (p) => p === "pending" },
  { id: "action", label: "Needs action", match: (p) => p === "approved" || p === "changes" },
  { id: "ended", label: "Ended", match: (p) => p === "ended" || p === "rejected" || p === "cancelled" },
];

export function AdsTablePage({ list }: { list: AdCampaignDTO[] }) {
  const [f, setF] = useState<(typeof FILTERS)[number]["id"]>("all");
  const shown = list.filter((c) => FILTERS.find((x) => x.id === f)!.match(c.phase));
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Filter ads" className="no-bar flex gap-1.5 overflow-x-auto">
        {FILTERS.map((x) => {
          const n = list.filter((c) => x.match(c.phase)).length;
          return (
            <button key={x.id} type="button" role="tab" aria-selected={f === x.id} onClick={() => setF(x.id)} className={cx("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold", f === x.id ? "border-transparent bg-accent text-accent-ink" : "border-line bg-surface text-ink-muted hover:text-ink")}>
              {x.label}
              <span className="font-mono text-[11px] opacity-80">{n}</span>
            </button>
          );
        })}
      </div>
      {shown.length ? <AdsTable list={shown} /> : <p className="rounded-card border border-dashed border-line p-8 text-center text-sm text-ink-muted">No ads here.</p>}
    </div>
  );
}

/** Facebook-style ads table: one row per ad, its delivery status, schedule, results and cost. Cards on phones. */
export function AdsTable({ list }: { list: AdCampaignDTO[] }) {
  const now = useNow();
  const { menu, confirm } = useAdActions();
  const reachLabel = (c: AdCampaignDTO) => (c.reach === "world" ? "Everywhere" : c.placeLabel);
  const schedule = (c: AdCampaignDTO) => (c.startsAt && c.endsAt ? `${short(c.startsAt)} – ${short(c.endsAt)}` : `${c.days} ${c.days === 1 ? "day" : "days"}${c.startOn ? ` from ${short(c.startOn)}` : ""}`);
  const thumb = (c: AdCampaignDTO) => c.event?.coverImage ?? c.community?.coverImage ?? c.imageUrl;
  const actions = (c: AdCampaignDTO) => (
    <Dropdown
      items={menu(c)}
      align="right"
      label={`Actions for ${c.title}`}
      trigger={({ open, props }) => (
        <button {...props} aria-label={`Actions for ${c.title}`} className={cx("inline-flex size-8 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink", open && "bg-raised text-ink")}>
          <Icon name="more" size={16} />
        </button>
      )}
    />
  );
  return (
    <>
      {/* big screens: a table */}
      <div className="hidden overflow-x-auto rounded-card border border-line bg-surface md:block">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="border-b border-line text-[11px] font-bold tracking-[0.06em] text-ink-muted uppercase">
            <tr>
              <th className="px-4 py-3 font-bold">Ad</th>
              <th className="px-3 py-3 font-bold">Delivery</th>
              <th className="px-3 py-3 font-bold">Schedule</th>
              <th className="px-3 py-3 text-right font-bold">Views</th>
              <th className="px-3 py-3 text-right font-bold">Taps</th>
              <th className="px-3 py-3 text-right font-bold">Tap rate</th>
              <th className="px-3 py-3 text-right font-bold">Amount</th>
              <th className="w-12 px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((c) => (
              <tr key={c.id} className="align-middle hover:bg-raised/40">
                <td className="max-w-[20rem] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Cover src={thumb(c)} seed={c.id} interest="art" className="size-11 shrink-0 rounded-control" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{c.title}</p>
                      <p className="truncate text-xs text-ink-muted">
                        {c.kind === "event" ? "Event" : c.kind === "community" ? "Community" : "Your ad"} · {c.placements.map(placementLabel).join(", ")} · {reachLabel(c)}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <PhaseBadge phase={c.phase} />
                  {(c.phase === "changes" || c.phase === "rejected") && c.reviewNote && <p className="mt-1 max-w-[14rem] truncate text-xs text-ink-muted" title={c.reviewNote}>{c.reviewNote}</p>}
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-ink-muted">
                  {schedule(c)}
                  {c.phase === "live" && <p className="text-xs">{phaseLine(c, now).split(" · ")[1] ?? ""}</p>}
                </td>
                <td className="px-3 py-3 text-right font-mono">{c.status === "paid" ? c.impressions.toLocaleString("en-NG") : "–"}</td>
                <td className="px-3 py-3 text-right font-mono">{c.status === "paid" ? c.clicks.toLocaleString("en-NG") : "–"}</td>
                <td className="px-3 py-3 text-right font-mono">{c.status === "paid" ? rate(c.impressions, c.clicks) : "–"}</td>
                <td className="px-3 py-3 text-right font-mono whitespace-nowrap">{formatPrice(c.amount, c.currency)}</td>
                <td className="px-2 py-3">{actions(c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* phones: cards */}
      <ul className="space-y-2.5 md:hidden">
        {list.map((c) => (
          <li key={c.id} className="rounded-card border border-line bg-surface p-3.5">
            <div className="flex items-start gap-3">
              <Cover src={thumb(c)} seed={c.id} interest="art" className="size-12 shrink-0 rounded-control" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <PhaseBadge phase={c.phase} />
                  <span className="font-mono text-xs text-ink-muted">{formatPrice(c.amount, c.currency)}</span>
                </div>
              </div>
              {actions(c)}
            </div>
            <p className="mt-2 text-sm">{phaseLine(c, now)}</p>
            {c.status === "paid" && (
              <p className="mt-1 flex gap-4 font-mono text-xs text-ink-muted">
                <span>{c.impressions.toLocaleString("en-NG")} {c.impressions === 1 ? "view" : "views"}</span>
                <span>{c.clicks.toLocaleString("en-NG")} {c.clicks === 1 ? "tap" : "taps"}</span>
                <span>{rate(c.impressions, c.clicks)}</span>
              </p>
            )}
          </li>
        ))}
      </ul>
      {confirm}
    </>
  );
}

/* ------------------------------ billing ------------------------------ */

export function AdsBilling({ list }: { list: AdCampaignDTO[] }) {
  const paid = list.filter((c) => c.status === "paid").sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""));
  const due = list.filter((c) => c.phase === "approved");
  const total = paid.reduce((s, c) => s + c.amount, 0);
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Paid, all time" value={formatPrice(total, "NGN")} hint={`${paid.length} ${paid.length === 1 ? "ad" : "ads"}`} />
        <Stat label="Waiting for payment" value={formatPrice(due.reduce((s, c) => s + c.amount, 0), "NGN")} hint={due.length ? `${due.length} approved, not paid yet` : "Nothing due"} />
      </div>
      <section className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="border-b border-line text-[11px] font-bold tracking-[0.06em] text-ink-muted uppercase">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-3 py-3">Ad</th>
              <th className="px-3 py-3">Paid by</th>
              <th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {paid.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink-muted">
                  No payments yet.
                </td>
              </tr>
            ) : (
              paid.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-ink-muted">{c.paidAt ? short(c.paidAt) : "–"}</td>
                  <td className="max-w-[20rem] truncate px-3 py-3 font-medium">{c.title}</td>
                  <td className="px-3 py-3 text-ink-muted">{c.paymentMethod === "manual" ? "Bank transfer" : "Card (Paystack)"}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatPrice(c.amount, c.currency)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/* ------------------------------ help ------------------------------ */

export function AdsHelp() {
  const { data: p } = useApi(() => CampaignService.pricing(), [], { key: "ad-pricing" });
  const steps = [
    ["Create", "Pick what to promote, where on Klique it shows, who sees it, and for how many days. You see the price as you go."],
    ["Review", "The Klique team checks every ad, usually within a day. If something needs changing, you'll get a note."],
    ["Pay", "Once it's approved, pay by card (or bank transfer, if we've arranged that with you)."],
    ["Run", "It shows for the days you bought, marked \"Sponsored\". Views and taps update as it runs."],
    ["Finish", "We'll let you know the day before it ends, and send its results when it's done."],
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-3">
        <h2 className="text-base font-semibold">How it works</h2>
        <ol className="space-y-2.5">
          {steps.map(([t, d], i) => (
            <li key={t} className="flex gap-3 rounded-card border border-line bg-surface p-3.5">
              <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-xs font-bold text-accent-ink">{i + 1}</span>
              <span>
                <span className="block text-sm font-semibold">{t}</span>
                <span className="block text-sm text-ink-muted">{d}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Prices</h2>
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <ul className="divide-y divide-line text-sm">
            {AD_PLACEMENTS.map((pl) => (
              <li key={pl.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span>
                  <span className="block font-medium">{pl.label}</span>
                  <span className="block text-xs text-ink-muted">{pl.hint}</span>
                </span>
                <span className="font-mono whitespace-nowrap">{p ? `${formatPrice(p.perDay[pl.id], "NGN")}/day` : "…"}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-ink-muted">
          Reach: {AD_REACHES.map((r) => `${r.label.toLowerCase()} ×${p?.reach[r.id] ?? "…"}`).join(", ")}. Runs of {p?.minDays ?? 1} to {p?.maxDays ?? 30} days.
        </p>
      </section>
    </div>
  );
}
