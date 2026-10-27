"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { SpaceService } from "@/app/services/SpaceService";
import { PersonRow } from "@/components/domain/PersonRow";
import { OverflowMenu } from "@/components/domain/OverflowMenu";
import { ReportDialog } from "@/components/domain/ReportDialog";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useDebounced, usePaged } from "@/lib/hooks/useApi";
import type { MemberDTO, Role } from "@/lib/types";
import { ConfirmModal, RoleBadge } from "./parts";
import { AddMembersModal } from "./AddMembersModal";
import { LIMITS } from "@/lib/constants";

/** For a group: what the "Add members" button needs (shown to the group's owners and admins). */
export interface GroupAdding {
  name: string;
  communityName: string;
  memberCount: number;
  canAdd: boolean;
  onChanged?: () => void;
}

export function MembersPanel({ slug, subSlug, group }: { slug: string; subSlug?: string; group?: GroupAdding }) {
  const { user } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim());
  const { items, loading, loadingMore, error, hasMore, loadMore, reload, setItems } = usePaged<MemberDTO>((p) => SpaceService.members(slug, subSlug, p, dq || undefined), [slug, subSlug, dq], { keepPrevious: true, key: `members:${slug}:${subSlug ?? ""}:${dq}` });
  const [removing, setRemoving] = useState<{ m: MemberDTO; ban: boolean } | null>(null);
  const [reporting, setReporting] = useState<MemberDTO | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [handingOver, setHandingOver] = useState<MemberDTO | null>(null);
  const [adding, setAdding] = useState(false);
  const iOwn = !!user && items.some((x) => x.user.id === user.id && x.role === "owner");

  async function changeRole(m: MemberDTO, role: Exclude<Role, "owner">) {
    setBusyId(m.user.id);
    try {
      await SpaceService.changeRole(slug, m.user.id, role, subSlug);
      setItems((prev) => prev.map((x) => (x.user.id === m.user.id ? { ...x, role } : x)));
      toast(`${m.user.displayName} is now ${role === "admin" ? "an admin" : "a member"}`, "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusyId(null);
    }
  }

  const addBar =
    group && subSlug && group.canAdd ? (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3">
        <p className="text-sm text-ink-muted">
          <span className="font-semibold text-ink">
            {group.memberCount}/{LIMITS.groupMembers}
          </span>{" "}
          people. Only people you add can see this group.
        </p>
        <Button size="sm" variant="primary" onClick={() => setAdding(true)} disabled={group.memberCount >= LIMITS.groupMembers}>
          <Icon name="userplus" size={14} /> {group.memberCount >= LIMITS.groupMembers ? "Group is full" : "Add members"}
        </Button>
        {adding && (
          <AddMembersModal
            slug={slug}
            subSlug={subSlug}
            groupName={group.name}
            communityName={group.communityName}
            memberCount={group.memberCount}
            onClose={() => setAdding(false)}
            onAdded={() => {
              void reload();
              group.onChanged?.();
            }}
          />
        )}
      </div>
    ) : null;

  const search = (
    <label className="relative mb-4 block">
      <span className="sr-only">Search members by name</span>
      <Icon name="search" size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" />
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members by name or @handle" className="h-10 w-full rounded-full border border-line bg-surface pr-3 pl-10 text-sm text-ink placeholder:text-ink-muted/70 focus:border-accent-text focus:outline-none" />
    </label>
  );

  if (loading && items.length === 0) return <div>{addBar}{search}<RowSkeleton /></div>;
  if (error) return <div>{addBar}{search}<ErrorState message={error} onRetry={reload} /></div>;
  if (!items.length) return <div>{addBar}{search}<EmptyState icon="users" title={dq ? `No members match “${dq}”` : "No members to show"} compact /></div>;

  return (
    <div className="space-y-2">
      {addBar}
      {search}
      {items.map((m) => (
        <PersonRow
          key={m.user.id}
          user={m.user}
          action={
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <RoleBadge role={m.role} />
              {m.canChangeRole && m.role !== "owner" && (
                <select
                  aria-label={`Role for ${m.user.displayName}`}
                  value={m.role}
                  disabled={busyId === m.user.id}
                  onChange={(e) => void changeRole(m, e.target.value as "admin" | "member")}
                  className="h-8 rounded-control border border-line bg-raised px-2 text-[13px] text-ink"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              )}
              {/* phones: these fold into ⋯ so each person stays one row */}
              <span className="hidden sm:contents">
                {iOwn && m.user.id !== user?.id && (
                  <Button size="sm" variant="ghost" onClick={() => setHandingOver(m)}>
                    Make owner
                  </Button>
                )}
                {m.canRemove && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setRemoving({ m, ban: false })}>
                      Remove
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setRemoving({ m, ban: true })}>
                      Ban
                    </Button>
                  </>
                )}
                {user && m.user.id !== user.id && (
                  <Button size="sm" variant="ghost" onClick={() => setReporting(m)} aria-label={`Report ${m.user.displayName}`}>
                    Report
                  </Button>
                )}
              </span>
              <OverflowMenu
                className="sm:hidden"
                label={`Options for ${m.user.displayName}`}
                items={[
                  ...(iOwn && m.user.id !== user?.id ? [{ label: "Make owner", icon: "shield" as const, onSelect: () => setHandingOver(m) }] : []),
                  ...(m.canRemove ? [{ label: "Remove", icon: "logout" as const, onSelect: () => setRemoving({ m, ban: false }) }, { label: "Ban", icon: "ban" as const, danger: true, onSelect: () => setRemoving({ m, ban: true }) }] : []),
                  ...(user && m.user.id !== user.id ? [{ label: "Report", icon: "flag" as const, onSelect: () => setReporting(m) }] : []),
                ]}
              />
            </div>
          }
        />
      ))}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button onClick={loadMore} loading={loadingMore}>
            Load more
          </Button>
        </div>
      )}

      <ConfirmModal
        open={!!handingOver}
        onClose={() => setHandingOver(null)}
        title={`Make ${handingOver?.user.displayName ?? ""} the owner?`}
        description="They get full control, including deleting it. You stay on as an admin and can't undo this yourself."
        confirmLabel="Hand over ownership"
        onConfirm={async () => {
          if (!handingOver) return;
          await SpaceService.transferOwnership(slug, handingOver.user.id, subSlug);
          setItems((prev) => prev.map((x) => (x.user.id === handingOver.user.id ? { ...x, role: "owner" } : x.user.id === user?.id ? { ...x, role: "admin" } : x)));
          toast(`${handingOver.user.displayName} is now the owner`, "success");
          setHandingOver(null);
        }}
      />

      <ConfirmModal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={removing?.ban ? `Ban ${removing.m.user.displayName}?` : `Remove ${removing?.m.user.displayName ?? ""}?`}
        description={removing?.ban ? "They'll be removed and won't be able to rejoin." : "They'll be removed but can join again later."}
        confirmLabel={removing?.ban ? "Ban member" : "Remove member"}
        onConfirm={async () => {
          if (!removing) return;
          await SpaceService.removeMember(slug, removing.m.user.id, { ban: removing.ban, subSlug });
          setItems((prev) => prev.filter((x) => x.user.id !== removing.m.user.id));
          toast(removing.ban ? "Member banned" : "Member removed", "success");
        }}
      />
      {reporting && <ReportDialog open onClose={() => setReporting(null)} targetType="user" targetId={reporting.user.id} subject={`@${reporting.user.handle}`} />}
    </div>
  );
}
