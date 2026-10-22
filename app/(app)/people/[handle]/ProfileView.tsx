"use client";

import Link from "next/link";
import { UserMenu } from "@/components/layout/UserMenu";
import { cx } from "@/components/ui/cx";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { FriendService } from "@/app/services/FriendService";
import { MessageService } from "@/app/services/MessageService";
import { ProfileService } from "@/app/services/ProfileService";
import { SafetyService } from "@/app/services/SafetyService";
import { CommunityCard } from "@/components/domain/CommunityCard";
import { EventCard } from "@/components/domain/EventCard";
import { OverflowMenu } from "@/components/domain/OverflowMenu";
import { ShareButton } from "@/components/domain/ShareButton";
import { ReportDialog } from "@/components/domain/ReportDialog";
import { SectionHeader } from "@/components/domain/SectionHeader";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { InterestChip } from "@/components/ui/Chip";
import { FriendButton } from "@/components/domain/friends/FriendButton";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { placeLabel } from "@/lib/places";
import { useApi } from "@/lib/hooks/useApi";
import type { EventDTO, ProfileView } from "@/lib/types";
import { ProfileBanner, ZoomAvatar } from "@/components/domain/profile/ProfileParts";
import { UserName } from "@/components/ui/UserName";
import { RankBadge } from "@/components/ui/RankBadge";

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex-1 px-4 py-3.5 text-center sm:px-6">
      <p className="display text-2xl text-accent-text">{value.toLocaleString("en-US")}</p>
      <p className="eyebrow mt-1">{label}</p>
    </div>
  );
}

