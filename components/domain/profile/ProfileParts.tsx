"use client";

import { StillImage } from "@/components/ui/StillImage";
import { isAnimatedPicture } from "@/lib/cosmetics";
import { useCalm } from "@/lib/hooks/useCalm";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { CommunityService } from "@/app/services/CommunityService";
import { FriendService } from "@/app/services/FriendService";
import { MessageService } from "@/app/services/MessageService";
import { SafetyService } from "@/app/services/SafetyService";
import { FriendButton } from "@/components/domain/friends/FriendButton";
import { OverflowMenu } from "@/components/domain/OverflowMenu";
import { ReportDialog } from "@/components/domain/ReportDialog";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cdn } from "@/lib/cdn";
import { focalStyle, splitFocal } from "@/lib/focal";
import { useMediaViewer } from "@/components/providers/MediaViewerProvider";
import { cx } from "@/components/ui/cx";
import { Modal } from "@/components/ui/Modal";
import { useApi } from "@/lib/hooks/useApi";
import { PRESENCES, type Presence } from "@/lib/constants";
import type { CommunityCardDTO, FriendStatusDTO, ProfileView } from "@/lib/types";

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** A profile picture that opens full size when tapped (when there is one). */
export function ZoomAvatar({ url, name, children }: { url?: string | null; name: string; children: React.ReactNode }) {
  const view = useMediaViewer();
  if (!url) return <>{children}</>;
  return (
    <button type="button" onClick={() => view([url])} aria-label={`View ${name}'s picture full screen`} className="shrink-0 cursor-zoom-in rounded-full">
      {children}
    </button>
  );
}

/** Banner strip: a gradient from the accent tokens, rotated per person so everyone isn't identical. */
export function ProfileBanner({ handle, className, bannerUrl, bannerColor, zoomable }: { handle: string; className?: string; bannerUrl?: string | null; bannerColor?: string | null; zoomable?: boolean }) {
  const angle = 100 + (hash(handle) % 160);
  const view = useMediaViewer();
  const calm = useCalm();
  if (bannerUrl) {
    // shown as the person positioned it (lib/focal); tapping opens the whole picture when `zoomable`. An animated
    // (GIF) banner holds still for people who turn motion down or use data saver.
    const pic =
      calm && isAnimatedPicture(bannerUrl) ? (
        <StillImage src={cdn(bannerUrl, { w: 1200 })} style={focalStyle(splitFocal(bannerUrl).focal)} className="size-full object-cover" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cdn(bannerUrl, { w: 1200 })} alt="" aria-hidden="true" loading="lazy" style={focalStyle(splitFocal(bannerUrl).focal)} className="size-full object-cover" />
      );
    return zoomable ? (
      <button type="button" onClick={() => view([bannerUrl])} aria-label="View banner full screen" className={cx("block w-full cursor-zoom-in overflow-hidden", className)}>
        {pic}
      </button>
    ) : (
      <div className={cx("w-full overflow-hidden", className)}>{pic}</div>
    );
  }
  if (bannerColor) {
    return <div aria-hidden="true" className={className} style={{ background: `linear-gradient(135deg, ${bannerColor}, color-mix(in oklab, ${bannerColor} 55%, var(--surface)))` }} />;
  }
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        background: `linear-gradient(${angle}deg, color-mix(in oklab, var(--accent) 60%, var(--surface)) 0%, color-mix(in oklab, var(--accent2) 45%, var(--surface)) 100%)`,
      }}
    />
  );
}

const PRESENCE_TONE: Record<Presence, string | null> = { online: "var(--success)", idle: "#f0b232", dnd: "var(--danger)", invisible: null };

/** The status dot on a profile picture: the status the person set (none when they're invisible). */
export function PresenceDot({ presence, className }: { presence: Presence; className?: string }) {
  const tone = PRESENCE_TONE[presence];
  if (!tone) return null;
  const label = PRESENCES.find((p) => p.id === presence)?.label;
  return (
    <span role="img" aria-label={label} title={label} className={cx("absolute rounded-full ring-[3px] ring-surface", className)} style={{ background: tone }}>
      {presence === "dnd" && <span aria-hidden="true" className="absolute inset-x-[22%] top-1/2 h-[18%] -translate-y-1/2 rounded-full bg-surface" />}
    </span>
  );
}

export const monthYear = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "Africa/Lagos" });
export const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });

/** Communities both of you are in: the person's visible communities ∩ yours. */
export function useMutualCommunities(view: ProfileView | null): CommunityCardDTO[] {
  const mine = useApi(() => CommunityService.mine(), [], { key: "my-communities" });
  if (!view || view.isSelf) return view?.communities ?? [];
  const mineIds = new Set((mine.data ?? []).map((c) => c.id));
  return view.communities.filter((c) => mineIds.has(c.id));
}

