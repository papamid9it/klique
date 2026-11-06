"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { SpaceService } from "@/app/services/SpaceService";
import { PersonRow } from "@/components/domain/PersonRow";
import { ReportDialog } from "@/components/domain/ReportDialog";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button, Spinner } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useDebounced, useNow, usePaged } from "@/lib/hooks/useApi";
import type { MemberDTO, Role } from "@/lib/types";
import { ConfirmModal, RoleBadge } from "./parts";
import { AddMembersModal } from "./AddMembersModal";
import { LIMITS } from "@/lib/constants";
import { EntryAnswers } from "./EntryQuestions";
import { Modal } from "@/components/ui/Modal";
import { GroupModModal } from "./GroupModModal";
import { PostBanModal } from "./PostBanModal";
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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [handingOver, setHandingOver] = useState<MemberDTO | null>(null);
  const [adding, setAdding] = useState(false);
  const now = useNow(30_000);
  const [editingRoles, setEditingRoles] = useState<MemberDTO | null>(null);
  const [namingMod, setNamingMod] = useState<MemberDTO | null>(null);
  const [timingOut, setTimingOut] = useState<{ m: MemberDTO; lifting: boolean } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // "are you sure?" for what changes someone's standing with one click
  const [asking, setAsking] = useState<{ title: string; description: string; label: string; danger?: boolean; run: () => Promise<void> } | null>(null);
  const [postBanning, setPostBanning] = useState<MemberDTO | null>(null);
  const opened = openId ? (items.find((x) => x.user.id === openId) ?? null) : null;
  // an option that opens its own window: this one closes first
  const swap = (next: () => void) => {
    setOpenId(null);
    next();
  };
  const option = (label: string, icon: IconName, onClick: () => void, busy = false, danger = false) => (
    <button type="button" key={label} disabled={busy} onClick={onClick} className={`flex h-10 w-full items-center gap-2.5 rounded-control px-3 text-left text-sm font-medium hover:bg-raised disabled:opacity-60 ${danger ? "text-danger" : ""}`}>
      {busy ? <Spinner size={15} /> : <Icon name={icon} size={15} />} {label}
    </button>
  );
  async function liftPostBan(m: MemberDTO) {
    setBusyId(m.user.id);
    try {
      await SpaceService.setPostBan(slug, m.user.id, 0);
      setItems((prev) => prev.map((x) => (x.user.id === m.user.id ? { ...x, postBan: null } : x)));
      toast(`${m.user.displayName} can write in Posts and Boards again`, "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusyId(null);
    }
  }
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
          badge={m.roleBadge ? { icon: m.roleBadge.icon, label: m.roleBadge.name } : null}
          onOpen={() => setOpenId(m.user.id)}
          action={
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <RoleBadge role={m.role} />
              {m.title ? <span className="inline-flex items-center rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-ink">{m.title}</span> : null}
              {m.roles?.filter((r) => r.name !== "Admin").slice(0, 3).map((r) => <RoleChip key={r.id} role={r} className="hidden sm:inline-flex" />)}
              {isTimedOut(m, now) && (
                <span className="inline-flex items-center gap-1 rounded-full border border-danger/40 px-2 py-0.5 text-[11px] font-semibold text-danger" title={m.timeoutReason ?? undefined}>
                  <Icon name="clock" size={11} /> Timed out · {timeLeft(m.timedOutUntil!, now!)}
                </span>
              )}
              {m.postBan && (
                <span className="inline-flex items-center gap-1 rounded-full border border-danger/40 px-2 py-0.5 text-[11px] font-semibold text-danger" title={m.postBan.reason ?? undefined}>
                  <Icon name="ban" size={11} /> No Posts or Boards
                </span>
              )}
              <button type="button" onClick={() => setOpenId(m.user.id)} aria-label={`Open ${m.user.displayName}`} className="inline-flex size-8 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink">
                <Icon name="chevron-right" size={15} />
              </button>
            </div>
          }
        />
      ))}
      {opened && (
        <Modal open onClose={() => setOpenId(null)} title={opened.user.displayName} description={`@${opened.user.handle} · Joined ${new Date(opened.joinedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`} size="sm">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar name={opened.user.displayName} src={opened.user.avatarUrl} frame={opened.user.avatarFrame} size={56} />
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <RoleBadge role={opened.role} />
                {opened.title ? <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-ink">{opened.title}</span> : null}
                {opened.roles?.filter((r) => r.name !== "Admin").map((r) => <RoleChip key={r.id} role={r} />)}
              </div>
            </div>
            {isTimedOut(opened, now) && <p className="rounded-control border border-danger/40 px-3 py-2 text-sm text-ink">Timed out · {timeLeft(opened.timedOutUntil!, now!)}{opened.timeoutReason ? `. ${opened.timeoutReason}` : ""}</p>}
            {opened.postBan && <p className="rounded-control border border-danger/40 px-3 py-2 text-sm text-ink">Can&apos;t write in Posts or on Boards{opened.postBan.until && now ? ` · ${timeLeft(opened.postBan.until, now)}` : " until it's lifted"}{opened.postBan.reason ? `. ${opened.postBan.reason}` : ""}. They can still chat.</p>}
            {opened.answers?.length ? <EntryAnswers answers={opened.answers} /> : null}
            <div className="space-y-1.5">
              <ProfileTrigger handle={opened.user.handle} className="flex h-10 w-full items-center gap-2.5 rounded-control px-3 text-left text-sm font-medium hover:bg-raised">
                <Icon name="user" size={15} /> View profile
              </ProfileTrigger>
              {opened.canChangeRole && opened.role !== "owner" && option(opened.role === "admin" ? "Make member" : "Make admin", "shield", () => swap(() => setAsking(opened.role === "admin" ? { title: `Make ${opened.user.displayName} a member?`, description: "They'll stop being an admin here.", label: "Make member", run: () => changeRole(opened, "member") } : { title: `Make ${opened.user.displayName} an admin?`, description: "They'll be able to manage members, channels and events here.", label: "Make admin", danger: false, run: () => changeRole(opened, "admin") })), busyId === opened.user.id)}
              {iOwn && opened.user.id !== user?.id && option("Make owner", "shield", () => swap(() => setHandingOver(opened)))}
              {opened.canEditRoles && option("Roles", "shield", () => swap(() => setEditingRoles(opened)))}
              {opened.canEditMod && option("Title and powers", "shield", () => swap(() => setNamingMod(opened)))}
              {opened.canTimeout && option(isTimedOut(opened, now) ? "Lift timeout" : "Time out", "clock", () => swap(() => setTimingOut({ m: opened, lifting: isTimedOut(opened, now) })))}
              {opened.canPostBan && (opened.postBan ? option("Let them write in Posts and Boards", "check", () => swap(() => setAsking({ title: `Let ${opened.user.displayName} write again?`, description: "They'll be able to post and comment in Posts and on Boards.", label: "Let them write", danger: false, run: () => liftPostBan(opened) })), busyId === opened.user.id) : option("Stop from Posts and Boards", "ban", () => swap(() => setPostBanning(opened))))}
              {opened.canRemove && option("Remove", "logout", () => swap(() => setRemoving({ m: opened, ban: false })))}
              {opened.canRemove && option("Ban", "ban", () => swap(() => setRemoving({ m: opened, ban: true })), false, true)}
              {user && opened.user.id !== user.id && option("Report", "flag", () => swap(() => setReporting(opened)))}
            </div>
          </div>
        </Modal>
      )}
      {postBanning && (
        <PostBanModal
          slug={slug}
          user={postBanning.user}
          onClose={() => setPostBanning(null)}
          onDone={(postBan) => {
            const id = postBanning.user.id;
            setItems((prev) => prev.map((x) => (x.user.id === id ? { ...x, postBan } : x)));
            setPostBanning(null);
          }}
        />
      )}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button onClick={loadMore} loading={loadingMore}>
            Load more
          </Button>
        </div>
      )}

      {namingMod && subSlug && (
        <GroupModModal
          slug={slug}
          subSlug={subSlug}
          member={namingMod}
          onClose={() => setNamingMod(null)}
          onSaved={(title, powers) => {
            const id = namingMod.user.id;
            setItems((prev) => prev.map((x) => (x.user.id === id ? { ...x, title, powers } : x)));
            setNamingMod(null);
          }}
        />
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

      <ConfirmModal open={!!asking} onClose={() => setAsking(null)} title={asking?.title ?? ""} description={asking?.description} confirmLabel={asking?.label ?? ""} danger={asking?.danger ?? true} onConfirm={async () => {
        await asking?.run();
        setAsking(null);
      }} />
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
