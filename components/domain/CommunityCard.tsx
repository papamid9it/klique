"use client";

import { placeShort } from "@/lib/places";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArtCover } from "@/components/ui/Cover";
import { Cover } from "@/components/ui/Cover";
import { Icon } from "@/components/ui/Icon";
import { getInterest } from "@/lib/constants";
import type { CommunityCardDTO } from "@/lib/types";
import { JoinButton } from "./JoinButton";
import { MemberCount } from "./CommunityRow";

/** Grid card for browsing communities. Private communities you're not in show a lock and nothing else. */
export function CommunityCard({ community, onChange, tag }: { community: CommunityCardDTO; onChange?: (c: CommunityCardDTO) => void; tag?: string }) {
  const [c, setC] = useState(community);
  useEffect(() => setC(community), [community]);
  const update = (next: CommunityCardDTO) => {
    setC(next);
    onChange?.(next);
  };

  return (
    <article className="flex flex-col overflow-hidden rounded-card border border-line bg-surface transition hover:border-ink-muted/50">
      <Link href={`/communities/${c.slug}`} aria-label={`${c.name} — open community`} className="block">
        {c.locked ? (
          <div className="relative aspect-[16/9]">
            <ArtCover seed={c.id} interest={c.interest} glyph={false} className="absolute inset-0" />
            <span className="absolute inset-0 flex items-center justify-center text-ink">
              <Icon name="lock" size={28} />
            </span>
          </div>
        ) : (
          <Cover src={c.coverImage} seed={c.id} interest={c.interest} className="aspect-[16/9]">
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1 font-mono text-[10px] tracking-wide text-white uppercase backdrop-blur">
              {getInterest(c.interest).glyph} {getInterest(c.interest).short}
            </span>
          </Cover>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <p className="eyebrow flex items-center gap-1.5">
          {tag ?? `New community`}
          {!tag && <span aria-hidden="true">·</span>}
          {!tag && placeShort(c)}
        </p>
        <h3 className="mt-1.5 flex items-center gap-1.5 text-[17px] leading-snug font-semibold tracking-[-0.02em]">
          <Link href={`/communities/${c.slug}`} className="hover:underline hover:underline-offset-2">
            {c.name}
          </Link>
          {c.privacy === "private" && <Icon name="lock" size={14} className="shrink-0 text-ink-muted" />}
          {c.official && (
            <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink" title="Official Klique community">
              <Icon name="check" size={10} />
              <span className="sr-only">Official</span>
            </span>
          )}
        </h3>
        <p className="mt-1 line-clamp-2 min-h-10 text-[13px] text-ink-muted">
          {c.locked ? "A private community. Request to join and an admin will take a look." : c.description || `${getInterest(c.interest).name} in ${c.neighborhood || placeShort(c)}.`}
        </p>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3.5">
          <span className="font-mono text-[11px] text-ink-muted">
            {getInterest(c.interest).short} · <MemberCount community={c} />
          </span>
          <JoinButton community={c} onChange={update} />
        </div>
      </div>
    </article>
  );
}