/**
 * The profile card's action row: Message · friend button · "⋯" menu (remove friend, block, report). Owns the
 * block and report dialogs.
 */
export function ProfileActions({
  view,
  onFriendship,
  onReload,
  onNavigate,
  layout = "row",
  menu: withMenu = true,
}: {
  view: ProfileView;
  onFriendship: (s: FriendStatusDTO) => void;
  onReload: () => void;
  /** called when the action leaves this surface (opens a conversation, another page) */
  onNavigate: () => void;
  /** "popout": just the small round friend button and the "⋯" menu (the popout has its own Message box) */
  layout?: "row" | "stack" | "popout";
  /** show the "⋯" menu (remove friend, block, report) */
  menu?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"msg" | "block" | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const p = view.profile;

  async function message() {
    setBusy("msg");
    try {
      const res = await MessageService.start(p.handle);
      onNavigate();
      router.push(`/messages/${res.data.conversation.id}`);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function toggleBlock() {
    setBusy("block");
    try {
      if (view.blockedByMe) await SafetyService.unblock(p.handle);
      else await SafetyService.block(p.handle);
      toast(view.blockedByMe ? `Unblocked @${p.handle}` : `Blocked @${p.handle}`, "success");
      setBlockOpen(false);
      onReload();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  if (view.isSelf) {
    return (
      <Button variant="primary" href="/settings#profile" onClick={onNavigate} className={layout === "stack" ? "w-full" : undefined}>
        <Icon name="edit" size={15} /> Edit profile
      </Button>
    );
  }

  const menu = [
    ...(view.friendship.state === "friends"
      ? [{
          label: "Remove friend",
          icon: "x" as const,
          danger: true,
          onSelect: () => {
            FriendService.remove(p.handle).then(
              () => { onFriendship({ state: "none" }); toast("Removed from your friends", "success"); },
              (e) => toast(errorMessage(e), "error"),
            );
          },
        }]
      : []),
    { label: view.blockedByMe ? "Unblock" : "Block", icon: "ban" as const, danger: !view.blockedByMe, onSelect: () => setBlockOpen(true) },
    { label: "Report", icon: "flag" as const, danger: true, onSelect: () => setReportOpen(true) },
  ];

  if (layout === "popout") {
    return (
      <>
        <FriendButton handle={p.handle} status={view.friendship} onChange={onFriendship} iconOnly />
        <OverflowMenu items={menu} label="Profile options" align="right" />
        <Modal open={blockOpen} onClose={() => setBlockOpen(false)} size="sm" title={view.blockedByMe ? `Unblock @${p.handle}?` : `Block @${p.handle}?`} description={view.blockedByMe ? "They'll be able to find and interact with you again, subject to your privacy settings." : "You won't be able to message each other. You can unblock them any time in Settings → Blocked people."}>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setBlockOpen(false)}>Cancel</Button>
            <Button variant={view.blockedByMe ? "primary" : "danger"} loading={busy === "block"} onClick={toggleBlock}>
              {view.blockedByMe ? "Unblock" : "Block"}
            </Button>
          </div>
        </Modal>
        <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} targetType="user" targetId={p.id} subject={`@${p.handle}`} />
      </>
    );
  }

  return (
    <>
      <div className={layout === "stack" ? "flex flex-wrap items-center gap-2" : "flex flex-wrap items-center gap-2"}>
        <Button variant="primary" onClick={message} disabled={!view.messaging.allowed} loading={busy === "msg"} className={layout === "stack" ? "w-full" : undefined}>
          <Icon name="message" size={15} /> Message
        </Button>
        <FriendButton handle={p.handle} status={view.friendship} onChange={onFriendship} noMenu />
        {withMenu && <OverflowMenu items={menu} label="Profile options" align="left" />}
      </div>
      {!view.messaging.allowed && view.messaging.message && (
        <p className="mt-2 inline-flex items-start gap-1.5 text-[12px] text-ink-muted">
          <Icon name="lock" size={12} className="mt-0.5 shrink-0" /> {view.messaging.message}
        </p>
      )}
      <Modal open={blockOpen} onClose={() => setBlockOpen(false)} size="sm" title={view.blockedByMe ? `Unblock @${p.handle}?` : `Block @${p.handle}?`}
        description={view.blockedByMe ? "They'll be able to find and interact with you again, subject to your privacy settings." : "You won't be able to message each other. You can unblock them any time in Settings → Blocked people."}
      >
        <div className="flex justify-end gap-2">
          <Button onClick={() => setBlockOpen(false)}>Cancel</Button>
          <Button variant={view.blockedByMe ? "primary" : "danger"} loading={busy === "block"} onClick={toggleBlock}>
            {view.blockedByMe ? "Unblock" : "Block"}
          </Button>
        </div>
      </Modal>
      <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} targetType="user" targetId={p.id} subject={`@${p.handle}`} />
    </>
  );
}
