"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { FriendService } from "@/app/services/FriendService";
import { OverflowMenu } from "@/components/domain/OverflowMenu";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import type { FriendStatusDTO } from "@/lib/types";

/**
 * The one button for a person: Add friend → Request sent (tap to withdraw) → Accept / Decline → Friends.
 * `onChange` reports the new status so the page can update; the server decides what's allowed.
 */
export function FriendButton({ handle, status, onChange, size = "md", noMenu, iconOnly }: { handle: string; status: FriendStatusDTO; onChange: (s: FriendStatusDTO) => void; size?: "sm" | "md"; /** hide the "Remove friend" menu (the caller offers it elsewhere) */ noMenu?: boolean; /** small round icon buttons (the profile popout) */ iconOnly?: boolean }) {
  const { requireAuth } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<FriendStatusDTO | null>, done?: string) {
    if (!requireAuth()) return;
    setBusy(true);
    try {
      const next = await fn();
      if (next) onChange(next);
      if (done) toast(done, "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  const id = status.requestId;
  if (iconOnly) {
    const shape = "inline-flex size-9 shrink-0 items-center justify-center rounded-full transition disabled:opacity-50";
    const round = cx(shape, "border border-line bg-surface text-ink hover:bg-raised");
    if (status.state === "friends") return <span title="Friends" aria-label="Friends" className={cx(round, "text-accent-text")}><Icon name="users" size={16} /></span>;
    if (status.state === "outgoing") return <button type="button" disabled={busy} onClick={() => id && void run(async () => (await FriendService.cancel(id), { state: "none" as const }), "Request withdrawn")} title="Request sent. Tap to withdraw" aria-label="Friend request sent. Withdraw it" className={round}><Icon name="clock" size={16} /></button>;
    if (status.state === "incoming")
      return (
        <>
          <button type="button" disabled={busy} onClick={() => id && void run(async () => (await FriendService.accept(id), { state: "friends" as const, requestId: id }), "You're now friends")} title="Accept friend request" aria-label="Accept friend request" className={cx(shape, "bg-accent text-accent-ink hover:brightness-110")}><Icon name="check" size={16} /></button>
          <button type="button" disabled={busy} onClick={() => id && void run(async () => (await FriendService.decline(id), { state: "none" as const }))} title="Decline friend request" aria-label="Decline friend request" className={round}><Icon name="x" size={16} /></button>
        </>
      );
    return <button type="button" disabled={busy} onClick={() => void run(() => FriendService.add(handle).then((r) => r.data), "Friend request sent")} title="Add friend" aria-label="Add friend" className={round}><Icon name="userplus" size={16} /></button>;
  }
  if (status.state === "friends") {
    return (
      <div className="inline-flex items-center gap-1">
        <Button size={size} disabled className="!opacity-100">
          <Icon name="check" size={14} /> Friends
        </Button>
        {!noMenu && <OverflowMenu label="Friend options" items={[{ label: "Remove friend", icon: "x", danger: true, onSelect: () => void run(async () => (await FriendService.remove(handle), { state: "none" as const }), "Removed from your friends") }]} />}
      </div>
    );
  }
  if (status.state === "outgoing") {
    return (
      <Button size={size} loading={busy} onClick={() => id && void run(async () => (await FriendService.cancel(id), { state: "none" as const }), "Request withdrawn")} title="Tap to withdraw">
        <Icon name="clock" size={14} /> Request sent
      </Button>
    );
  }
  if (status.state === "incoming") {
    return (
      <div className="inline-flex items-center gap-2">
        <Button size={size} variant="primary" loading={busy} onClick={() => id && void run(async () => (await FriendService.accept(id), { state: "friends" as const, requestId: id }), "You're now friends")}>
          <Icon name="check" size={14} /> Accept
        </Button>
        <Button size={size} onClick={() => id && void run(async () => (await FriendService.decline(id), { state: "none" as const }))}>Decline</Button>
      </div>
    );
  }
  return (
    <Button size={size} variant="primary" loading={busy} onClick={() => void run(() => FriendService.add(handle).then((r) => r.data), "Friend request sent")}>
      <Icon name="userplus" size={15} /> Add friend
    </Button>
  );
}
