"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SubcommunityService } from "@/app/services/SubcommunityService";
import { SectionHeader } from "@/components/domain/SectionHeader";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
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
          {(data ?? []).map((g) => (
            <li key={g.id} className="flex flex-col rounded-card border border-line bg-surface p-4">
              <Link href={`/communities/${c.slug}?g=${g.slug}`} className="flex items-center gap-1.5 text-base font-semibold hover:underline">
                <Icon name="lock" size={13} className="shrink-0 text-ink-muted" />
                <span className="truncate">{g.name}</span>
              </Link>
              <p className="mt-1 line-clamp-2 min-h-10 text-[13px] text-ink-muted">{g.description || "No description yet."}</p>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                <span className="font-mono text-[11px] text-ink-muted">
                  {g.memberCount ?? 0}/{LIMITS.groupMembers} members
                </span>
                {g.viewer.role ? <span className="font-mono text-[11px] text-ink-muted capitalize">{g.viewer.role}</span> : <span className="font-mono text-[11px] text-ink-muted">Not in it</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && <GroupFormModal slug={c.slug} communityName={c.name} onClose={() => setOpen(false)} onCreated={(g) => router.push(`/communities/${c.slug}?g=${g}`)} />}
    </div>
  );
}

