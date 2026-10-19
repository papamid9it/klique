"use client";

import { placeLabel } from "@/lib/places";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ProfileService } from "@/app/services/ProfileService";
import { Avatar } from "@/components/ui/Avatar";
import { InterestChip } from "@/components/ui/Chip";
import { cx } from "@/components/ui/cx";
import { Cover } from "@/components/ui/Cover";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { getInterest } from "@/lib/constants";
import { compactCount, dateChip } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import type { CommunityCardDTO, EventDTO, UserBrief } from "@/lib/types";
import { longDate, monthYear, ProfileActions, ProfileBanner, useMutualCommunities } from "./ProfileParts";
import { UserName } from "@/components/ui/UserName";

type Tab = "activity" | "friends" | "communities";

function CommunityListRow({ c, onNavigate }: { c: CommunityCardDTO; onNavigate: () => void }) {
  return (
    <Link href={`/communities/${c.slug}`} onClick={onNavigate} className="flex items-center gap-3.5 rounded-card border border-line bg-surface p-3 transition hover:bg-raised">
      <span className="relative block size-12 shrink-0 overflow-hidden rounded-xl">
        <Cover src={c.coverImage} seed={c.id} interest={c.interest} className="size-full" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <span className="truncate">{c.name}</span>
          {c.privacy === "private" && <Icon name="lock" size={12} className="shrink-0 text-ink-muted" />}
        </span>
        <span className="eyebrow mt-0.5 block truncate">
          {getInterest(c.interest).short} · {c.memberCount === null ? "Private" : `${compactCount(c.memberCount)} members`}
        </span>
      </span>
      <Icon name="chevron-right" size={15} className="shrink-0 text-ink-muted" />
    </Link>
  );
}

function EventListRow({ e, onNavigate }: { e: EventDTO; onNavigate: () => void }) {
  const d = dateChip(e.startsAt);
  return (
    <Link href={`/events/${e.id}`} onClick={onNavigate} className="flex items-center gap-3.5 rounded-card border border-line bg-surface p-3 transition hover:bg-raised">
      <span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-raised leading-none">
        <span className="eyebrow text-[9px]">{d.month}</span>
        <span className="mt-0.5 text-lg font-semibold">{d.day}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{e.title}</span>
        <span className="mt-0.5 block truncate text-[12px] text-ink-muted">{[e.venue, e.neighborhood].filter(Boolean).join(" · ")}</span>
      </span>
    </Link>
  );
}

