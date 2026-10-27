"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cx } from "@/components/ui/cx";
import { SCENE_DOT } from "@/components/layout/nav";
import { Icon } from "@/components/ui/Icon";
import { getInterest } from "@/lib/constants";
import { compactCount } from "@/lib/format";
import type { CommunityCardDTO } from "@/lib/types";
import { JoinButton } from "./JoinButton";

export function InterestTile({ interest, size = 44, className }: { interest: CommunityCardDTO["interest"]; size?: number; className?: string }) {
  const i = getInterest(interest);
  return (
    <span
      aria-hidden="true"
      className={cx("inline-flex shrink-0 items-center justify-center rounded-xl font-semibold text-ink", className)}
      style={{ width: size, height: size, fontSize: size * 0.42, background: `color-mix(in oklab, ${SCENE_DOT[interest]} 30%, var(--raised))` }}
    >
      {i.glyph}
    </span>
  );
}

export function MemberCount({ community }: { community: Pick<CommunityCardDTO, "memberCount" | "locked" | "privacy"> }) {
  if (community.memberCount === null) return <>Private</>;
  return <>{compactCount(community.memberCount)} members</>;
}

/** Compact list row: tile · name · "SKATE · 342 MEMBERS" · join. Owns its join state. */
export function CommunityRow({ community, compact, onChange }: { community: CommunityCardDTO; compact?: boolean; onChange?: (c: CommunityCardDTO) => void }) {
  const [c, setC] = useState(community);
  useEffect(() => setC(community), [community]);
  const update = (next: CommunityCardDTO) => {
    setC(next);
    onChange?.(next);
  };

  return (
    <div className={cx("flex items-center gap-3.5", compact ? "py-3.5" : "rounded-card border border-line bg-surface p-3.5")}>
      <Link href={`/communities/${c.slug}`} className="flex min-w-0 flex-1 items-center gap-3.5 rounded-control">
        <InterestTile interest={c.interest} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <span className="truncate">{c.name}</span>
            {c.privacy === "private" && <Icon name="lock" size={12} className="shrink-0 text-ink-muted" />}
          </span>
          <span className="eyebrow mt-0.5 block truncate">
            {getInterest(c.interest).short} · <MemberCount community={c} />
            {!c.viewer.isMember && c.minPointsJoin > 0 && <> · Needs {c.minPointsJoin.toLocaleString("en-NG")} points</>}
          </span>
        </span>
      </Link>
      <JoinButton community={c} onChange={update} iconOnly />
    </div>
  );
}
