"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AdService } from "@/app/services/AdService";
import { ReportDialog } from "@/components/domain/ReportDialog";
import { usePlace } from "@/components/providers/PlaceProvider";
import { cx } from "@/components/ui/cx";
import { Cover } from "@/components/ui/Cover";
import { Icon } from "@/components/ui/Icon";
import { formatDateShort } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import { placeShort } from "@/lib/places";
import type { AdDTO, AdSlot } from "@/lib/types";

/*
 * Ads, always marked "Sponsored" (or "Promoted" for events) with who paid, and reportable. Chosen by place,
 * scene and search words only. Three shapes: a card (event grids), a row (events list) and a box (side columns).
 */

/** Fetch the ad(s) for one spot; empty while loading or when nothing fits, so the page never waits on ads. */
export function useAds(slot: AdSlot, ctx: { interest?: string; q?: string; exclude?: string; count?: number } = {}, enabled = true) {
  return useAdSlot(slot, ctx, enabled).ads;
}

/** Same, plus whether the answer is in: for a spot that would otherwise swap from one thing to another. */
export function useAdSlot(slot: AdSlot, ctx: { interest?: string; q?: string; exclude?: string; count?: number } = {}, enabled = true) {
  const { where } = usePlace();
  // kept per slot, so coming back to a page doesn't shuffle its ads in late (and move what's on screen)
  const { data, loading } = useApi(enabled ? () => AdService.forSlot(slot, { where, ...ctx }) : null, [slot, where, ctx.interest, ctx.q, ctx.exclude, ctx.count, enabled], { key: `ads:${slot}:${where}:${ctx.interest ?? ""}:${ctx.q ?? ""}:${ctx.exclude ?? ""}:${ctx.count ?? 1}` });
  return { ads: data ?? [], ready: !enabled || !loading };
}

const subline = (ad: AdDTO) => (ad.event ? `${formatDateShort(ad.event.startsAt)} · ${ad.event.online ? "Online" : ad.event.venue || placeShort(ad.event)}` : ad.body);

/** Where the ad leads: the event page for promoted events, the advertiser's site for brand ads. */
function AdLink({ ad, className, children, label }: { ad: AdDTO; className?: string; children: React.ReactNode; label?: string }) {
  const onClick = () => AdService.click(ad.id);
  if (ad.community)
    return (
      <Link href={`/communities/${ad.community.slug}`} onClick={onClick} className={className} aria-label={label}>
        {children}
      </Link>
    );
  if (ad.event)
    return (
      <Link href={`/events/${ad.event.id}`} onClick={onClick} className={className} aria-label={label}>
        {children}
      </Link>
    );
  return (
    <a href={ad.url ?? "#"} target="_blank" rel="noopener noreferrer sponsored" onClick={onClick} className={className} aria-label={label}>
      {children}
    </a>
  );
}

function Label({ ad, onReport }: { ad: AdDTO; onReport: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="eyebrow min-w-0 truncate">
        {ad.event ? "Promoted" : "Sponsored"}
        {ad.advertiser ? ` · ${ad.advertiser}` : ""}
      </p>
      <button type="button" onClick={onReport} className="shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] text-ink-muted hover:bg-raised hover:text-ink" aria-label={`Report this ad from ${ad.advertiser || "this advertiser"}`}>
        Ad · Report
      </button>
    </div>
  );
}

/**
 * Count one view when at least half the ad has been on screen (so a hidden side column, or an ad fetched and then
 * replaced, never counts). Previews in the editors have no real id and are never counted.
 */
function useSeen<T extends HTMLElement>(id: string) {
  const ref = useRef<T>(null);
  const counted = useRef<string | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || counted.current === id || !/^[a-f0-9]{24}$/.test(id) || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || counted.current === id) return;
        counted.current = id;
        AdService.view(id);
        io.disconnect();
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [id]);
  return ref;
}

function useReport(ad: AdDTO) {
  const [open, setOpen] = useState(false);
  return {
    open: () => setOpen(true),
    dialog: <ReportDialog open={open} onClose={() => setOpen(false)} targetType="ad" targetId={ad.id} subject="this ad" />,
  };
}

function Art({ ad, className }: { ad: AdDTO; className?: string }) {
  return ad.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={ad.imageUrl} alt="" className={cx("object-cover", className)} loading="lazy" />
  ) : (
    <div className={cx("flex items-center justify-center bg-raised text-ink-muted", className)}>
      <Icon name={ad.event ? "calendar" : "megaphone"} size={22} />
    </div>
  );
}

