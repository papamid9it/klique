"use client";

import Link from "next/link";
import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { EventService } from "@/app/services/EventService";
import { DesktopPrompt } from "@/components/domain/DesktopPrompt";
import { JoinButton } from "@/components/domain/JoinButton";
import { HeaderIcons } from "@/components/layout/HeaderIcons";
import { PlansCard, RailFooter, RailSearch } from "@/components/layout/RightRail";
import { crewHref } from "@/components/domain/crews/parts";
import { useToast } from "@/components/providers/ToastProvider";
import { Cover } from "@/components/ui/Cover";
import { cx } from "@/components/ui/cx";
import { communityNews } from "@/lib/constants";
import { eventPhoto } from "@/lib/fake";
import { compactCount, dateChip, formatDateShort, formatTime, relativeStamp } from "@/lib/format";
import { useNow } from "@/lib/hooks/useApi";
import { useHomeKliques } from "./useHomeKliques";
import type { CommunityCardDTO, EventDTO, MyCommunityDTO } from "@/lib/types";

/** small mono uppercase label */
const LABEL = "font-mono text-[11px] tracking-[.14em] text-ink-muted uppercase";
/** a mono "SEE ALL →" link */
const MORE = "mt-3 inline-block font-mono text-[11px] tracking-[.12em] text-ink uppercase underline underline-offset-4 hover:text-ink-muted";
const ROW = "flex min-h-11 items-center gap-3 border-b border-line py-2";

/**
 * Communities home on big screens, "city poster": a huge "LAGOS THIS WEEK" with a few counts, the featured event as
 * a poster beside the next four, then your communities and communities for you; kliques, the desktop app and plans
 * sit in the right panel (CityPosterRail), or under the poster below 1280px.
 * Square corners, mono labels and 1px lines, in the mood's colours. Phones keep the plain layout.
 */
