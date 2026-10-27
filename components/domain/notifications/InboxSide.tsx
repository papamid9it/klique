"use client";

import Link from "next/link";
import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { CrewService } from "@/app/services/CrewService";
import { EventService } from "@/app/services/EventService";
import { InboxService } from "@/app/services/InboxService";
import { SpaceService } from "@/app/services/SpaceService";
import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { UserName } from "@/components/ui/UserName";
import { formatTime } from "@/lib/format";
import { useApi, useNow } from "@/lib/hooks/useApi";
import type { UserBrief } from "@/lib/types";

const lagosDay = (d: Date | string) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

function Box({ title, children, icon }: { title: string; icon: Parameters<typeof Icon>[0]["name"]; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <h2 className="mb-3 flex items-center gap-2 text-[14px] font-semibold">
        <Icon name={icon} size={15} className="text-accent-text" /> {title}
      </h2>
      {children}
    </section>
  );
}

/** One request with Accept / Decline right there (or a link instead of Decline, when declining needs more). */
function Ask({ user, line, message, onYes, onNo, yes = "Accept", no = "Decline", noHref }: { user: UserBrief; line: string; message: string; onYes: () => Promise<unknown>; onNo?: () => Promise<unknown>; yes?: string; no?: string; noHref?: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const run = async (which: "yes" | "no") => {
    setBusy(which);
    try {
      await (which === "yes" ? onYes() : onNo?.());
      setDone(which === "yes" ? (yes === "Accept" ? "Accepted" : `${yes}d`) : "Declined");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };
  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2.5">
        <ProfileTrigger handle={user.handle} className="shrink-0 rounded-full">
          <Avatar name={user.displayName} src={user.avatarUrl} frame={user.avatarFrame} size={32} />
        </ProfileTrigger>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-snug">
            <ProfileTrigger handle={user.handle} className="font-semibold hover:underline">
              <UserName name={user.displayName} effect={user.nameEffect} />
            </ProfileTrigger>{" "}
            <span className="text-ink-muted">{line}</span>
          </p>
          {message && <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-muted">&ldquo;{message}&rdquo;</p>}
          <div className="mt-2 flex gap-1.5">
            {done ? (
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-muted">
                <Icon name="check" size={12} /> {done}
              </span>
            ) : (
              <>
                <Button size="sm" variant="primary" loading={busy === "yes"} onClick={() => void run("yes")}>
                  {yes}
                </Button>
                {noHref ? (
                  <Button size="sm" href={noHref}>
                    {no}
                  </Button>
                ) : (
                  <Button size="sm" loading={busy === "no"} onClick={() => void run("no")}>
                    {no}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * The right column of Notifications on wide screens: requests waiting on you (answered right here), your events
 * today and tomorrow, and a way to the notification settings.
 */
export function InboxSide() {
  const pending = useApi(() => InboxService.pending(), [], { key: "inbox:pending" });
  const going = useApi(() => EventService.list({ scope: "going" }), [], { key: "inbox:going" });
  const now = useNow(60_000);
  const today = now ? lagosDay(now) : "";
  const tomorrow = now ? lagosDay(new Date(now.getTime() + 86_400_000)) : "";
  const soon = now ? (going.data?.items ?? []).filter((e) => [today, tomorrow].includes(lagosDay(e.startsAt))).slice(0, 5) : [];
  const p = pending.data;
  const asks = (p?.crewRequests.length ?? 0) + (p?.communityRequests.length ?? 0) + (p?.eventReviews.length ?? 0);

  return (
    <aside className="hidden space-y-4 xl:block" aria-label="Summary">
      <div className="sticky top-8 space-y-4">
        <Box title={asks ? `Needs your answer · ${asks}` : "Needs your answer"} icon="userplus">
          {pending.loading && !p ? (
            <Skeleton className="h-16" />
          ) : !asks ? (
            <p className="text-[13px] text-ink-muted">Nothing waiting on you. Requests to join your crews and communities show up here.</p>
          ) : (
            <ul className="divide-y divide-line">
              {p!.crewRequests.map((r) => (
                <Ask key={`c${r.crewId}${r.user.id}`} user={r.user} line={`wants to join your crew from ${r.area}${r.eventTitle ? ` to ${r.eventTitle}` : ""}`} message={r.message} onYes={() => CrewService.decide(r.crewId, r.user.id, true)} onNo={() => CrewService.decide(r.crewId, r.user.id, false)} />
              ))}
              {p!.communityRequests.map((r) => (
                <Ask key={`m${r.requestId}`} user={r.user} line={`wants to join ${r.communityName}`} message={r.message} onYes={() => SpaceService.decideRequest(r.slug, r.requestId, "approve")} onNo={() => SpaceService.decideRequest(r.slug, r.requestId, "reject")} />
              ))}
              {p!.eventReviews.map((r) => (
                <Ask key={`e${r.eventId}`} user={r.user} line={`sent an event for ${r.communityName}`} message={r.title} yes="Approve" no="Review" noHref={`/events/${r.eventId}`} onYes={() => EventService.review(r.eventId, "approve")} />
              ))}
            </ul>
          )}
        </Box>

        <Box title="Coming up" icon="calendar">
          {going.loading && !going.data ? (
            <Skeleton className="h-14" />
          ) : soon.length ? (
            <ul className="space-y-1">
              {soon.map((e) => (
                <li key={e.id}>
                  <Link href={`/events/${e.id}`} className="flex items-center gap-2.5 rounded-control px-1.5 py-1.5 hover:bg-raised">
                    <span className="inline-flex h-9 w-14 shrink-0 flex-col items-center justify-center rounded-[10px] bg-raised font-mono text-[10px] leading-tight text-ink-muted">
                      <span className="font-semibold text-ink">{lagosDay(e.startsAt) === today ? "Today" : "Tmrw"}</span>
                      {formatTime(e.startsAt)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold">{e.title}</span>
                      <span className="block truncate text-[11.5px] text-ink-muted">{e.online ? "Online" : e.venue}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-muted">
              Nothing today or tomorrow.{" "}
              <Link href="/events" className="font-semibold text-accent-text hover:underline">
                Find something
              </Link>
            </p>
          )}
        </Box>

        <Link href="/settings#notifications" className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 transition hover:bg-raised/60">
          <span className="inline-flex size-9 items-center justify-center rounded-full bg-raised text-accent-text">
            <Icon name="sliders" size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold">Notification settings</span>
            <span className="block text-[12px] text-ink-muted">Choose what reaches you, here and on your phone.</span>
          </span>
          <Icon name="chevron-right" size={16} className="text-ink-muted" />
        </Link>
      </div>
    </aside>
  );
}

/** A quiet bell with a few sparkles: for a filter with nothing in it. */
export function InboxEmptyArt() {
  return (
    <svg width="120" height="96" viewBox="0 0 120 96" fill="none" aria-hidden="true" className="mx-auto text-ink-muted">
      <circle cx="60" cy="50" r="40" fill="currentColor" opacity="0.06" />
      <path d="M60 22c-11 0-19 8.5-19 19.5V55l-6 9h50l-6-9V41.5C79 30.5 71 22 60 22Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" opacity="0.7" />
      <path d="M53 68a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
      <path d="M93 22v8M89 26h8M24 30v6M21 33h6M98 60v5M95.5 62.5h5" stroke="var(--accent-text)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
