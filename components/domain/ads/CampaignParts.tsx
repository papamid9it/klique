"use client";

import { Cover } from "@/components/ui/Cover";
import { cx } from "@/components/ui/cx";
import { ALL_AD_PLACEMENTS } from "@/lib/ads";
import { formatPrice } from "@/lib/format";
import type { AdCampaignDTO, AdCampaignPhase } from "@/lib/types";

const DAY = 24 * 60 * 60 * 1000;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Lagos" });

const PHASE: Record<AdCampaignPhase, { label: string; tone: "good" | "accent" | "bad" | "neutral" }> = {
  pending: { label: "Waiting for review", tone: "accent" },
  changes: { label: "Needs changes", tone: "bad" },
  rejected: { label: "Not approved", tone: "bad" },
  approved: { label: "Approved · pay to start", tone: "accent" },
  scheduled: { label: "Booked", tone: "accent" },
  live: { label: "Running", tone: "good" },
  ended: { label: "Ended", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const TONE = {
  good: "border-success/30 bg-success/10 text-success",
  accent: "border-transparent bg-accent/15 text-accent-text",
  bad: "border-danger/30 bg-danger/10 text-danger",
  neutral: "border-line bg-raised text-ink-muted",
};

export function PhaseBadge({ phase }: { phase: AdCampaignPhase }) {
  const p = PHASE[phase];
  return <span className={cx("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-semibold whitespace-nowrap", TONE[p.tone])}>{phase === "live" && <span className="size-1.5 animate-pulse rounded-full bg-current" />}{p.label}</span>;
}

/** One line on where the ad is and what happens next, in plain words. */
export function phaseLine(c: AdCampaignDTO, now: Date | null): string {
  const left = c.endsAt && now ? Math.max(0, Math.ceil((+new Date(c.endsAt) - +now) / DAY)) : null;
  switch (c.phase) {
    case "pending":
      return "An admin will look at it soon. You'll get a notification.";
    case "changes":
      return "Change it and send it again.";
    case "rejected":
      return "You can change it and send it again.";
    case "approved":
      return `Pay ${formatPrice(c.amount, c.currency)} to start it${c.startOn ? ` on ${day(c.startOn)}` : " straight away"}. It then runs for ${c.days} ${c.days === 1 ? "day" : "days"}.`;
    case "scheduled":
      return `Starts ${day(c.startsAt!)} · ends ${day(c.endsAt!)}`;
    case "live":
      return `Ends ${day(c.endsAt!)}${left !== null ? ` · ${left <= 1 ? "last day" : `${left} days left`}` : ""}`;
    case "ended":
      return `Ran ${day(c.startsAt!)} – ${day(c.endsAt!)}`;
    default:
      return "You cancelled this one.";
  }
}

export const placementLabel = (id: string) => ALL_AD_PLACEMENTS.find((p) => p.id === id)?.label ?? id;

/** What the ad will look like on Klique: picture, "Sponsored · who", headline, text, button. */
export function CampaignPreview({ c, className }: { c: Pick<AdCampaignDTO, "kind" | "advertiser" | "title" | "body" | "imageUrl" | "ctaLabel"> & { id?: string; event?: AdCampaignDTO["event"]; community?: AdCampaignDTO["community"] }; className?: string }) {
  const img = c.kind === "event" ? (c.event?.coverImage ?? c.imageUrl) : c.kind === "community" ? (c.community?.coverImage ?? c.imageUrl) : c.imageUrl;
  const who = c.kind === "event" ? "Promoted event" : c.advertiser || "Your name";
  return (
    <article className={cx("overflow-hidden rounded-card border border-line bg-surface", className)} aria-label="Ad preview">
      <Cover src={img} seed={c.id ?? c.title ?? "ad"} interest="art" className="aspect-[16/8] w-full" />
      <div className="space-y-1.5 p-3.5">
        <p className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Sponsored · {who}</p>
        <p className="text-[15px] leading-snug font-semibold">{c.title || "Your headline"}</p>
        {c.body && <p className="line-clamp-2 text-[13px] text-ink-muted">{c.body}</p>}
        <span className="mt-1 inline-flex h-8 items-center rounded-full bg-accent px-3.5 text-[13px] font-semibold text-accent-ink">{c.ctaLabel || "Learn more"}</span>
      </div>
    </article>
  );
}