export function CityPoster({
  events,
  loading,
  onChange,
  weekCount,
  forming,
  mine,
  mineLoading,
  suggested,
}: {
  events: EventDTO[];
  loading: boolean;
  onChange: () => void;
  /** events here in the next 7 days (null: not known) */
  weekCount: number | null;
  /** kliques heading to this week's events */
  forming: number;
  mine: MyCommunityDTO[];
  mineLoading: boolean;
  suggested: CommunityCardDTO[];
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState<Record<string, CommunityCardDTO>>({});
  const top = events[0];
  // the next four after the featured one, by date
  const next = events
    .slice(1)
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))
    .slice(0, 4);

  // counts we already have: events this week, kliques heading to them, your communities with something new this week
  const now = useNow();
  const weekAgo = now ? +now - 7 * 24 * 60 * 60 * 1000 : Infinity;
  const active = mine.filter((c) => c.unreadCount > 0 || c.mentions > 0 || (!!c.lastActivityAt && +new Date(c.lastActivityAt) > weekAgo)).length;
  const stats = [
    weekCount ? `${weekCount} ${weekCount === 1 ? "event" : "events"}` : null,
    forming ? `${forming} ${forming === 1 ? "klique" : "kliques"} forming` : null,
    mine.length && active ? `${active} of your communities active` : null,
  ].filter(Boolean);

  async function going(e: EventDTO) {
    setBusy(true);
    try {
      await EventService.rsvp(e.id);
      onChange();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hidden lg:block">
      {/* the heading, with the counts on the right */}
      <header className="flex items-end gap-6 border-b border-line pb-5">
        <h1 className="min-w-0 flex-1 font-display text-[clamp(48px,6vw,96px)] leading-[.86] font-black tracking-[-0.025em] text-ink uppercase">
          This week
        </h1>
        {stats.length > 0 && (
          <ul className="shrink-0 space-y-1.5 pb-1 text-right font-mono text-[11px] tracking-[.12em] text-ink-muted uppercase">
            {stats.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
      </header>

      {/* the featured event as a poster, the next four beside it */}
      <div className="mt-6 grid gap-6 min-[1440px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {loading && !top ? (
          <div className="skeleton h-[420px] !rounded-hero" aria-hidden="true" />
        ) : !top ? (
          <div data-hero="" className="flex h-[420px] flex-col items-start justify-end gap-3 border border-line p-8">
            <p className={LABEL}>Nothing coming up yet</p>
            <p className="max-w-sm text-sm text-ink-muted">Events from your communities and your city show here.</p>
            <Link href="/events" className="inline-flex h-11 items-center rounded-control bg-accent px-5 text-sm font-bold text-accent-ink">
              Find events
            </Link>
          </div>
        ) : (
          <article data-hero="" className="relative h-[420px] overflow-hidden bg-black">
            <Link href={`/events/${top.id}`} aria-label={top.title} className="absolute inset-0">
              <Cover src={eventPhoto(top.id, top.coverImage)} seed={top.id} interest={top.interest} className="absolute inset-0 !rounded-none" />
              <span aria-hidden className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,.88)_0%,rgba(0,0,0,.45)_38%,transparent_68%)]" />
            </Link>
            <span className="pointer-events-none absolute top-4 left-4 rounded-control bg-white px-2 py-1 font-mono text-[11px] tracking-[.08em] text-black uppercase">{formatDateShort(top.startsAt)}</span>
            <div className="pointer-events-none absolute inset-x-6 bottom-6 flex flex-wrap items-end gap-x-6 gap-y-4 text-white">
              <div className="min-w-0 flex-[1_1_320px]">
                <h2 className="line-clamp-2 font-display text-[clamp(30px,3.2vw,48px)] leading-[.92] font-black tracking-[-0.02em] uppercase">{top.title}</h2>
                <p className="mt-2 truncate text-sm text-white/80">{[!top.online && top.venue, top.community?.name, `${top.goingCount} going`].filter(Boolean).join(" · ")}</p>
              </div>
              {top.viewer.rsvp === "going" ? (
                <Link href={`/events/${top.id}`} className="pointer-events-auto inline-flex h-11 shrink-0 items-center rounded-control border border-white/70 px-5 text-sm font-bold text-white">
                  You&apos;re going
                </Link>
              ) : (
                <button type="button" disabled={busy} onClick={() => void going(top)} className="pointer-events-auto inline-flex h-11 shrink-0 items-center rounded-control bg-accent px-5 text-sm font-bold text-accent-ink transition hover:opacity-90 disabled:opacity-60">
                  I&apos;m going
                </button>
              )}
            </div>
          </article>
        )}

        <section aria-label="Next events" className="min-w-0">
          {loading && !top ? (
            <div className="space-y-px">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-[88px] !rounded-card" />
              ))}
            </div>
          ) : next.length ? (
            <ol className="border-t border-line">
              {next.map((e) => {
                const d = dateChip(e.startsAt, e.timeZone);
                return (
                  <li key={e.id}>
                    <Link href={`/events/${e.id}`} className="group flex items-center gap-4 border-b border-line py-4 pr-1">
                      <span className="w-12 shrink-0 font-display text-[34px] leading-none font-black text-ink-muted/60 tabular-nums">{Number(d.day)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold group-hover:underline">{e.title}</span>
                        <span className="block truncate text-[13px] text-ink-muted">
                          {d.weekday} {formatTime(e.startsAt, e.timeZone)} · {e.goingCount} going
                        </span>
                      </span>
                      <Cover src={eventPhoto(e.id, e.coverImage)} seed={e.id} interest={e.interest} className="size-14 shrink-0 !rounded-control" />
                    </Link>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="border-y border-line py-4 text-sm text-ink-muted">No more events this week.</p>
          )}
          <Link href="/events" className={MORE}>
            All events →
          </Link>
        </section>
      </div>

      {/* your communities · communities for you · kliques */}
      <div className="mt-10 grid grid-cols-2 gap-x-8 gap-y-10 border-t border-line pt-6">
        <section aria-labelledby="poster-yours" className="min-w-0">
          <h2 id="poster-yours" className={`${LABEL} mb-2`}>
            Your communities
          </h2>
          {mineLoading && !mine.length ? (
            <div className="skeleton h-32 !rounded-card" aria-hidden="true" />
          ) : mine.length ? (
            <ul>
              {mine.slice(0, 3).map((c) => (
                <li key={c.id}>
                  <Link href={`/communities/${c.slug}`} className={cx(ROW, "hover:text-ink")}>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.name}</span>
                    <span className={cx("shrink-0 font-mono text-[11px] tracking-[.08em] uppercase", c.mentions || c.unreadCount ? "text-accent-text" : "text-ink-muted")}>
                      {communityNews(c) ?? (c.lastActivityAt ? `Active ${relativeStamp(c.lastActivityAt)}` : "Quiet")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-b border-line py-3 text-sm text-ink-muted">Join a few and they&apos;ll show here.</p>
          )}
          <Link href="/communities" className={MORE}>
            See all →
          </Link>
        </section>

        <section aria-labelledby="poster-for-you" className="min-w-0">
          <h2 id="poster-for-you" className={`${LABEL} mb-2`}>
            Communities for you
          </h2>
          {suggested.length ? (
            <ul>
              {suggested.slice(0, 4).map((c) => (
                <li key={c.id} className={ROW}>
                  <Link href={`/communities/${c.slug}`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline">
                    {c.name}
                  </Link>
                  {c.memberCount != null && <span className="shrink-0 text-[13px] text-ink-muted tabular-nums">{compactCount(c.memberCount)}</span>}
                  {/* the usual join rules (public, request, points), drawn as a square outlined button */}
                  <span className="shrink-0 [&_button]:!h-8 [&_button]:!rounded-control [&_button]:!border [&_button]:!border-ink [&_button]:!bg-transparent [&_button]:!px-3 [&_button]:!text-[13px] [&_button]:!font-semibold [&_button]:!text-ink [&_button]:!shadow-none [&_span[role=img]]:!rounded-none">
                    <JoinButton community={joined[c.id] ?? c} onChange={(n) => setJoined((j) => ({ ...j, [c.id]: n }))} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-b border-line py-3 text-sm text-ink-muted">You&apos;re in every community here.</p>
          )}
        </section>

        {/* big screens: in the right panel instead */}
        <PosterKliques className="xl:hidden" />
      </div>

      {/* below 1280px there's no right panel: the desktop app and plans come here */}
      <div className="mt-10 grid grid-cols-2 items-start gap-4 *:!rounded-card xl:hidden">
        <DesktopPrompt />
        <PlansCard />
      </div>
      <RailFooter className="mt-6 xl:hidden" />
    </div>
  );
}

/** Kliques: yours first, then ones to join, each with n/max in the accent colour; then Start a klique. */
function PosterKliques({ className }: { className?: string }) {
  const { forYou } = useHomeKliques();
  return (
    <section aria-labelledby="poster-kliques" className={cx("min-w-0", className)}>
      <h2 id="poster-kliques" className={`${LABEL} mb-2`}>
        Kliques
      </h2>
      {forYou.length ? (
        <ul>
          {forYou.slice(0, 3).map((k) => (
            <li key={k.id}>
              <Link href={crewHref(k)} className={ROW}>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline">{k.title}</span>
                <span className="shrink-0 font-mono text-[12px] text-accent-text tabular-nums">
                  {k.memberCount}/{k.maxMembers}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-b border-line py-3 text-sm text-ink-muted">No kliques yet</p>
      )}
      <Link href="/kliques?start=1" className="mt-4 flex h-11 items-center justify-center rounded-control bg-ink text-sm font-bold text-canvas transition hover:opacity-90">
        Start a klique
      </Link>
    </section>
  );
}

/**
 * Communities home's right panel (1280px and wider): kliques, the desktop app (website only) and plans, with the
 * "built for your city" line pinned at the bottom. Narrower screens show these under the poster instead.
 */
export function CityPosterRail() {
  return (
    <aside aria-label="Kliques and more" className="sticky top-0 hidden h-dvh flex-col border-l border-line xl:flex">
      <div className="no-bar flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pt-7 pb-4 [&>*]:shrink-0">
        {/* search, then Notifications and Messages, at the top (the left panel's search steps aside here) */}
        <div className="flex items-center gap-1">
          <RailSearch placeholder="Search Klique" />
          <HeaderIcons />
        </div>
        <PosterKliques />
        {/* the shared cards, with the poster's square corners */}
        <div className="flex flex-col gap-4 *:!rounded-card">
          <DesktopPrompt />
          <PlansCard />
        </div>
      </div>
      <RailFooter className="shrink-0 px-6 pt-3 pb-7" />
    </aside>
  );
}
