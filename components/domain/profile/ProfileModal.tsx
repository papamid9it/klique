"use client";

import { ProfileGallery } from "./AdminMediaRemove";
import { PlanBadge } from "@/components/domain/account/PlanTab";
import { ProfileEffect } from "@/components/ui/ProfileEffect";
import { themeStyle } from "@/components/ui/profileTheme";
import { placeLabel } from "@/lib/places";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FriendService } from "@/app/services/FriendService";
import { ProfileService } from "@/app/services/ProfileService";
import { Avatar } from "@/components/ui/Avatar";
import { InterestChip } from "@/components/ui/Chip";
import { cx } from "@/components/ui/cx";
import { Cover } from "@/components/ui/Cover";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { ProfileSkeleton } from "@/components/ui/Skeleton";
import { getInterest, hiddenProfileText } from "@/lib/constants";
import { compactCount, dateChip } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import { VerifiedCheck } from "@/components/ui/VerifiedCheck";
import type { CommunityCardDTO, EventDTO, UserBrief, UserProfile } from "@/lib/types";
import { longDate, monthYear, PresenceDot, ProfileActions, ProfileBanner, useMutualCommunities, ZoomAvatar } from "./ProfileParts";
import { MembersPill, PointsPill } from "./ProfileCard";
import { UserName } from "@/components/ui/UserName";
import { SocialRow } from "@/components/ui/SocialIcons";

type Tab = "activity" | "friends" | "communities" | "created";
/** the most a list shows on a profile; the rest are behind See all */
const SHOWN = 5;

function SeeAll({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="h-11 w-full rounded-control border border-line text-sm font-semibold transition-colors hover:bg-raised">
      {label}
    </button>
  );
}

function AllEvents({ handle, kind, onNavigate }: { handle: string; kind: "going" | "hosting"; onNavigate: () => void }) {
  const { data, loading, error } = useApi(() => ProfileService.events(handle, kind), [handle, kind]);
  if (loading) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (error || !data) return <p className="text-sm text-ink-muted">Couldn&apos;t load these. Please try again.</p>;
  return <>{data.map((e) => <EventListRow key={e.id} e={e} onNavigate={onNavigate} />)}</>;
}

