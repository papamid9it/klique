"use client";

import { placeLabel } from "@/lib/places";
import { ProfileService } from "@/app/services/ProfileService";
import { Avatar } from "@/components/ui/Avatar";
import { Cover } from "@/components/ui/Cover";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";

import { useApi } from "@/lib/hooks/useApi";
import { monthYear, ProfileActions, ProfileBanner, useMutualCommunities } from "./ProfileParts";
import { UserName } from "@/components/ui/UserName";

/** The small card (Discord's profile popover): banner, name, a line of bio, what you share, quick actions. */
export function ProfileCard({ handle, onClose, onExpand }: { handle: string; onClose: () => void; onExpand: () => void }) {
  const { data: view, loading, status, setData, reload } = useApi(() => ProfileService.get(handle), [handle]);
  const mutual = useMutualCommunities(view);

  if (loading) {
    return (
      <div className="space-y-3 p-4" aria-busy="true">
        <Skeleton className="h-16 rounded-card" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-12" />
      </div>
    );
  }
  if (!view) {
    return (
      <div className="p-5 text-sm text-ink-muted">
        <p className="font-semibold text-ink">{status === 404 ? "Person not found" : "Couldn't load this profile"}</p>
        <p className="mt-1">{status === 404 ? `Nobody goes by @${handle}.` : "Try again in a moment."}</p>
      </div>
    );
  }

  const p = view.profile;
  const place = [p.neighborhood, placeLabel(p)].filter(Boolean).join(", ");

  return (
    <div>
      <ProfileBanner handle={p.handle} bannerUrl={p.bannerUrl} bannerColor={p.bannerColor} className="h-16" />
      <div className="px-4 pb-4">
        <button type="button" onClick={onExpand} aria-label={`Open ${p.displayName}'s profile`} className="-mt-9 block rounded-full bg-surface p-1">
          <Avatar name={p.displayName} src={p.avatarUrl} frame={p.avatarFrame} size={72} />
        </button>
        <button type="button" onClick={onExpand} className="mt-2 block max-w-full text-left">
          <span className="block truncate text-lg font-semibold tracking-[-0.02em] hover:underline"><UserName name={p.displayName} effect={p.nameEffect} /></span>
        </button>
        <p className="font-mono text-xs text-ink-muted">@{p.handle}</p>

        {view.visible ? (
          <div className="mt-3 space-y-3 rounded-card border border-line bg-raised/50 p-3">
            {p.bio && <p className="line-clamp-3 text-[13px] leading-relaxed whitespace-pre-wrap">{p.bio}</p>}
            <div className="text-[12px] text-ink-muted">
              <p className="inline-flex items-center gap-1">
                <Icon name="pin" size={12} /> {place}
              </p>
              <p className="eyebrow mt-2">Klique member since</p>
              <p className="mt-0.5 text-[13px] text-ink">{monthYear(p.joinedAt)}</p>
            </div>
            {!view.isSelf && (
              <button type="button" onClick={onExpand} className="flex w-full items-center gap-2 text-left text-[12px] text-ink-muted hover:text-ink">
                <span className="flex -space-x-1.5">
                  {mutual.slice(0, 4).map((c) => (
                    <span key={c.id} className="relative block size-5 overflow-hidden rounded-md ring-2 ring-raised">
                      <Cover src={c.coverImage} seed={c.id} interest={c.interest} className="size-full" />
                    </span>
                  ))}
                </span>
                <span className="font-medium">
                  {mutual.length ? `${mutual.length} mutual ${mutual.length === 1 ? "community" : "communities"}` : "No mutual communities"}
                </span>
                <Icon name="chevron-right" size={13} className="ml-auto" />
              </button>
            )}
          </div>
        ) : (
          <p className="mt-3 rounded-card border border-line bg-raised/50 p-3 text-[13px] text-ink-muted">This profile is private.</p>
        )}

        <div className="mt-3">
          <ProfileActions view={view} onFriendship={(friendship) => setData((d) => (d ? { ...d, friendship } : d))} onReload={() => void reload()} onNavigate={onClose} />
        </div>
        <button type="button" onClick={onExpand} className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-accent-text hover:underline">
          View full profile <Icon name="arrow-up-right" size={13} />
        </button>
      </div>
    </div>
  );
}
