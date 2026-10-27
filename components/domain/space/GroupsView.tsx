"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChannelService } from "@/app/services/ChannelService";
import { SubcommunityService } from "@/app/services/SubcommunityService";
import { SectionHeader } from "@/components/domain/SectionHeader";
import { Button } from "@/components/ui/Button";
import { CountBadge } from "@/components/ui/CountBadge";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/States";
import { useApi } from "@/lib/hooks/useApi";
import { LIMITS } from "@/lib/constants";
import type { CommunityDTO } from "@/lib/types";
import { GroupFormModal } from "./GroupFormModal";
import { SpaceError } from "./parts";

export function GroupsView({ c }: { c: CommunityDTO }) {
  const router = useRouter();
  const { data, loading, error, status, reload } = useApi(() => SubcommunityService.list(c.slug), [c.slug], { key: `groups:${c.slug}` });
  // the same live list the channels sidebar uses (same key): each group you're in, with its unread messages
  const channels = useApi(c.viewer.isMember ? () => ChannelService.list({ slug: c.slug }) : null, [c.slug, c.viewer.isMember], { key: `channels:${c.slug}` });
  const unreadOf = (slug: string) => {
    const g = channels.data?.groups.find((x) => x.slug === slug);
    return g ? { n: g.channels.reduce((a, ch) => a + (ch.unreadCount ?? 0), 0), mentions: g.channels.reduce((a, ch) => a + ch.mentions, 0) } : { n: 0, mentions: 0 };
  };
  const [open, setOpen] = useState(false);
  const canCreate = c.canCreateGroup;

  return (
    <div>
      <SectionHeader
        title="Groups"
        action={
          canCreate ? (
            <Button variant="primary" onClick={() => setOpen(true)}>
              <Icon name="plus" size={15} /> New group
            </Button>
          ) : undefined
        }
      />
      {loading ? (
        <RowSkeleton rows={2} />
      ) : error ? (
        <SpaceError status={status} message={error} onRetry={reload} />
      ) : !(data ?? []).length ? (
        <EmptyState icon="folder" title="No groups yet" compact>
          {canCreate ? `Groups are small private spaces inside this community, like a beginners crew or a Saturday ride. You add people yourself, up to ${LIMITS.groupMembers}.` : "You're not in any group here. A group's admins can add you."}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {(data ?? []).map((g) => {
            const u = unreadOf(g.slug);
            const fresh = !!g.viewer.role && (u.n > 0 || u.mentions > 0);
            return (
            <li key={g.id} className={cx("flex flex-col rounded-card border bg-surface p-4", fresh ? "border-ink-muted/60" : "border-line")}>
              <Link href={`/communities/${c.slug}?g=${g.slug}`} className={cx("flex items-center gap-1.5 text-base hover:underline", fresh ? "font-bold text-ink" : "font-semibold")}>
                <Icon name="lock" size={13} className="shrink-0 text-ink-muted" />
                <span className="truncate">{g.name}</span>
                {fresh && (
                  <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-[12px] font-semibold text-ink">
                    <CountBadge n={Math.max(u.n, u.mentions)} mention={u.mentions > 0} label={`${u.n} new`} /> new
                  </span>
                )}
              </Link>
              <p className="mt-1 line-clamp-2 min-h-10 text-[13px] text-ink-muted">{g.description || "No description yet."}</p>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                <span className="font-mono text-[11px] text-ink-muted">
                  {g.memberCount ?? 0}/{LIMITS.groupMembers} members
                </span>
                {g.viewer.role ? (
                  <Button size="sm" variant={fresh ? "primary" : "secondary"} href={`/communities/${c.slug}?g=${g.slug}`}>
                    Open
                  </Button>
                ) : (
                  <span className="font-mono text-[11px] text-ink-muted">Not in it</span>
                )}
              </div>
            </li>
            );
          })}
        </ul>
      )}

      {open && <GroupFormModal slug={c.slug} communityName={c.name} onClose={() => setOpen(false)} onCreated={(g) => router.push(`/communities/${c.slug}?g=${g}`)} />}
    </div>
  );
}

