"use client";

import { JoinButton } from "@/components/domain/JoinButton";
import { Button } from "@/components/ui/Button";
import { VerifiedCheck } from "@/components/ui/VerifiedCheck";
import { placeLabel } from "@/lib/places";
import type { CommunityDTO } from "@/lib/types";

/**
 * A community link opened from outside Klique, like a Discord invite: its picture, name, what it is, how many are online
 * and in it, and Join (Ask to join, for a private one). Nothing inside shows until you're in; joining runs its welcome
 * (rules, questions, roles), then you land in it.
 */
export function InviteCard({ c, onJoined }: { c: CommunityDTO; onJoined: (next: CommunityDTO) => void }) {
  const members = c.memberCount ?? 0;
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <section aria-label={`Invite to ${c.name}`} className="w-full max-w-md overflow-hidden rounded-card border border-line bg-surface">
        <div className="relative h-36 bg-raised">
          {c.coverImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.coverImage} alt="" className="size-full object-cover" />
          )}
        </div>
        <div className="px-6 pb-6 text-center">
          <span className="relative -mt-9 inline-flex size-[72px] items-center justify-center overflow-hidden rounded-[20px] border-4 border-surface bg-raised text-2xl font-bold">
            {c.coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.coverImage} alt="" className="size-full object-cover" />
            ) : (
              c.name.slice(0, 1).toUpperCase()
            )}
          </span>
          <p className="eyebrow mt-3">You&apos;ve been invited to join</p>
          <h1 className="mt-1.5 flex items-center justify-center gap-1.5 text-2xl font-semibold tracking-[-0.03em]">
            <span className="min-w-0 truncate">{c.name}</span>
            <VerifiedCheck on={c.verified || c.official} size={18} />
          </h1>
          <p className="mt-1 text-sm text-ink-muted">{placeLabel(c)}</p>
          <p className="mt-3 flex items-center justify-center gap-4 text-[13px] text-ink-muted">
            {c.onlineCount !== undefined && (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[#23a55a]" aria-hidden="true" />
                {c.onlineCount.toLocaleString("en-NG")} online
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-ink-muted" aria-hidden="true" />
              {members.toLocaleString("en-NG")} {members === 1 ? "member" : "members"}
            </span>
          </p>
          {c.description && <p className="mx-auto mt-4 line-clamp-4 max-w-sm text-sm leading-relaxed text-ink-muted">{c.description}</p>}
          <div className="mt-6 flex flex-col items-stretch gap-2 [&>*]:w-full [&_button]:w-full">
            <JoinButton size="md" community={c} onChange={(next) => onJoined(next as CommunityDTO)} />
            <Button href="/" variant="ghost">
              Not now
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