/** Same footprint as an event card, for the home feed and search results. */
export function SponsoredCard({ ad }: { ad: AdDTO }) {
  const report = useReport(ad);
  const seen = useSeen<HTMLElement>(ad.id);
  return (
    <article ref={seen} className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
      <AdLink ad={ad} className="block" label={ad.title}>
        <Art ad={ad} className="aspect-[16/9] w-full" />
      </AdLink>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex-1">
          <Label ad={ad} onReport={report.open} />
          <h3 className="mt-1.5 text-[17px] leading-snug font-semibold tracking-[-0.02em]">
            <AdLink ad={ad} className="hover:underline">
              {ad.title}
            </AdLink>
          </h3>
          {subline(ad) && <p className="mt-1.5 line-clamp-2 text-[13px] text-ink-muted">{subline(ad)}</p>}
        </div>
        <div className="mt-3.5 flex justify-end border-t border-line pt-3">
          <AdLink ad={ad} className="inline-flex h-8 items-center gap-1 rounded-full bg-ink px-3.5 text-[13px] font-semibold text-canvas hover:opacity-90">
            {ad.ctaLabel} <Icon name="arrowdown" size={12} className="-rotate-[135deg]" />
          </AdLink>
        </div>
      </div>
      {report.dialog}
    </article>
  );
}

/** Same footprint as an event row, for the events list. */
export function SponsoredRow({ ad }: { ad: AdDTO }) {
  const report = useReport(ad);
  const seen = useSeen<HTMLElement>(ad.id);
  return (
    <article ref={seen} className="flex items-center gap-3.5 rounded-card border border-line bg-surface p-3 sm:gap-4 sm:p-3.5">
      <AdLink ad={ad} className="shrink-0" label={ad.title}>
        <Art ad={ad} className="size-14 rounded-xl sm:size-[4.5rem]" />
      </AdLink>
      <div className="min-w-0 flex-1">
        <Label ad={ad} onReport={report.open} />
        <h3 className="mt-0.5 truncate text-[16px] font-semibold tracking-[-0.02em]">
          <AdLink ad={ad} className="hover:underline">
            {ad.title}
          </AdLink>
        </h3>
        {subline(ad) && <p className="mt-0.5 truncate text-[12.5px] text-ink-muted">{subline(ad)}</p>}
      </div>
      <AdLink ad={ad} className="hidden h-9 shrink-0 items-center rounded-full border border-line px-3.5 text-[13px] font-semibold hover:bg-raised sm:inline-flex">
        {ad.ctaLabel}
      </AdLink>
      {report.dialog}
    </article>
  );
}

/** A compact box for side columns (home rail, event page). */
export function SponsoredBox({ ad, image = true }: { ad: AdDTO; image?: boolean }) {
  const report = useReport(ad);
  const seen = useSeen<HTMLElement>(ad.id);
  return (
    <section ref={seen} aria-label="Sponsored" className="rounded-card border border-line bg-surface p-4">
      {image && ad.imageUrl && (
        <AdLink ad={ad} className="mb-3 block" label={ad.title}>
          <Art ad={ad} className="aspect-[2/1] w-full rounded-xl" />
        </AdLink>
      )}
      <Label ad={ad} onReport={report.open} />
      <p className="mt-1.5 text-[15px] leading-snug font-semibold">
        <AdLink ad={ad} className="hover:underline">
          {ad.title}
        </AdLink>
      </p>
      {subline(ad) && <p className="mt-1 text-[12.5px] text-ink-muted">{subline(ad)}</p>}
      <AdLink ad={ad} className="mt-3 inline-flex h-8 items-center rounded-full bg-ink px-3.5 text-[13px] font-semibold text-canvas hover:opacity-90">
        {ad.ctaLabel}
      </AdLink>
      {report.dialog}
    </section>
  );
}

/** A sponsored community on the Communities page ("Sponsored communities"): a card like the others, marked Sponsored. */
export function SponsoredCommunity({ ad }: { ad: AdDTO }) {
  const report = useReport(ad);
  const seen = useSeen<HTMLElement>(ad.id);
  const c = ad.community;
  if (!c) return null;
  return (
    <article ref={seen} className="flex flex-col overflow-hidden rounded-card border border-line bg-surface transition hover:border-ink-muted/50">
      <AdLink ad={ad} className="block" label={`${c.name}, sponsored community`}>
        <Cover src={ad.imageUrl ?? c.coverImage} seed={c.id} interest={c.interest} className="aspect-[16/9]" />
      </AdLink>
      <div className="flex flex-1 flex-col p-4">
        <Label ad={ad} onReport={report.open} />
        <h3 className="mt-1.5 text-[17px] leading-snug font-semibold tracking-[-0.02em]">
          <AdLink ad={ad} className="hover:underline">
            {c.name}
          </AdLink>
        </h3>
        {ad.body && <p className="mt-1 line-clamp-2 text-[13px] text-ink-muted">{ad.body}</p>}
        <div className="mt-3.5 flex items-center justify-between border-t border-line pt-3">
          <span className="font-mono text-[11px] text-ink-muted">{c.memberCount.toLocaleString("en-NG")} members</span>
          <AdLink ad={ad} className="inline-flex h-8 items-center gap-1 rounded-full bg-ink px-3.5 text-[13px] font-semibold text-canvas hover:opacity-90">
            {ad.ctaLabel}
          </AdLink>
        </div>
      </div>
      {report.dialog}
    </article>
  );
}
