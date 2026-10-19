"use client";

import { placeLabel } from "@/lib/places";
import Link from "next/link";
import { CommunityService } from "@/app/services/CommunityService";
import { ProfileService } from "@/app/services/ProfileService";
import { FriendButton } from "@/components/domain/friends/FriendButton";
import { useProfileCard } from "@/components/providers/ProfileCardProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { InterestChip } from "@/components/ui/Chip";
import { Cover } from "@/components/ui/Cover";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";

import { useApi } from "@/lib/hooks/useApi";
import { UserName } from "@/components/ui/UserName";

/**
 * Right pane of a conversation (Discord's profile panel): who this is, whether you're friends,
 * what you have in common, and the block/report actions.
 */
export function ConversationInfo({
  handle,
  blockedByMe,
  onBlock,
  onReport,
  onNavigate,
}: {
  handle: string;
  blockedByMe: boolean;
  onBlock: () => void;
  onReport: () => void;
  onNavigate?: () => void;
}) {
  const profile = useApi(() => ProfileService.get(handle), [handle]);
  const card = useProfileCard();
  const mine = useApi(() => CommunityService.mine(), []);
  const view = profile.data;

  if (profile.loading || !view) {
    return (
      <div className="space-y-4 p-5 pt-14 lg:pt-5" aria-busy="true">
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-16" />
      </div>
    );
  }

  const p = view.profile;
  const myIds = new Set((mine.data ?? []).map((c) => c.id));
  const mutual = view.communities.filter((c) => myIds.has(c.id));

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div className="relative h-24 bg-gradient-to-br from-accent/40 via-accent/10 to-transparent" aria-hidden="true" />
      <div className="-mt-14 px-5">
        <span className="inline-block rounded-full bg-canvas p-1.5">
          <Avatar name={p.displayName} src={p.avatarUrl} frame={p.avatarFrame} size={84} />
        </span>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] break-words"><UserName name={p.displayName} effect={p.nameEffect} /></h2>
        <p className="font-mono text-xs text-ink-muted">@{p.handle}</p>
        {view.visible && (
          <p className="mt-2 inline-flex items-center gap-1 text-[13px] text-ink-muted">
            <Icon name="pin" size={13} /> {p.neighborhood ? `${p.neighborhood}, ` : ""}
            {placeLabel(p)}
          </p>
        )}
        {!view.isSelf && (
          <div className="mt-3">
            <FriendButton handle={p.handle} status={view.friendship} onChange={(friendship) => profile.setData((d) => (d ? { ...d, friendship } : d))} />
          </div>
        )}
      </div>

      {view.visible ? (
        <>
          {p.bio && (
            <section className="px-5">
              <h3 className="eyebrow mb-1.5">About</h3>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{p.bio}</p>
            </section>
          )}
          {p.interests.length > 0 && (
            <section className="px-5">
              <h3 className="eyebrow mb-2">Into</h3>
              <div className="flex flex-wrap gap-1.5">
                {p.interests.map((i) => (
                  <InterestChip key={i} id={i} />
                ))}
              </div>
            </section>
          )}
          <section className="px-5">
            <h3 className="eyebrow mb-1.5">On klique since</h3>
            <p className="text-sm">{new Date(p.joinedAt).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "Africa/Lagos" })}</p>
          </section>
          <section className="px-5">
            <h3 className="eyebrow mb-2">{mutual.length ? `${mutual.length} ${mutual.length === 1 ? "community" : "communities"} in common` : "Communities in common"}</h3>
            {mutual.length ? (
              <ul className="space-y-1">
                {mutual.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <Link href={`/communities/${c.slug}`} onClick={onNavigate} className="flex items-center gap-3 rounded-control p-1.5 hover:bg-raised">
                      <span className="relative block size-9 shrink-0 overflow-hidden rounded-[10px]">
                        <Cover src={c.coverImage} seed={c.id} interest={c.interest} className="size-full" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{c.name}</span>
                        <span className="block truncate text-[11px] text-ink-muted">{c.memberCount ?? "—"} members</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">You don&apos;t share a community yet.</p>
            )}
          </section>
        </>
      ) : (
        <p className="px-5 text-sm text-ink-muted">This profile is private.</p>
      )}

      <div className="mt-1 flex flex-col gap-2 border-t border-line px-5 pt-5">
        <Button onClick={() => card.openFull(p.handle)}>
          <Icon name="user" size={15} /> View full profile
        </Button>
        <Button onClick={onBlock}>
          <Icon name="ban" size={15} /> {blockedByMe ? "Unblock" : "Block"}
        </Button>
        <Button variant="danger" onClick={onReport}>
          <Icon name="flag" size={15} /> Report
        </Button>
      </div>
    </div>
  );
}
