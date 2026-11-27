"use client";

import { useEffect, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { REACTIONS } from "@/lib/reactions";
import type { Envelope, WhoReactedDTO } from "@/lib/types";

/**
 * Who loved a post, liked a board post, or reacted to a comment (with the emoji), newest first; each opens their
 * profile card. `load` fetches the list when it opens.
 */
export function WhoReacted({ title, load, onClose }: { title: string; load: () => Promise<Envelope<WhoReactedDTO>>; onClose: () => void }) {
  const [data, setData] = useState<WhoReactedDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    load().then((r) => on && setData(r.data), (e) => on && setError(errorMessage(e)));
    return () => void (on = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Modal open onClose={onClose} title={title} size="sm">
      {!data ? (
        error ? <p className="text-sm text-danger">{error}</p> : <RowSkeleton rows={4} />
      ) : !data.items.length ? (
        <p className="text-sm text-ink-muted">Nobody yet.</p>
      ) : (
        <ul className="-mx-2 max-h-[60vh] overflow-y-auto">
          {data.items.map((x, i) => (
            <li key={`${x.user.id}:${x.kind ?? ""}:${i}`}>
              <ProfileTrigger handle={x.user.handle} className="flex w-full items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-raised">
                <Avatar name={x.user.displayName} src={x.user.avatarUrl} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{x.user.displayName}</span>
                  <span className="block truncate text-[12.5px] text-ink-muted">@{x.user.handle}</span>
                </span>
                {x.kind ? <span className="text-xl">{REACTIONS.find((r) => r.id === x.kind)?.emoji}</span> : null}
              </ProfileTrigger>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