export function ProfileView() {
  const params = useParams<{ handle: string }>();
  const handle = params.handle;
  const router = useRouter();
  const toast = useToast();
  const { data, loading, error, status, reload, setData } = useApi(() => ProfileService.get(handle), [handle], { key: `profile:${handle}` });
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [busy, setBusy] = useState<"msg" | "block" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-64 w-full rounded-card" />
        <Skeleton className="h-20 w-full rounded-card" />
        <Skeleton className="h-48 w-full rounded-card" />
      </div>
    );
  }
  if (status === 404) {
    return (
      <EmptyState icon="user" title="Person not found" action={<Button href="/people">Browse people</Button>}>
        We couldn&apos;t find anyone with the handle @{handle}. They may have changed it.
      </EmptyState>
    );
  }
  if (error || !data) return <ErrorState message={error} onRetry={() => void reload()} />;

  const view: ProfileView = data;
  const { profile, isSelf, visible } = view;
  const place = [profile.neighborhood, placeLabel(profile)].filter(Boolean).join(", ");

  async function message() {
    setBusy("msg");
    setActionError(null);
    try {
      const res = await MessageService.start(profile.handle);
      router.push(`/messages/${res.data.conversation.id}`);
    } catch (e) {
      setActionError(errorMessage(e));
      setBusy(null);
    }
  }

  async function toggleBlock() {
    setBusy("block");
    try {
      if (view.blockedByMe) await SafetyService.unblock(profile.handle);
      else await SafetyService.block(profile.handle);
      toast(view.blockedByMe ? `Unblocked @${profile.handle}` : `Blocked @${profile.handle}`, "success");
      setBlockOpen(false);
      await reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  const updateEvent = (list: "upcomingEvents" | "hostedEvents") => (next: EventDTO) =>
    setData((d) => (d ? { ...d, [list]: d[list].map((e) => (e.id === next.id ? next : e)) } : d));

  // everything else you can do about this person lives in this one "⋯" menu
  const menu = isSelf
    ? []
    : [
        ...(view.friendship.state === "friends"
          ? [{
              label: "Remove friend",
              icon: "x" as const,
              danger: true,
              onSelect: () => {
                FriendService.remove(profile.handle).then(
                  () => { setData((d) => (d ? { ...d, friendship: { state: "none" } } : d)); toast("Removed from your friends", "success"); },
                  (e) => toast(errorMessage(e), "error"),
                );
              },
            }]
          : []),
        { label: view.blockedByMe ? "Unblock" : "Block", icon: "ban" as const, danger: !view.blockedByMe, onSelect: () => setBlockOpen(true) },
        { label: "Report", icon: "flag" as const, danger: true, onSelect: () => setReportOpen(true) },
      ];

  const isEmpty = visible && view.communities.length === 0 && view.hostedEvents.length === 0 && view.upcomingEvents.length === 0;

  return (
    <div className="space-y-8">
      {/* ------------------------------ scene card header ------------------------------ */}
      <section
        aria-label="Profile"
        className="relative overflow-hidden rounded-card border border-line bg-surface"
      >
        <ProfileBanner handle={profile.handle} bannerUrl={profile.bannerUrl} bannerColor={profile.bannerColor} className="h-28 sm:h-36" zoomable />
        <div className="px-5 pb-6 sm:px-8">
          <div className="-mt-12 flex items-end justify-between gap-3 sm:-mt-14">
            <ZoomAvatar url={profile.avatarUrl} name={profile.displayName}>
              <Avatar name={profile.displayName} src={profile.avatarUrl} frame={profile.avatarFrame} size={150} className="shrink-0 border-4 border-surface" />
            </ZoomAvatar>
            {/* on a phone the row must fit beside the picture: Message drops to its icon, and it wraps rather than spill off the card */}
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 pb-1">
              {isSelf ? (
                <>
                  <Button href="/settings#profile">
                    <Icon name="edit" size={15} /> Edit profile
                  </Button>
                  <ShareButton path={`/people/${profile.handle}`} text={`${profile.displayName} on klique`} label="Share profile" iconOnly />
                  {/* phones have no sidebar: settings, ads and the rest live in this menu. On desktop the
                      sidebar's profile card opens the same menu, so it isn't repeated here. */}
                  <span className="lg:hidden">
                    <UserMenu
                      align="right"
                      trigger={({ open, props }) => (
                        <button {...props} aria-label="Account menu" title="Settings, ads and more" className={cx("inline-flex size-10 items-center justify-center rounded-full border border-line bg-surface text-ink hover:bg-raised", open && "bg-raised")}>
                          <Icon name="more" size={18} />
                        </button>
                      )}
                    />
                  </span>
                </>
              ) : (
                <>
                  <FriendButton handle={profile.handle} status={view.friendship} noMenu onChange={(friendship) => setData((d) => (d ? { ...d, friendship } : d))} />
                  <Button variant="primary" onClick={message} disabled={!view.messaging.allowed} loading={busy === "msg"} aria-label="Message" className="max-sm:aspect-square max-sm:px-0">
                    <Icon name="message" size={15} /> <span className="max-sm:hidden">Message</span>
                  </Button>
                  <ShareButton path={`/people/${profile.handle}`} text={`${profile.displayName} on klique`} label="Share profile" iconOnly />
                  <OverflowMenu items={menu} label="Profile options" />
                </>
              )}
            </div>
          </div>

          <h1 className="display mt-4 text-[clamp(1.9rem,4.5vw,2.75rem)] break-words"><UserName name={profile.displayName} effect={profile.nameEffect} /></h1>
          <RankBadge rank={profile.rank} always className="mt-2" />
          <p className="mt-1 font-mono text-[13px] text-ink-muted">
            @{profile.handle}
            {visible && place && (
              <>
                {" · "}
                <span className="inline-flex items-center gap-1">
                  <Icon name="pin" size={12} /> {place}
                </span>
              </>
            )}
          </p>

          {!isSelf && !view.messaging.allowed && view.messaging.message && (
            <p className="mt-3 inline-flex items-start gap-2 text-[13px] text-ink-muted">
              <Icon name="lock" size={14} className="mt-0.5 shrink-0" /> {view.messaging.message}
            </p>
          )}
          {actionError && (
            <p role="alert" className="mt-3 text-sm font-medium text-danger">
              {actionError}
            </p>
          )}
          {view.blockedByMe && !isSelf && <p className="mt-3 text-[13px] text-ink-muted">You&apos;ve blocked this person.</p>}

          {visible && profile.bio && <p className="mt-4 max-w-2xl text-[15px] leading-relaxed whitespace-pre-line">{profile.bio}</p>}
          {visible && profile.interests.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Interests">
              {profile.interests.map((i) => (
                <li key={i}>
                  <InterestChip id={i} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {visible && (
          <div className="flex divide-x divide-line border-t border-line bg-raised/40">
            <Stat value={view.stats.communities} label="Communities" />
            <Stat value={view.stats.hosted} label="Hosted" />
            <Stat value={view.stats.going} label="Going" />
          </div>
        )}
      </section>

      {isSelf && (
        <p className="-mt-4 text-[13px] text-ink-muted">
          <Link href="/settings#privacy" className="font-medium text-accent-text underline underline-offset-2">Manage who can see your profile and RSVPs</Link>.
        </p>
      )}

      {/* ------------------------------ private profile ------------------------------ */}
      {!visible && (
        <EmptyState icon="lock" title={view.hiddenReason === "members" ? "Visible to shared communities" : "This profile is private"}>
          {view.hiddenReason === "members"
            ? `${profile.displayName} only shows their scene card to people who share a community with them. Join the same communities and it will open up.`
            : `${profile.displayName} keeps their scene card to themselves. Their communities and plans aren't shown.`}
        </EmptyState>
      )}

      {/* ------------------------------ empty ------------------------------ */}
      {isEmpty && (
        <EmptyState icon="asterisk" title={isSelf ? "Your scene card is a blank page" : `${profile.displayName} is just getting started`}
          action={
            isSelf ? (
              <>
                <Button variant="primary" href="/communities">Join communities</Button>
                <Button href="/events">RSVP to an event</Button>
              </>
            ) : undefined
          }
        >
          {isSelf ? "Join a few communities, RSVP to something this weekend, or host your own. It all shows up here." : "No communities or events to show yet."}
        </EmptyState>
      )}

      {/* ------------------------------ sections ------------------------------ */}
      {visible && view.communities.length > 0 && (
        <section>
          <SectionHeader title="Joined communities" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {view.communities.map((c) => (
              <CommunityCard key={c.id} community={c} tag="Member" />
            ))}
          </div>
        </section>
      )}

      {visible && (view.upcomingEvents.length > 0 || view.attendanceHidden) && (
        <section>
          <SectionHeader title="Upcoming RSVPs" />
          {view.attendanceHidden && view.upcomingEvents.length === 0 ? (
            <p className="flex items-center gap-2.5 rounded-card border border-line bg-surface p-4 text-sm text-ink-muted">
              <Icon name="lock" size={15} /> {profile.displayName} keeps their attendance private.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {view.upcomingEvents.map((e) => (
                <EventCard key={e.id} event={e} onChange={updateEvent("upcomingEvents")} />
              ))}
            </div>
          )}
        </section>
      )}

      {visible && view.hostedEvents.length > 0 && (
        <section>
          <SectionHeader title="Hosted events" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {view.hostedEvents.map((e) => (
              <EventCard key={e.id} event={e} onChange={updateEvent("hostedEvents")} />
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------ dialogs ------------------------------ */}
      <Modal open={blockOpen} onClose={() => setBlockOpen(false)} size="sm" title={view.blockedByMe ? `Unblock @${profile.handle}?` : `Block @${profile.handle}?`}
        description={view.blockedByMe ? "They'll be able to find and interact with you again, subject to your privacy settings." : "You won't be able to message each other. You can unblock them any time in Settings → Blocked people."}
      >
        <div className="flex justify-end gap-2">
          <Button onClick={() => setBlockOpen(false)}>Cancel</Button>
          <Button variant={view.blockedByMe ? "primary" : "danger"} loading={busy === "block"} onClick={toggleBlock}>
            {view.blockedByMe ? "Unblock" : "Block"}
          </Button>
        </div>
      </Modal>
      <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} targetType="user" targetId={profile.id} subject={`@${profile.handle}`} />
    </div>
  );
}
