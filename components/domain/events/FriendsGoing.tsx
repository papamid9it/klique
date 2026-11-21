"use client";

import { useState } from "react";
import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { cx } from "@/components/ui/cx";
import { friendsGoingText } from "@/lib/format";
import type { EventDTO } from "@/lib/types";

type Friends = NonNullable<EventDTO["friendsGoing"]>;

/** Up to three friends' faces, overlapping, each ringed in the page's colour. */
export function FriendFaces({ f, size = 20 }: { f: Friends; size?: number }) {
  return (
    <span className="flex shrink-0" aria-hidden="true">
      {f.people.slice(0, 3).map((p, i) => (
        <span key={p.id} className={cx("rounded-full ring-2 ring-surface", i > 0 && "-ml-1.5")}>
          <Avatar name={p.displayName} src={p.avatarUrl} size={size} />
        </span>
      ))}
    </span>
  );
}

/**
 * "Tobi and 2 friends are going" with their faces, as in the app: on event rows (`compact`) and the event page, where a
 * click lists them all. Only friends who show their RSVPs appear (Privacy → Show my RSVPs).
 */
export function FriendsGoing({ f, compact, className }: { f: Friends; compact?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const line = (
    <span className={cx("flex min-w-0 items-center gap-2", className)}>
      <FriendFaces f={f} size={compact ? 18 : 24} />
      <span className={cx("truncate font-semibold text-ink", compact ? "text-[12.5px]" : "text-sm")}>{friendsGoingText(f)}</span>
    </span>
  );
  if (compact) return line;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-between gap-2 rounded-control py-1.5 text-left hover:opacity-80">
        {line}
        <span className="shrink-0 text-[13px] font-semibold text-ink-muted">See who</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={f.count === 1 ? "1 friend going" : `${f.count} friends going`} size="sm">
        <ul className="-mx-2 max-h-[60vh] overflow-y-auto">
          {f.people.map((p) => (
            <li key={p.id}>
              <ProfileTrigger handle={p.handle} className="flex w-full items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-raised">
                <Avatar name={p.displayName} src={p.avatarUrl} size={36} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{p.displayName}</span>
                  <span className="block truncate font-mono text-[12px] text-ink-muted">@{p.handle}</span>
                </span>
              </ProfileTrigger>
            </li>
          ))}
          {f.count > f.people.length && <li className="px-2 py-2 text-sm text-ink-muted">and {f.count - f.people.length} more</li>}
        </ul>
      </Modal>
    </>
  );
}