function CommunityListRow({ c, onNavigate }: { c: CommunityCardDTO; onNavigate: () => void }) {
  return (
    <Link href={`/communities/${c.slug}`} onClick={onNavigate} className="flex items-center gap-3.5 rounded-card border border-line bg-surface p-3 transition hover:bg-raised">
      <span className="relative block size-12 shrink-0 overflow-hidden rounded-xl">
        <Cover src={c.coverImage} seed={c.id} interest={c.interest} className="size-full" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <span className="truncate">{c.name}</span>
          <VerifiedCheck on={c.verified} size={14} />
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

/**
 * The full profile (Discord's): identity, actions and details on the left; on the right Activity, Mutual
 * communities and Mutual friends, or for yourself About, Your communities and Friends.
 */
/** Designs being tried on in Profile style, shown on your own profile before they're yours (only you see this). */
export type TryOnLook = Partial<Pick<UserProfile, "avatarFrame" | "nameEffect" | "profileTheme" | "profileEffect">>;

function ProfileBody({ handle, onClose, onOpenPerson, tryOn }: { handle: string; onClose: () => void; onOpenPerson: (handle: string) => void; tryOn?: TryOnLook }) {
  const { data: view, loading, status, setData, reload } = useApi(() => ProfileService.get(handle), [handle], { key: `profile:${handle}` });
  const mutual = useMutualCommunities(view);
  const [tab, setTab] = useState<Tab>("activity");
  const [all, setAll] = useState<"going" | "hosting" | "friends" | "communities" | "created" | null>(null);
  // your own friends (for others, the mutual ones come with the profile)
  const myFriends = useApi(view?.isSelf ? () => FriendService.list() : null, [view?.isSelf]);

  if (loading) return <ProfileSkeleton />;
  if (!view) {
    return (
      <div className="p-10 text-center">
        <h2 className="text-lg font-semibold">{status === 404 ? "Person not found" : "Couldn't load this profile"}</h2>
        <p className="mt-1 text-sm text-ink-muted">{status === 404 ? `We couldn't find anyone with the handle @${handle}.` : "Try again in a moment."}</p>
      </div>
    );
  }

  const p = tryOn ? { ...view.profile, ...tryOn } : view.profile;
  const place = [p.neighborhood, placeLabel(p)].filter(Boolean).join(", ");
  const friends = view.isSelf ? (myFriends.data ?? []).map((f) => f.user) : view.mutualFriends;
  const sharedCommunities = view.isSelf ? view.communities : mutual;
  const created = view.createdCommunities ?? [];
  const tabs: { id: Tab; label: string }[] = view.isSelf
    ? [
        { id: "activity", label: "About" },
        { id: "communities", label: `Your communities · ${view.communities.length}` },
        ...(created.length ? [{ id: "created" as const, label: `Created · ${created.length}` }] : []),
        { id: "friends", label: friends.length ? `Friends · ${friends.length}` : "Friends" },
      ]
    : [
        { id: "activity", label: "Activity" },
        ...(created.length ? [{ id: "created" as const, label: `Created · ${created.length}` }] : []),
        { id: "communities", label: mutual.length ? `Mutual communities · ${mutual.length}` : "Mutual communities" },
        { id: "friends", label: friends.length ? `Mutual friends · ${friends.length}` : "Mutual friends" },
      ];
  const upcoming = view.upcomingEvents;

  return (
    <div className="flex h-full flex-col overflow-y-auto sm:max-h-[88dvh] md:min-h-[34rem] md:flex-row md:overflow-hidden">
      {/* ------------------------------ identity (tinted by their theme, with their effect over it) ------------------------------ */}
      <aside className={cx("kq-live relative shrink-0 border-b border-line md:w-[22rem] md:overflow-y-auto md:border-r md:border-b-0", !p.profileTheme && "bg-raised/40")} style={themeStyle(p.profileTheme)}>
        <ProfileEffect id={p.profileEffect} />
        <ProfileBanner handle={p.handle} bannerUrl={p.bannerUrl} bannerColor={p.bannerColor} className="h-32" />
        <div className="relative px-5 pb-5">
          <span className="relative -mt-14 inline-block rounded-full bg-surface p-1.5">
            <ZoomAvatar url={p.avatarUrl} name={p.displayName}>
              <Avatar name={p.displayName} src={p.avatarUrl} frame={p.avatarFrame} size={104} />
            </ZoomAvatar>
            <PresenceDot presence={p.presence} self={view.isSelf} className="right-2 bottom-2 size-[22px]" />
          </span>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] break-words"><UserName name={p.displayName} effect={p.nameEffect} /> <PlanBadge plan={p.badge} size={20} className="ml-1" /></h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-ink-muted">
            <span className="font-mono">@{p.handle}</span>
            {p.pronouns && <span>· {p.pronouns}</span>}
            {view.visible && <PointsPill n={p.points} />}
            {view.visible && <MembersPill view={view} />}
          </p>
          {view.visible && <SocialRow socials={p.socials} className="mt-3" />}

          <div className="mt-4">
            <ProfileActions view={view} layout="stack" onFriendship={(friendship) => setData((d) => (d ? { ...d, friendship } : d))} onReload={() => void reload()} onNavigate={onClose} />
          </div>

          {view.visible ? (
            <div className="mt-5 space-y-4 rounded-card border border-line bg-surface p-4">
              <ProfileGallery userId={p.id} media={p.media ?? []} isSelf={view.isSelf} onNavigate={onClose} />
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
              {hiddenProfileText(view.hiddenReason)}
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
              {upcoming.slice(0, SHOWN).map((e) => (
                <EventListRow key={e.id} e={e} onNavigate={onClose} />
              ))}
              {upcoming.length > SHOWN && <SeeAll label="See all" onClick={() => setAll("going")} />}
              {view.hostedEvents.length > 0 && <h3 className="eyebrow pt-3">Hosting</h3>}
              {view.hostedEvents.slice(0, SHOWN).map((e) => (
                <EventListRow key={e.id} e={e} onNavigate={onClose} />
              ))}
              {view.hostedEvents.length > SHOWN && <SeeAll label="See all" onClick={() => setAll("hosting")} />}
              {upcoming.length === 0 && view.hostedEvents.length === 0 && !view.attendanceHidden && <Empty>No recent activity.</Empty>}
            </>
          ) : tab === "friends" ? (
            friends.length ? (
              <>
                {friends.slice(0, SHOWN).map((u) => <PersonListRow key={u.id} u={u} onOpen={onOpenPerson} />)}
                {friends.length > SHOWN && <SeeAll label={`See all · ${friends.length}`} onClick={() => setAll("friends")} />}
              </>
            ) : (
              <Empty>{view.isSelf ? "No friends yet. Add people from their profile." : "No mutual friends yet."}</Empty>
            )
          ) : tab === "created" ? (
            <>
              {created.slice(0, SHOWN).map((c) => <CommunityListRow key={c.id} c={c} onNavigate={onClose} />)}
              {created.length > SHOWN && <SeeAll label={`See all · ${created.length}`} onClick={() => setAll("created")} />}
            </>
          ) : sharedCommunities.length ? (
            <>
              {sharedCommunities.slice(0, SHOWN).map((c) => <CommunityListRow key={c.id} c={c} onNavigate={onClose} />)}
              {sharedCommunities.length > SHOWN && <SeeAll label={`See all · ${sharedCommunities.length}`} onClick={() => setAll("communities")} />}
            </>
          ) : (
            <Empty>You don&apos;t share a community yet.</Empty>
          )}
        </div>
      </div>
      <Modal open={!!all} onClose={() => setAll(null)} title={all === "created" ? "Communities created" : all === "going" ? "Going to" : all === "hosting" ? "Hosting" : all === "friends" ? (view.isSelf ? "Friends" : "Mutual friends") : view.isSelf ? "Communities" : "Mutual communities"}>
        <div className="space-y-2.5">
          {all === "going" || all === "hosting" ? <AllEvents handle={p.handle} kind={all} onNavigate={onClose} /> : null}
          {all === "friends" ? friends.map((u) => <PersonListRow key={u.id} u={u} onOpen={(h) => { setAll(null); onOpenPerson(h); }} />) : null}
          {all === "communities" ? sharedCommunities.map((c) => <CommunityListRow key={c.id} c={c} onNavigate={onClose} />) : null}
          {all === "created" ? created.map((c) => <CommunityListRow key={c.id} c={c} onNavigate={onClose} />) : null}
        </div>
      </Modal>
    </div>
  );
}

export function ProfileModal({ handle, onClose, onOpenPerson, tryOn }: { handle: string | null; onClose: () => void; onOpenPerson: (handle: string) => void; tryOn?: TryOnLook }) {
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
      // React passes a dialog's close up to its parents: closing a popup opened from here isn't closing the profile
      onClose={(e) => {
        if (e.target === ref.current) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none overflow-hidden border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm sm:m-auto sm:h-auto sm:max-h-[88dvh] sm:w-[calc(100%-1.5rem)] sm:max-w-[900px] sm:rounded-card sm:border"
    >
      {handle && (
        <div className="relative h-full">
          <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 right-3 z-10 inline-flex size-9 items-center justify-center rounded-full bg-surface/80 text-ink-muted backdrop-blur hover:bg-raised hover:text-ink">
            <Icon name="x" />
          </button>
          {tryOn && (
            <p className="absolute bottom-4 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap text-canvas shadow-lg">
              <Icon name="eye" size={13} /> Preview, only you can see this
            </p>
          )}
          <ProfileBody key={handle} handle={handle} onClose={onClose} onOpenPerson={onOpenPerson} tryOn={tryOn} />
        </div>
      )}
    </dialog>
  );
}
