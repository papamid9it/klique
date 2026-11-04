"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { SpaceService } from "@/app/services/SpaceService";
import { PersonRow } from "@/components/domain/PersonRow";
import { OverflowMenu } from "@/components/domain/OverflowMenu";
import { ReportDialog } from "@/components/domain/ReportDialog";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button, Spinner } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useDebounced, useNow, usePaged } from "@/lib/hooks/useApi";
import type { MemberDTO, Role } from "@/lib/types";
import { ConfirmModal, RoleBadge } from "./parts";
import { AddMembersModal } from "./AddMembersModal";
import { LIMITS } from "@/lib/constants";
import { EntryAnswers } from "./EntryQuestions";
import { Modal } from "@/components/ui/Modal";
import { TimeoutModal, timeLeft } from "./TimeoutModal";
import { MemberRolesModal, RoleChip } from "./RolesPanel";

const isTimedOut = (m: MemberDTO, now: Date | null) => !!now && !!m.timedOutUntil && +new Date(m.timedOutUntil) > +now;

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
  const [answersOf, setAnswersOf] = useState<MemberDTO | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [handingOver, setHandingOver] = useState<MemberDTO | null>(null);
  const [adding, setAdding] = useState(false);
  const now = useNow(30_000);
  const [editingRoles, setEditingRoles] = useState<MemberDTO | null>(null);
  const [timingOut, setTimingOut] = useState<{ m: MemberDTO; lifting: boolean } | null>(null);
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
      {answersOf && (
        <Modal open onClose={() => setAnswersOf(null)} title={`${answersOf.user.displayName}'s answers`} description="What they answered to the entry questions when they joined." size="sm">
          <EntryAnswers answers={answersOf.answers} />
        </Modal>
      )}
      {items.map((m) => (
        <PersonRow
          key={m.user.id}
          user={m.user}
          badge={m.roleBadge ? { icon: m.roleBadge.icon, label: m.roleBadge.name } : null}
          action={
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {/* what they answered to the entry questions (owners and admins see this) */}
              {m.answers?.length ? (
                <Button size="sm" variant="ghost" onClick={() => setAnswersOf(m)}>
                  Answers
                </Button>
              ) : null}
              <RoleBadge role={m.role} />
              {m.roles?.filter((r) => r.name !== "Admin").slice(0, 3).map((r) => <RoleChip key={r.id} role={r} className="hidden sm:inline-flex" />)}
              {isTimedOut(m, now) && (
                <span className="inline-flex items-center gap-1 rounded-full border border-danger/40 px-2 py-0.5 text-[11px] font-semibold text-danger" title={m.timeoutReason ?? undefined}>
                  <Icon name="clock" size={11} /> Timed out · {timeLeft(m.timedOutUntil!, now!)}
                </span>
              )}
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
              {busyId === m.user.id && <Spinner size={14} />}
              {/* phones: these fold into ⋯ so each person stays one row */}
              <span className="hidden sm:contents">
                {iOwn && m.user.id !== user?.id && (
                  <Button size="sm" variant="ghost" onClick={() => setHandingOver(m)}>
                    Make owner
                  </Button>
                )}
                {m.canEditRoles && (
                  <Button size="sm" variant="ghost" onClick={() => setEditingRoles(m)}>
                    Roles
                  </Button>
                )}
                {m.canTimeout && (
                  <Button size="sm" variant="ghost" onClick={() => setTimingOut({ m, lifting: isTimedOut(m, now) })}>
                    {isTimedOut(m, now) ? "Lift timeout" : "Time out"}
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
                  ...(m.canEditRoles ? [{ label: "Roles", icon: "shield" as const, onSelect: () => setEditingRoles(m) }] : []),
                  ...(m.canTimeout ? [{ label: isTimedOut(m, now) ? "Lift timeout" : "Time out", icon: "clock" as const, onSelect: () => setTimingOut({ m, lifting: isTimedOut(m, now) }) }] : []),
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

      {editingRoles && (
        <MemberRolesModal
          slug={slug}
          user={editingRoles.user}
          current={(editingRoles.roles ?? []).map((r) => r.id)}
          onClose={() => setEditingRoles(null)}
          onSaved={(roles) => {
            const id = editingRoles.user.id;
            const admin = roles.some((r) => r.builtin === "admin");
            setItems((prev) => prev.map((x) => (x.user.id === id ? { ...x, roles, role: x.role === "owner" ? x.role : admin ? "admin" : "member" } : x)));
            setEditingRoles(null);
          }}
        />
      )}
      {timingOut && (
        <TimeoutModal
          slug={slug}
          user={timingOut.m.user}
          lifting={timingOut.lifting}
          onClose={() => setTimingOut(null)}
          onDone={(until) => {
            const id = timingOut.m.user.id;
            setItems((prev) => prev.map((x) => (x.user.id === id ? { ...x, timedOutUntil: until } : x)));
            setTimingOut(null);
          }}
        />
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
