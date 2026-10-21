"use client";

import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import Link from "next/link";
import { ChannelService } from "@/app/services/ChannelService";
import { ShareButton } from "@/components/domain/ShareButton";
import { RoleBadge } from "@/components/domain/space/parts";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApi } from "@/lib/hooks/useApi";
import { LIMITS } from "@/lib/constants";
import type { SubcommunityDTO } from "@/lib/types";
import { UserName } from "@/components/ui/UserName";

/** A group's About (opened from its name menu): what it is, whose it is, who runs it, share. Leave is in that menu. */
export function GroupInfo({ group: g, onNavigate }: { group: SubcommunityDTO; onNavigate?: () => void }) {
  const parentHref = `/communities/${g.parent.slug}`;
  const base = `${parentHref}?g=${g.slug}`;
  const canSeeStaff = g.viewer.canView && !g.moderationOnly;
  const staff = useApi(canSeeStaff ? () => ChannelService.staff({ slug: g.parent.slug, sub: g.slug }) : null, [g.slug, g.viewer.role, canSeeStaff], { key: `staff:${g.parent.slug}:${g.slug}:${g.viewer.role}` });
  const v = g.viewer;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <Link href={parentHref} onClick={onNavigate} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-text hover:underline">
          <Icon name="arrow-left" size={13} /> Group of {g.parent.name}
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Chip>
            <Icon name="lock" size={11} /> Private group
          </Chip>
          {v.role && <RoleBadge role={v.role} />}
        </div>
        <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em] break-words">{g.name}</h2>
        <p className="mt-1.5 inline-flex items-center gap-1 text-[13px] text-ink-muted">
          <Icon name="users" size={13} /> {g.memberCount ?? 0}/{LIMITS.groupMembers} members
        </p>
        <p className={g.description ? "mt-3 text-sm leading-relaxed whitespace-pre-wrap text-ink" : "mt-3 text-sm text-ink-muted"}>{g.description || "No description yet."}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {v.isMember ? (
            v.role === "owner" && <Chip tone="accent">You own this</Chip>
          ) : v.canManage ? (
            <Button size="sm" variant="primary" href={`${base}&view=members`} onClick={onNavigate}>
              <Icon name="userplus" size={13} /> Add yourself
            </Button>
          ) : null}
          <ShareButton path={base} text={`${g.name} — ${g.parent.name} on klique`} label="Share" />
        </div>
      </section>

      {canSeeStaff && (
        <section>
          <h3 className="eyebrow mb-3">Admins</h3>
          {staff.loading ? (
            <Skeleton className="h-10" />
          ) : (
            <ul className="space-y-1">
              {(staff.data ?? []).map((s) => (
                <li key={s.user.id}>
                  <ProfileTrigger handle={s.user.handle} className="flex items-center gap-3 rounded-control p-1.5 hover:bg-raised text-left">
                    <Avatar name={s.user.displayName} src={s.user.avatarUrl} frame={s.user.avatarFrame} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold"><UserName name={s.user.displayName} effect={s.user.nameEffect} /></span>
                      <span className="block truncate font-mono text-[11px] text-ink-muted">@{s.user.handle}</span>
                    </span>
                    <RoleBadge role={s.role} />
                  </ProfileTrigger>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