function PersonListRow({ u, onOpen }: { u: UserBrief; onOpen: (handle: string) => void }) {
  return (
    <button type="button" onClick={() => onOpen(u.handle)} className="flex w-full items-center gap-3.5 rounded-card border border-line bg-surface p-3 text-left transition hover:bg-raised">
      <Avatar name={u.displayName} src={u.avatarUrl} frame={u.avatarFrame} size={44} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold"><UserName name={u.displayName} effect={u.nameEffect} /></span>
        <span className="block truncate font-mono text-[11px] text-ink-muted">@{u.handle}</span>
      </span>
      <Icon name="chevron-right" size={15} className="shrink-0 text-ink-muted" />
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-card border border-dashed border-line p-6 text-center text-sm text-ink-muted">{children}</p>;
}

/** The big profile: identity + actions on the left, Activity / Mutual friends / Mutual communities on the right. */
function ProfileBody({ handle, onClose, onOpenPerson }: { handle: string; onClose: () => void; onOpenPerson: (handle: string) => void }) {
  const { data: view, loading, status, setData, reload } = useApi(() => ProfileService.get(handle), [handle]);
  const mutual = useMutualCommunities(view);
  const [tab, setTab] = useState<Tab>("activity");

  if (loading) {
    return (
      <div className="space-y-4 p-6" aria-busy="true">
        <Skeleton className="h-28 rounded-card" />
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (!view) {
    return (
      <div className="p-10 text-center">
        <h2 className="text-lg font-semibold">{status === 404 ? "Person not found" : "Couldn't load this profile"}</h2>
        <p className="mt-1 text-sm text-ink-muted">{status === 404 ? `We couldn't find anyone with the handle @${handle}.` : "Try again in a moment."}</p>
      </div>
    );
  }

  const p = view.profile;
  const place = [p.neighborhood, placeLabel(p)].filter(Boolean).join(", ");
  const tabs: { id: Tab; label: string }[] = [
    { id: "activity", label: "Activity" },
    ...(view.isSelf ? [] : [{ id: "friends" as const, label: view.mutualFriends.length ? `Mutual friends · ${view.mutualFriends.length}` : "Mutual friends" }]),
    { id: "communities", label: view.isSelf ? `Communities · ${view.communities.length}` : mutual.length ? `Mutual communities · ${mutual.length}` : "Mutual communities" },
  ];
  const upcoming = view.upcomingEvents;

  return (
    <div className="flex max-h-[88dvh] flex-col overflow-y-auto md:min-h-[28rem] md:flex-row md:overflow-hidden">
      {/* ------------------------------ identity ------------------------------ */}
      <aside className="shrink-0 border-b border-line bg-raised/40 md:w-[19rem] md:overflow-y-auto md:border-r md:border-b-0">
        <ProfileBanner handle={p.handle} bannerUrl={p.bannerUrl} bannerColor={p.bannerColor} className="h-24" />
        <div className="px-5 pb-5">
          <span className="-mt-11 inline-block rounded-full bg-surface p-1.5">
            <Avatar name={p.displayName} src={p.avatarUrl} frame={p.avatarFrame} size={88} />
          </span>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] break-words"><UserName name={p.displayName} effect={p.nameEffect} /></h2>
          <p className="font-mono text-[13px] text-ink-muted">@{p.handle}</p>

          <div className="mt-4">
            <ProfileActions view={view} layout="stack" onFriendship={(friendship) => setData((d) => (d ? { ...d, friendship } : d))} onReload={() => void reload()} onNavigate={onClose} />
          </div>

          {view.visible ? (
            <div className="mt-5 space-y-4 rounded-card border border-line bg-surface p-4">
              {p.bio && (
                <section>
                  <h3 className="eyebrow mb-1">About me</h3>
                  <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{p.bio}</p>
                </section>
              )}
              {place && (
                <section>
                  <h3 className="eyebrow mb-1">Based in</h3>
                  <p className="inline-flex items-center gap-1 text-[13px]"><Icon name="pin" size={13} /> {place}</p>
                </section>
              )}
              <section>
                <h3 className="eyebrow mb-1">Klique member since</h3>
                <p className="text-[13px]">{monthYear(p.joinedAt)}</p>
              </section>
              {view.friendship.state === "friends" && view.friendship.since && (
                <section>
                  <h3 className="eyebrow mb-1">Friends since</h3>
                  <p className="text-[13px]">{longDate(view.friendship.since)}</p>
                </section>
              )}
              {p.interests.length > 0 && (
                <section>
                  <h3 className="eyebrow mb-2">Into</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {p.interests.map((i) => (
                      <InterestChip key={i} id={i} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : (
            <p className="mt-5 rounded-card border border-line bg-surface p-4 text-[13px] text-ink-muted">
              {view.hiddenReason === "members" ? "Only people who share a community with them can see this profile." : "This profile is private."}
            </p>
          )}
        </div>
      </aside>

      {/* ------------------------------ tabs ------------------------------ */}
      <div className="flex min-w-0 flex-1 flex-col md:min-h-0">
        <div role="tablist" aria-label="Profile sections" className="flex gap-1 overflow-x-auto no-bar border-b border-line px-4 pt-3 pr-14 md:px-5 md:pr-14">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cx(
                "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition",
                tab === t.id ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="flex-1 space-y-2.5 p-4 md:min-h-0 md:overflow-y-auto md:p-5">
          {!view.visible ? (
            <Empty>Nothing to show here.</Empty>
          ) : tab === "activity" ? (
            <>
              {view.attendanceHidden && upcoming.length === 0 && (
                <p className="flex items-center gap-2 rounded-card border border-line bg-surface p-3 text-[13px] text-ink-muted">
                  <Icon name="lock" size={14} /> {p.displayName} keeps their attendance private.
                </p>
              )}
              {upcoming.length > 0 && <h3 className="eyebrow pt-1">Going to</h3>}
              {upcoming.map((e) => (
                <EventListRow key={e.id} e={e} onNavigate={onClose} />
              ))}
              {view.hostedEvents.length > 0 && <h3 className="eyebrow pt-3">Hosting</h3>}
              {view.hostedEvents.map((e) => (
                <EventListRow key={e.id} e={e} onNavigate={onClose} />
              ))}
              {upcoming.length === 0 && view.hostedEvents.length === 0 && !view.attendanceHidden && <Empty>No recent activity.</Empty>}
            </>
          ) : tab === "friends" ? (
            view.mutualFriends.length ? (
              view.mutualFriends.map((u) => <PersonListRow key={u.id} u={u} onOpen={onOpenPerson} />)
            ) : (
              <Empty>No mutual friends yet.</Empty>
            )
          ) : (view.isSelf ? view.communities : mutual).length ? (
            (view.isSelf ? view.communities : mutual).map((c) => <CommunityListRow key={c.id} c={c} onNavigate={onClose} />)
          ) : (
            <Empty>You don&apos;t share a community yet.</Empty>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProfileModal({ handle, onClose, onOpenPerson }: { handle: string | null; onClose: () => void; onOpenPerson: (handle: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = handle !== null;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label="Profile"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[calc(100%-1.5rem)] max-w-3xl overflow-hidden rounded-card border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      {handle && (
        <div className="relative">
          <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 right-3 z-10 inline-flex size-9 items-center justify-center rounded-full bg-surface/80 text-ink-muted backdrop-blur hover:bg-raised hover:text-ink">
            <Icon name="x" />
          </button>
          <ProfileBody key={handle} handle={handle} onClose={onClose} onOpenPerson={onOpenPerson} />
        </div>
      )}
    </dialog>
  );
}
