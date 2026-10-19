"use client";

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
import { cx } from "@/components/ui/cx";
import { Modal } from "@/components/ui/Modal";
import { useApi } from "@/lib/hooks/useApi";
import type { CommunityCardDTO, FriendStatusDTO, ProfileView } from "@/lib/types";

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Banner strip: a gradient from the accent tokens, rotated per person so everyone isn't identical. */
export function ProfileBanner({ handle, className, bannerUrl, bannerColor }: { handle: string; className?: string; bannerUrl?: string | null; bannerColor?: string | null }) {
  const angle = 100 + (hash(handle) % 160);
  if (bannerUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={cdn(bannerUrl, { w: 1200 })} alt="" aria-hidden="true" loading="lazy" className={cx("w-full object-cover", className)} />
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

export const monthYear = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "Africa/Lagos" });
export const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });

/** Communities both of you are in: the person's visible communities ∩ yours. */
export function useMutualCommunities(view: ProfileView | null): CommunityCardDTO[] {
  const mine = useApi(() => CommunityService.mine(), []);
  if (!view || view.isSelf) return view?.communities ?? [];
  const mineIds = new Set((mine.data ?? []).map((c) => c.id));
  return view.communities.filter((c) => mineIds.has(c.id));
}

/**
 * The action row shared by the popover and the modal: Message · friend button · "⋯" menu.
 * Owns the block and report dialogs so both surfaces behave identically.
 */
export function ProfileActions({
  view,
  onFriendship,
  onReload,
  onNavigate,
  layout = "row",
}: {
  view: ProfileView;
  onFriendship: (s: FriendStatusDTO) => void;
  onReload: () => void;
  /** called when the action leaves this surface (opens a conversation, another page) */
  onNavigate: () => void;
  layout?: "row" | "stack";
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
    { label: "View as a page", icon: "arrow-up-right" as const, onSelect: () => { onNavigate(); router.push(`/people/${p.handle}`); } },
    { label: view.blockedByMe ? "Unblock" : "Block", icon: "ban" as const, danger: !view.blockedByMe, onSelect: () => setBlockOpen(true) },
    { label: "Report", icon: "flag" as const, danger: true, onSelect: () => setReportOpen(true) },
  ];

  return (
    <>
      <div className={layout === "stack" ? "flex flex-wrap items-center gap-2" : "flex flex-wrap items-center gap-2"}>
        <Button variant="primary" onClick={message} disabled={!view.messaging.allowed} loading={busy === "msg"} className={layout === "stack" ? "w-full" : undefined}>
          <Icon name="message" size={15} /> Message
        </Button>
        <FriendButton handle={p.handle} status={view.friendship} onChange={onFriendship} noMenu />
        <OverflowMenu items={menu} label="Profile options" align="left" />
      </div>
      {!view.messaging.allowed && view.messaging.message && (
        <p className="mt-2 inline-flex items-start gap-1.5 text-[12px] text-ink-muted">
          <Icon name="lock" size={12} className="mt-0.5 shrink-0" /> {view.messaging.message}
        </p>
      )}
      <Modal open={blockOpen} onClose={() => setBlockOpen(false)} size="sm" title={view.blockedByMe ? `Unblock @${p.handle}?` : `Block @${p.handle}?`}
        description={view.blockedByMe ? "They'll be able to find and interact with you again, subject to your privacy settings." : "You won't be able to message each other. You can unblock them any time in Settings."}
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
