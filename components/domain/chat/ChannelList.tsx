"use client";

import { LiveRow } from "@/components/domain/live/Live";
import { SetupChecklist } from "@/components/domain/space/SetupChecklist";
import { CauseButtons } from "@/components/domain/money/Causes";
import { KLIQUE_SLUG, LIMITS } from "@/lib/constants";
import { SoftLink } from "@/components/ui/SoftLink";
import { isSamePage, softNavigate } from "@/lib/nav";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState, useEffect } from "react";
import { ChannelService } from "@/app/services/ChannelService";
import { CommunityService } from "@/app/services/CommunityService";
import { SpaceService } from "@/app/services/SpaceService";
import { TopicService } from "@/app/services/TopicService";
import { BoardFormModal } from "@/components/domain/topics/BoardFormModal";
import { absoluteUrl } from "@/components/domain/ShareButton";
import { GroupFormModal } from "@/components/domain/space/GroupFormModal";
import { ConfirmModal } from "@/components/domain/space/parts";
import { useToast } from "@/components/providers/ToastProvider";
import { ContextMenu, Dropdown, type MenuEntry } from "@/components/ui/Dropdown";
import { emitAppEvent } from "@/lib/appEvents";
import { usePins } from "@/lib/hooks/usePins";
import { Icon, type IconName } from "@/components/ui/Icon";
import { crewLeaveWarning } from "@/components/domain/crews/parts";
import { CountBadge } from "@/components/ui/CountBadge";
import { cx } from "@/components/ui/cx";
import { compactCount } from "@/lib/format";
import type { BoardDTO, ChannelCategoryDTO, ChannelDTO, ChannelGroupDTO, ChannelsDTO, CommunityDTO, Move, MyCrewDTO } from "@/lib/types";
import { CategoryModal, ChannelSettings, CreateChannelModal } from "./ChannelFormModal";

export type WorkspaceView = "dashboard" | "review" | "topics" | "posts" | "events" | "kliques" | "search" | "members";
export type GroupView = "updates" | "events" | "kliques" | "members";

import { orderChannels } from "./order";
import { VerifiedCheck } from "@/components/ui/VerifiedCheck";
import { useAuth } from "@/components/providers/AuthProvider";
import ApiClient, { errorMessage } from "@/app/ApiCore";
import { CommunityNotifyModal } from "@/components/domain/space/CommunityNotifySettings";
export { orderChannels };

async function copy(text: string, toast: (m: string, t?: "success" | "error") => void, done = "Link copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(done, "success");
  } catch {
    toast(`Couldn't copy it. Here's the link: ${text}`, "error");
  }
}

/**
 * Left pane of the community workspace, laid out like Discord: the community name is a dropdown
 * (about, invite, settings, create, leave), the non-chat views sit under it, then the channel tree.
 * Every management action lives in a dropdown; every change is re-authorized on the server.
 */
export function ChannelList({
  community: c,
  data,
  activeChannel,
  activeGroup,
  view,
  boards,
  activeBoard,
  activeTopic = null,
  onBoardsChanged,
  onChanged,
  onNavigate,
  onLeave,
  onReport,
  onAbout,
  crews = [],
  activeCrew = null,
}: {
  community: CommunityDTO;
  data: ChannelsDTO;
  activeChannel: string | null;
  /** slug of the group being viewed (its section opens), or null for the community itself */
  activeGroup: string | null;
  view: WorkspaceView | GroupView | null;
  /** the community's topic boards (admin-named sections) */
  boards: BoardDTO[];
  /** slug of the board being viewed */
  activeBoard: string | null;
  /** the post open beside its board (its unread count is read) */
  activeTopic?: string | null;
  onBoardsChanged: () => void;
  onChanged: () => void;
  onNavigate?: () => void;
  onLeave: () => void;
  onReport: () => void;
  /** open the community's (or the open group's) About: description, admins, what's coming up, share */
  onAbout: () => void;
  /** kliques you're in (or asked to join) in this community */
  crews?: MyCrewDTO[];
  /** id of the crew being viewed */
  activeCrew?: string | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const base = `/communities/${c.slug}`;
  const manage = c.viewer.canManage;
  // channels and categories: admins, and roles with "Manage channels"
  const chMgr = manage || !!c.viewer.perms?.includes("manageChannels");
  const sections = useMemo(() => orderChannels(data), [data]);
  // sections you've closed stay closed on this device until you open them again
  const foldedKey = `klique.folded.${c.slug}`;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      setCollapsed(new Set(JSON.parse(localStorage.getItem(foldedKey) ?? "[]") as string[]));
    } catch {
      setCollapsed(new Set());
    }
  }, [foldedKey]);
  const [creating, setCreating] = useState<{ categoryId: string | null; sub?: string | null } | null>(null);
  const [editing, setEditing] = useState<{ channel: ChannelDTO; sub: string | null; tab: "overview" | "permissions" } | null>(null);
  const [deletingChannel, setDeletingChannel] = useState<{ channel: ChannelDTO; sub: string | null } | null>(null);
  const [leavingGroup, setLeavingGroup] = useState<ChannelGroupDTO | null>(null);
  const [categoryModal, setCategoryModal] = useState<{ category?: ChannelCategoryDTO } | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<ChannelCategoryDTO | null>(null);
  const [newGroup, setNewGroup] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [boardModal, setBoardModal] = useState<{ board?: BoardDTO } | null>(null);
  const [deletingBoard, setDeletingBoard] = useState<BoardDTO | null>(null);

  const toggle = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      try {
        localStorage.setItem(foldedKey, JSON.stringify([...n]));
      } catch {
        /* private window or storage full: it just won't be remembered */
      }
      return n;
    });

  function go(href: string) {
    if (isSamePage(href)) softNavigate(href);
    else router.push(href, { scroll: false });
    onNavigate?.();
  }

  const pins = usePins(`channels:${c.slug}`);
  const inviteCommunity = () => (c.privacy === "private" && manage ? go(`${base}?settings=invites`) : void copy(absoluteUrl(base), toast, "Community link copied"));

  // site admins only: give or take the "Verified" check (logged in the audit log; Klique HQ keeps it)
  const siteAdmin = !!useAuth().user?.isAdmin;
  async function setVerified(on: boolean) {
    try {
      await new ApiClient().patch(`/api/admin/communities/${c.id}`, { verified: on });
      toast(on ? `${c.name} is verified` : `${c.name} is no longer verified`, "success");
      onChanged();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  // waiting for this viewer to approve: shown as a badge, like an unread count
  const toReview = c.review ? c.review.events + (c.review.canRequests ? c.review.requests : 0) : 0;
  const headerMenu: MenuEntry[] = [
    // owners and admins: members and growth, events to approve, money
    ...(c.viewer.canManage ? ([{ label: "Dashboard", icon: "sliders", onSelect: () => go(`${base}?view=dashboard`) }] as MenuEntry[]) : []),
    { label: "About this community", icon: "info", onSelect: onAbout },
    { label: "Invite people", icon: "userplus", onSelect: inviteCommunity },
    // your own notification settings here ("Suppress @everyone and @here", an on/off switch)
    ...(c.viewer.isMember ? ([{ label: "Notification settings", icon: "bell", onSelect: () => setNotifyOpen(true) }] as MenuEntry[]) : []),
    ...(manage ? ([{ label: "Community settings", icon: "sliders", onSelect: () => go(`${base}?settings=overview`) }] as MenuEntry[]) : (c.viewer.perms ?? []).some((p) => ["kick", "ban", "timeout", "manageRoles", "viewModLog", "manageWebhooks", "manageEmoji"].includes(p)) ? ([{ label: "Moderation", icon: "shield", onSelect: () => go(`${base}?settings=members`) }] as MenuEntry[]) : []),
    ...(manage || c.canCreateGroup ? ([{ type: "sep" }] as MenuEntry[]) : []),
    ...(manage ? ([{ label: "Create board", icon: "topics", onSelect: () => setBoardModal({}) }] as MenuEntry[]) : []),
    ...(chMgr ? ([{ label: "Create channel", icon: "plus", onSelect: () => setCreating({ categoryId: null }) }, { label: "Create category", icon: "folder", onSelect: () => setCategoryModal({}) }] as MenuEntry[]) : []),
    ...(c.canCreateGroup ? ([{ label: "Create group", icon: "users", onSelect: () => setNewGroup(true) }] as MenuEntry[]) : []),
    { type: "sep" },
    // nobody leaves Klique (the default community: announcements and Klique's own events live there)
    ...(c.viewer.isMember && c.viewer.role !== "owner" && !(c.official && c.slug === KLIQUE_SLUG) ? ([{ label: "Leave community", icon: "logout", danger: true, onSelect: onLeave }] as MenuEntry[]) : []),
    { label: "Report community", icon: "flag", danger: true, onSelect: onReport },
    ...(siteAdmin && !c.official ? ([{ type: "sep" }, { label: c.verified ? "Remove Verified (admin)" : "Give Verified badge (admin)", icon: "check", onSelect: () => void setVerified(!c.verified) }] as MenuEntry[]) : []),
  ];

  const nav: { id: WorkspaceView; label: string; icon: IconName; count?: number | null; badge?: number; show: boolean }[] = [
    // members' events waiting for approval and join requests (owners, admins, and roles with "Approve and manage events")
    { id: "review", label: "To review", icon: "shield", badge: toReview, show: !!c.review },
    // the Posts section (pictures and videos), when the community has it turned on
    { id: "posts", label: "Posts", icon: "image", show: c.feedPolicy !== "off" },
    { id: "events", label: "Events", icon: "calendar", count: c.upcomingEventCount, show: true },
    // a community's own kliques (switched off: its events' kliques still show on each event)
    { id: "kliques", label: "Kliques", icon: "pin", show: c.kliquesOn },
    // the member list is for owners, admins and moderators
    { id: "members", label: "Members", icon: "users", count: c.memberCount, show: !!c.viewer.canSeeMembers },
  ];

  const modals = (
    <>
      {creating && (
        <CreateChannelModal
          space={{ slug: c.slug, sub: creating.sub ?? null }}
          categories={creating.sub ? [] : data.categories}
          defaultCategoryId={creating.categoryId}
          onClose={() => setCreating(null)}
          onSaved={(ch) => {
            const sub = creating.sub;
            setCreating(null);
            onChanged();
            go(sub ? `${base}?g=${sub}&c=${ch.slug}` : `${base}?c=${ch.slug}`);
          }}
        />
      )}
      {editing && (
        <ChannelSettings
          space={{ slug: c.slug, sub: editing.sub }}
          categories={editing.sub ? [] : data.categories}
          channel={editing.channel}
          initialTab={editing.tab}
          onClose={() => setEditing(null)}
          onSaved={(ch) => {
            const { channel, sub } = editing;
            setEditing(null);
            onChanged();
            const here = (activeGroup ?? null) === sub && activeChannel === channel.slug;
            if (here && ch.slug !== channel.slug) go(sub ? `${base}?g=${sub}&c=${ch.slug}` : `${base}?c=${ch.slug}`);
          }}
          onDeleted={() => {
            const { channel, sub } = editing;
            setEditing(null);
            onChanged();
            if ((activeGroup ?? null) === sub && activeChannel === channel.slug) go(sub ? `${base}?g=${sub}` : base);
          }}
        />
      )}
      {notifyOpen && <CommunityNotifyModal c={c} open onClose={() => setNotifyOpen(false)} onChanged={onChanged} />}
      {categoryModal && (
        <CategoryModal
          slug={c.slug}
          category={categoryModal.category}
          onClose={() => setCategoryModal(null)}
          onSaved={() => {
            setCategoryModal(null);
            onChanged();
          }}
        />
      )}
      {newGroup && (
        <GroupFormModal
          slug={c.slug}
          communityName={c.name}
          onClose={() => setNewGroup(false)}
          onCreated={(g) => {
            setNewGroup(false);
            onChanged();
            go(`${base}?g=${g}`);
          }}
        />
      )}
      {boardModal && (
        <BoardFormModal
          slug={c.slug}
          board={boardModal.board}
          onClose={() => setBoardModal(null)}
          onSaved={(b) => {
            const wasNew = !boardModal.board;
            setBoardModal(null);
            onBoardsChanged();
            if (wasNew) go(`${base}?view=topics&b=${b.slug}`);
          }}
        />
      )}
      <ConfirmModal
        open={!!deletingBoard}
        onClose={() => setDeletingBoard(null)}
        title={`Delete ${deletingBoard?.name}?`}
        description={deletingBoard && deletingBoard.topicCount > 0 ? `Its ${deletingBoard.topicCount} ${deletingBoard.topicCount === 1 ? "topic" : "topics"} and all their comments are removed for everyone. This can't be undone.` : "This can't be undone."}
        confirmLabel="Delete board"
        onConfirm={async () => {
          if (!deletingBoard) return;
          await TopicService.removeBoard(c.slug, deletingBoard.id);
          toast("Board deleted", "success");
          onBoardsChanged();
          if (view === "topics" && activeBoard === deletingBoard.slug) go(base);
        }}
      />
      <ConfirmModal
        open={!!deletingChannel}
        onClose={() => setDeletingChannel(null)}
        title={`Delete #${deletingChannel?.channel.name}?`}
        description="All messages in it are removed for everyone. This can't be undone."
        confirmLabel="Delete channel"
        onConfirm={async () => {
          if (!deletingChannel) return;
          const { channel, sub } = deletingChannel;
          await ChannelService.remove({ slug: c.slug, sub }, channel.slug);
          toast("Channel deleted", "success");
          onChanged();
          if ((activeGroup ?? null) === sub && activeChannel === channel.slug) go(sub ? `${base}?g=${sub}` : base);
        }}
      />
      <ConfirmModal
        open={!!leavingGroup}
        onClose={() => setLeavingGroup(null)}
        title={`Leave ${leavingGroup?.name}?`}
        description={(leavingGroup?.visibility === "private" ? "It's invite-only, so you'll need a new invite to get back in." : "You can rejoin any time.") + crewLeaveWarning(crews, leavingGroup?.slug ?? null)}
        confirmLabel="Leave group"
        onConfirm={async () => {
          if (!leavingGroup) return;
          await SpaceService.leave(c.slug, leavingGroup.slug);
          toast("You left the group", "success");
          onChanged();
          if (activeGroup === leavingGroup.slug) go(base);
        }}
      />
      <ConfirmModal
        open={!!deletingCategory}
        onClose={() => setDeletingCategory(null)}
        title={`Delete "${deletingCategory?.name}"?`}
        description="Its channels are kept and move out of the category."
        confirmLabel="Delete category"
        onConfirm={async () => {
          if (!deletingCategory) return;
          await ChannelService.removeCategory(c.slug, deletingCategory.id);
          toast("Category deleted", "success");
          onChanged();
        }}
      />
    </>
  );

  const channelMenu = (ch: ChannelDTO, sub: string | null, href: string, canEdit: boolean, move?: { index: number; count: number; onMove: (m: Move) => void }): MenuEntry[] => {
    const space = { slug: c.slug, subSlug: sub ?? undefined };
    const member = sub ? true : c.viewer.isMember;
    const refresh = () => {
      onChanged();
      emitAppEvent("membership"); // the unread dots on the community rail
    };
    return [
      ...(member
        ? ([{ label: "Mark as read", icon: "check", disabled: !ch.unread && ch.mentions === 0, onSelect: () => void ChannelService.markRead(space, ch.slug).then(refresh, (e) => toast(errorMessage(e), "error")) }] as MenuEntry[])
        : []),
      { label: "Invite people", icon: "userplus", onSelect: () => void copy(absoluteUrl(href), toast, "Channel link copied. Send it to invite them.") },
      { label: pins.has(ch.id) ? "Unpin from top" : "Pin to top", icon: "pin", onSelect: () => pins.toggle(ch.id) },
      { label: "Copy link", icon: "link", onSelect: () => void copy(absoluteUrl(href), toast) },
      ...(member
        ? ([
            { type: "sep" },
            {
              label: ch.muted ? "Unmute channel" : "Mute channel",
              icon: "bell",
              onSelect: () =>
                void ChannelService.setMuted(space, ch.slug, !ch.muted).then(
                  () => {
                    toast(ch.muted ? `#${ch.name} unmuted` : `#${ch.name} muted`, "success");
                    refresh();
                  },
                  (e) => toast(errorMessage(e), "error"),
                ),
            },
          ] as MenuEntry[])
        : []),
      // owners and admins: the room the community's Chat opens on
      ...(manage && !sub && ch.type !== "voice"
        ? ([
            { type: "sep" },
            data.mainChannel === ch.slug
              ? { label: "Stop being the main chat room", icon: "x", onSelect: () => void act(CommunityService.update(c.slug, { mainChannel: null }), onChanged) }
              : { label: "Make main chat room", icon: "home", onSelect: () => void act(CommunityService.update(c.slug, { mainChannel: ch.slug }), onChanged) },
          ] as MenuEntry[])
        : []),
      ...(canEdit
        ? ([
            { type: "sep" },
            { label: "Edit channel", icon: "edit", onSelect: () => setEditing({ channel: ch, sub, tab: "overview" }) },
            { label: "Permissions", icon: "lock", onSelect: () => setEditing({ channel: ch, sub, tab: "permissions" }) },
            ...(move ? moveEntries(move.index, move.count, move.onMove) : []),
            { type: "sep" },
            { label: "Delete channel", icon: "trash", danger: true, onSelect: () => setDeletingChannel({ channel: ch, sub }) },
          ] as MenuEntry[])
        : []),
    ];
  };

  /** The "+" next to a category: create here, or add a category. */
  const addMenu = (categoryId: string | null, sub?: string | null): MenuEntry[] => [
    { label: "Create channel", icon: "hash", onSelect: () => setCreating({ categoryId, sub }) },
    ...(sub ? [] : ([{ label: "Create category", icon: "folder", onSelect: () => setCategoryModal({}) }] as MenuEntry[])),
  ];

  /** `unread`: new messages behind it (a group), shown like a channel's: bold, with a badge instead of the count */
  const navLink = (href: string, on: boolean, label: string, icon: IconName, count?: number | null, unread?: { n: number; mentions: number }, waiting?: number) => {
    const fresh = !on && !!unread && (unread.n > 0 || unread.mentions > 0);
    return (
      <li key={label}>
        <SoftLink
          href={href}
          scroll={false}
          onClick={onNavigate}
          aria-current={on ? "page" : undefined}
          className={cx("flex h-10 items-center gap-2.5 rounded-control px-2.5 text-[15px] transition", on ? "bg-raised font-medium text-ink" : fresh ? "font-semibold text-ink hover:bg-raised/60" : "font-medium text-ink-muted hover:bg-raised/60 hover:text-ink")}
        >
          <Icon name={icon} size={16} />
          {label}
          {waiting ? (
            <CountBadge n={waiting} mention className="ml-auto" label={`${waiting} waiting for you`} />
          ) : fresh ? (
            <CountBadge n={Math.max(unread.n, unread.mentions)} mention={unread.mentions > 0} className="ml-auto" label={`${unread.n} unread`} />
          ) : (
            typeof count === "number" && count > 0 && <span className="ml-auto font-mono text-[12px] text-ink-muted">{compactCount(count)}</span>
          )}
        </SoftLink>
      </li>
    );
  };

  // "Your groups": the ones you're in (a community's owner and site admins see them all); only its owner gets the +
  const canAddGroup = c.canCreateGroup && data.groups.length < LIMITS.groupsPerCommunity;
  const groupsFolded = collapsed.has("your-groups");
  const groupSection = (data.groups.length > 0 || canAddGroup) && (
    <section className="mt-3" aria-label="Your groups">
      <div className="flex items-center pr-1">
        <button type="button" onClick={() => toggle("your-groups")} aria-expanded={!groupsFolded} className="flex min-w-0 flex-1 items-center gap-1 rounded-control px-2 py-1 text-left text-[12px] font-bold tracking-[0.08em] text-ink-muted uppercase hover:text-ink">
          <Icon name="chevron-down" size={12} className={cx("shrink-0 transition-transform", groupsFolded && "-rotate-90")} />
          <span className="truncate">Your groups</span>
        </button>
        {canAddGroup && (
          <button type="button" onClick={() => setNewGroup(true)} aria-label="New group" title="New group" className="inline-flex size-6 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink">
            <Icon name="plus" size={13} />
          </button>
        )}
      </div>
      {!groupsFolded && (
        <ul className="space-y-0.5">
          {data.groups.map((g) => (
            <Fragment key={g.id}>
              {navLink(`${base}?g=${g.slug}`, false, g.name, "folder", null, g.role ? { n: g.channels.reduce((a, ch) => a + (ch.muted ? 0 : (ch.unreadCount ?? 0)), 0), mentions: g.channels.reduce((a, ch) => a + ch.mentions, 0) } : undefined)}
            </Fragment>
          ))}
        </ul>
      )}
    </section>
  );

  /** "Your kliques": the ones you're in, one tap from their chat. */
  const crewSection = (list: MyCrewDTO[]) =>
    list.length > 0 && (
      <section className="mt-3" aria-label="Your kliques">
        <p className="px-2 py-1 text-[12px] font-bold tracking-[0.08em] text-ink-muted uppercase">Your kliques</p>
        <ul className="space-y-0.5">
          {list.map((x) => {
            const on = activeCrew === x.id;
            return (
              <li key={x.id}>
                <SoftLink
                  href={`${base}?${x.sub ? `g=${x.sub}&` : ""}klique=${x.id}`}
                  scroll={false}
                  onClick={onNavigate}
                  aria-current={on ? "page" : undefined}
                  className={cx("flex items-center gap-2.5 rounded-control px-2.5 py-1.5 transition", on ? "bg-raised text-ink" : "text-ink-muted hover:bg-raised/60 hover:text-ink")}
                >
                  <Icon name="pin" size={16} className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className={cx("block truncate text-[15px]", x.unreadCount && !on ? "font-semibold text-ink" : "font-medium")}>{x.title}</span>
                    <span className="block truncate text-[12px] opacity-80">{x.standing === "pending" ? "Asked to join · " : ""}{x.eventTitle ?? `From ${x.area}`}</span>
                  </span>
                  {!on && <CountBadge n={x.unreadCount ?? 0} />}
                </SoftLink>
              </li>
            );
          })}
        </ul>
      </section>
    );

  /** Discord's server header: the name is the menu button. */
  const headerButton = (name: string, locked: boolean, menu: MenuEntry[], label: string, adult = false, verified = false) => (
    <Dropdown
      items={menu}
      label={label}
      width={256}
      className="w-full"
      trigger={({ open, props }) => (
        <button {...props} aria-label={label} className={cx("flex h-11 w-full items-center gap-2 rounded-control px-2.5 text-left transition hover:bg-raised", open && "bg-raised")}>
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[17px] font-semibold tracking-[-0.02em]">
            <span className="truncate">{name}</span>
            <VerifiedCheck on={verified} size={15} />
            {locked && <Icon name="lock" size={13} className="shrink-0 text-ink-muted" />}
            {adult && <span className="shrink-0 rounded-full border border-line px-1.5 py-px font-mono text-[12px] font-bold text-ink-muted" title="For people 18 and over">18+</span>}
          </span>
          <Icon name={open ? "x" : "chevron-down"} size={16} className="shrink-0 text-ink-muted" />
        </button>
      )}
    />
  );

  /* ---- Inside a group: everything on the left belongs to the group ---- */
  if (activeGroup) {
    const g: ChannelGroupDTO = data.groups.find((x) => x.slug === activeGroup) ?? { id: activeGroup, slug: activeGroup, name: "Group", visibility: "private", role: null, channels: [] };
    const gBase = `${base}?g=${g.slug}`;
    const gManage = g.role === "owner" || g.role === "admin";
    const gMenu: MenuEntry[] = [
      { label: "About this group", icon: "info", onSelect: onAbout },
      { label: "Invite people", icon: "userplus", onSelect: () => (g.visibility === "private" && gManage ? go(`${gBase}&settings=invites`) : void copy(absoluteUrl(gBase), toast, "Group link copied")) },
      ...(gManage
        ? ([
            { label: "Group settings", icon: "sliders", onSelect: () => go(`${gBase}&settings=overview`) },
            { type: "sep" },
            { label: "Create channel", icon: "plus", onSelect: () => setCreating({ categoryId: null, sub: g.slug }) },
          ] as MenuEntry[])
        : []),
      ...(g.role && g.role !== "owner" ? ([{ type: "sep" }, { label: "Leave group", icon: "logout", danger: true, onSelect: () => setLeavingGroup(g) }] as MenuEntry[]) : []),
    ];
    const gNav: { id: GroupView; label: string; icon: IconName; show: boolean }[] = [
      { id: "events", label: "Events", icon: "calendar", show: true },
      // a community's own kliques (switched off: its events' kliques still show on each event)
    { id: "kliques", label: "Kliques", icon: "pin", show: c.kliquesOn },
      { id: "members", label: "Members", icon: "users", show: g.role !== null },
    ];
    return (
      <nav aria-label={`${g.name} channels`} className="flex h-full flex-col">
        <div className="border-b border-line px-2 py-2.5 pr-14 lg:pr-2">
          <SoftLink href={base} onClick={onNavigate} className="eyebrow mb-0.5 inline-flex items-center gap-1 px-2.5 hover:text-ink">
            <Icon name="arrow-left" size={11} /> {c.name}
          </SoftLink>
          {headerButton(g.name, g.visibility === "private", gMenu, "Group menu")}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          <ul className="space-y-0.5">{gNav.filter((n) => n.show).map((n) => navLink(`${gBase}&view=${n.id}`, view === n.id, n.label, n.icon))}</ul>
          {crewSection(crews.filter((x) => x.sub === g.slug))}
          <div className="my-3 h-px bg-line" />
          <div className="flex items-center pr-1">
            <p className="flex-1 px-2 py-1 text-[12px] font-bold tracking-[0.08em] text-ink-muted uppercase">Channels</p>
            {gManage && (
              <Dropdown
                items={addMenu(null, g.slug)}
                label="Add to group"
                align="right"
                trigger={({ props }) => (
                  <button {...props} aria-label="Create channel" title="Create channel" className="inline-flex size-6 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink">
                    <Icon name="plus" size={13} />
                  </button>
                )}
              />
            )}
          </div>
          <ul className="space-y-0.5">
            {pins.first(g.channels).map((ch) => (
              <ChannelRow key={ch.id} ch={ch} pinned={pins.has(ch.id)} href={`${gBase}&c=${ch.slug}`} active={!view && ch.slug === activeChannel} menu={channelMenu(ch, g.slug, `${gBase}&c=${ch.slug}`, gManage)} onNavigate={onNavigate} />
            ))}
          </ul>
          {g.channels.length === 0 && <p className="px-2.5 py-2 text-sm text-ink-muted">{gManage ? "No channels yet. Use + to create one." : "No channels yet."}</p>}
        </div>
        {modals}
      </nav>
    );
  }

  const slotOf = (cat: ChannelCategoryDTO | null) => (cat ? 1 + data.categories.findIndex((k) => k.id === cat.id) : 0);
  const boardsBefore = sections.findIndex((x) => slotOf(x.category) >= (data.boardsAt ?? 0));
  // where it is among the places it can go (for the Move menu): before section n, or last
  const boardsSlot = boardsBefore < 0 ? sections.length : boardsBefore;
  // a move: send it, then everyone's list (yours first) follows
  const act = (p: Promise<unknown>, then: () => void) => p.then(then, (e) => toast(errorMessage(e), "error"));
  // the Boards section, wherever the community put it among the sections (data.boardsAt: sections above it)
  const boardsSection =
    c.boardsOn && (boards.length > 0 || manage) ? (
      <section className="mt-3" aria-label="Boards">
        <div className="flex items-center pr-1">
          <p className="flex-1 px-2 py-1 text-[12px] font-bold tracking-[0.08em] text-ink-muted uppercase">Boards</p>
          {manage && (
            <Dropdown
              label="Boards options"
              align="right"
              items={moveEntries(boardsSlot, sections.length + 1, (m) => void act(CommunityService.update(c.slug, { moveBoards: m }), onChanged), "section")}
              trigger={({ props }) => (
                <button {...props} aria-label="Boards options" title="Move the Boards section" className="inline-flex size-6 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink">
                  <Icon name="more" size={14} />
                </button>
              )}
            />
          )}
          {manage && (
            <button type="button" onClick={() => setBoardModal({})} aria-label="Create board" title="Create board" className="inline-flex size-6 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink">
              <Icon name="plus" size={13} />
            </button>
          )}
        </div>
        <ul className="space-y-0.5">
          {boards.map((b) => {
            const on = view === "topics" && activeBoard === b.slug;
            return (
              <li key={b.id}>
                {/* the hover that shows the options is the board row only, not your posts under it */}
                <div className="group/board relative">
                  <SoftLink
                    href={`${base}?view=topics&b=${b.slug}`}
                    scroll={false}
                    onClick={onNavigate}
                    aria-current={on ? "page" : undefined}
                    className={cx("flex h-10 items-center gap-2.5 rounded-control px-2.5 text-[15px] font-medium transition", on ? "bg-raised text-ink" : "text-ink-muted hover:bg-raised/60 hover:text-ink")}
                  >
                    <Icon name={b.postPolicy === "admins" ? "megaphone" : "topics"} size={16} />
                    <span className="truncate">{b.name}</span>
                    {b.topicCount > 0 && <span className={cx("ml-auto font-mono text-[12px] text-ink-muted", manage && "group-hover/board:hidden")}>{compactCount(b.topicCount)}</span>}
                  </SoftLink>
                  {manage && (
                    <div className="absolute top-1.5 right-1 hidden group-focus-within/board:block group-hover/board:block">
                      <Dropdown
                        label={`${b.name} options`}
                        align="right"
                        items={[
                          { label: "Edit board", icon: "edit", onSelect: () => setBoardModal({ board: b }) },
                          ...moveEntries(boards.indexOf(b), boards.length, (mv) => void act(TopicService.moveBoard(c.slug, b.id, mv), onBoardsChanged)),
                          { type: "sep" },
                          { label: "Delete board", icon: "trash", danger: true, onSelect: () => setDeletingBoard(b) },
                        ]}
                        trigger={({ props }) => (
                          <button {...props} aria-label={`${b.name} options`} title="Board options" className="inline-flex size-6 items-center justify-center rounded-full text-ink-muted hover:bg-line hover:text-ink">
                            <Icon name="more" size={14} />
                          </button>
                        )}
                      />
                    </div>
                  )}
                </div>
                {!!b.mine?.length && (
                  <ul aria-label={`Your posts in ${b.name}`} className="relative mt-0.5 mb-1 ml-[18px] space-y-0.5 border-l border-line pl-2">
                    {b.mine.map((p) => {
                      const open = on && activeTopic === p.id;
                      const n = open ? 0 : p.unread;
                      return (
                        <li key={p.id}>
                          <SoftLink
                            href={`${base}?view=topics&b=${b.slug}&t=${p.id}&full=1`}
                            scroll={false}
                            onClick={onNavigate}
                            aria-current={open ? "page" : undefined}
                            className={cx("flex h-8 items-center gap-2 rounded-control px-2 text-[13px] transition", open ? "bg-raised text-ink" : n ? "font-semibold text-ink hover:bg-raised/60" : "text-ink-muted hover:bg-raised/60 hover:text-ink")}
                          >
                            <span className="truncate">{p.title}</span>
                            {n > 0 && <span className="ml-auto shrink-0 font-mono text-[12px] font-bold text-ink">{n >= 99 ? "99+" : n} new</span>}
                          </SoftLink>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    ) : null;

  return (
    <nav aria-label={`${c.name} channels`} className="flex h-full flex-col">
      <div className="border-b border-line px-2 py-2.5 pr-14 lg:pr-2">
        <SoftLink href="/communities" onClick={onNavigate} className="eyebrow mb-0.5 inline-flex items-center gap-1 px-2.5 hover:text-ink">
          <Icon name="arrow-left" size={11} /> Communities
        </SoftLink>
        {headerButton(c.name, c.privacy === "private", headerMenu, "Community menu", c.adult, c.verified)}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {/* a new community's owner: the first steps (the server sends them only to the owner, for two weeks) */}
        {c.setup && <SetupChecklist c={c} onGo={go} onInvite={inviteCommunity} />}
        {/* set by Klique for breaking the rules: a suspension shows to everyone, a restriction to the people who run it */}
        {c.standing && (
          <div role="status" className="mx-1 mb-3 rounded-control border border-danger/50 bg-danger/5 px-3 py-2.5 text-[12.5px] leading-relaxed">
            <p className="font-semibold text-danger">{c.standing.state === "suspended" ? "Suspended by Klique" : "Restricted by Klique"}{c.standing.until ? ` until ${new Date(c.standing.until).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</p>
            <p className="mt-0.5 text-ink-muted">{c.standing.state === "suspended" ? "Read only for now: nobody can post or join." : "Out of Discover and search, and causes are paused."} {c.standing.reason}</p>
          </div>
        )}
        {/* the community's main cause (and "All causes"), when it has any */}
        {/* no money in a community with explicit content */}
        {!c.locked && !c.explicit && (
          <div className="mb-3 px-1 empty:hidden">
            <CauseButtons c={c} compact />
          </div>
        )}
        <ul className="space-y-0.5">
          {nav
            .filter((n) => n.show)
            .map((n) => navLink(`${base}?view=${n.id}`, view === n.id, n.label, n.icon, n.count, undefined, n.badge))}
          {/* the community's live stream: one at a time (LIVE while on; "Go live" for those allowed) */}
          {!c.locked && <LiveRow c={c} onChanged={onChanged} />}
        </ul>
        {groupSection}
        {crewSection(crews)}


        <div className="my-3 h-px bg-line" />

        {sections.length === 0 && (
          <div className="px-2.5 py-2 text-sm text-ink-muted">
            {chMgr ? (
              <button type="button" onClick={() => setCreating({ categoryId: null })} className="inline-flex items-center gap-1.5 font-semibold text-accent-text hover:underline">
                <Icon name="plus" size={14} /> Create the first channel
              </button>
            ) : (
              "No channels yet."
            )}
          </div>
        )}

        {sections.map(({ category, channels }, i) => {
          const isCollapsed = !!category && collapsed.has(category.id);
          // keep the active channel visible even in a collapsed category
          const shown = isCollapsed ? channels.filter((ch) => ch.slug === activeChannel && !view) : channels;
          return (
            <Fragment key={category?.id ?? "loose"}>
            {i === boardsBefore && <div className="mb-3">{boardsSection}</div>}
            <section className="mb-3" aria-label={category?.name ?? "Channels"}>
              <div className="flex items-center pr-1">
                {category ? (
                  <button
                    type="button"
                    onClick={() => toggle(category.id)}
                    aria-expanded={!isCollapsed}
                    className="flex min-w-0 flex-1 items-center gap-1 rounded-control px-2 py-1 text-left text-[12px] font-bold tracking-[0.08em] text-ink-muted uppercase hover:text-ink"
                  >
                    <Icon name="chevron-down" size={12} className={cx("shrink-0 transition-transform", isCollapsed && "-rotate-90")} />
                    <span className="truncate">{category.name}</span>
                  </button>
                ) : (
                  <p className="flex-1 px-2 py-1 text-[12px] font-bold tracking-[0.08em] text-ink-muted uppercase">Channels</p>
                )}
                {chMgr && (
                  <>
                    <Dropdown
                      items={addMenu(category?.id ?? null)}
                      label="Add"
                      align="right"
                      trigger={({ props }) => (
                        <button {...props} aria-label={category ? `Add to ${category.name}` : "Add channel or category"} title="Create" className="inline-flex size-6 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink">
                          <Icon name="plus" size={13} />
                        </button>
                      )}
                    />
                    {category && (
                      <Dropdown
                        label={`${category.name} options`}
                        align="right"
                        items={[
                          { label: "Edit category", icon: "edit", onSelect: () => setCategoryModal({ category }) },
                          { label: "Create channel", icon: "hash", onSelect: () => setCreating({ categoryId: category.id }) },
                          ...moveEntries(data.categories.indexOf(category), data.categories.length, (mv) => void act(ChannelService.moveCategory(c.slug, category.id, mv), onChanged)),
                          { type: "sep" },
                          { label: "Delete category", icon: "trash", danger: true, onSelect: () => setDeletingCategory(category) },
                        ]}
                        trigger={({ props }) => (
                          <button {...props} aria-label={`${category.name} options`} title="Category options" className="inline-flex size-6 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink">
                            <Icon name="more" size={14} />
                          </button>
                        )}
                      />
                    )}
                  </>
                )}
              </div>
              <ul className="space-y-0.5">
                {pins.first(shown).map((ch) => (
                  <ChannelRow key={ch.id} ch={ch} pinned={pins.has(ch.id)} href={`${base}?c=${ch.slug}`} active={!view && ch.slug === activeChannel} menu={channelMenu(ch, null, `${base}?c=${ch.slug}`, chMgr, chMgr ? { index: channels.indexOf(ch), count: channels.length, onMove: (mv) => void act(ChannelService.move({ slug: c.slug }, ch.slug, mv), onChanged) } : undefined)} onNavigate={onNavigate} />
                ))}
              </ul>
            </section>
            </Fragment>
          );
        })}
        {/* last of all when the community put it at the bottom (or there are no sections yet) */}
        {boardsBefore < 0 && boardsSection}
      </div>

      {modals}
    </nav>
  );
}

function ChannelRow({ ch, href, active, menu, pinned, onNavigate }: { ch: ChannelDTO; href: string; active: boolean; menu: MenuEntry[] | null; pinned?: boolean; onNavigate?: () => void }) {
  const row = (
    <>
      <SoftLink
        href={href}
        scroll={false}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cx(
          "flex h-10 items-center gap-2 rounded-control pl-2.5 text-[15px] transition",
          menu ? "pr-9" : "pr-2.5",
          active ? "bg-raised font-semibold text-ink" : (ch.unread && !ch.muted) || ch.mentions > 0 ? "font-semibold text-ink hover:bg-raised/60" : "font-medium text-ink-muted hover:bg-raised/60 hover:text-ink",
        )}
      >
        <Icon name={ch.type === "announcement" ? "megaphone" : ch.type === "voice" ? "mic" : "hash"} size={16} className="shrink-0" />
        <span className="truncate">{ch.name}</span>
        {ch.visibility !== "all" && <Icon name="lock" size={12} className="shrink-0 opacity-70" aria-label={ch.visibility === "invite" ? "Invite-only channel" : "Admins only"} />}
        {pinned && <Icon name="pin" size={12} className="shrink-0 opacity-70" aria-label="Pinned" />}
        {ch.muted && <span className="shrink-0 font-mono text-[12px] opacity-70">muted</span>}
        {!active && <CountBadge n={Math.max(ch.muted ? 0 : (ch.unreadCount ?? 0), ch.mentions)} mention={ch.mentions > 0} className="ml-auto" label={ch.mentions > 0 ? `${ch.unreadCount || ch.mentions} unread, ${ch.mentions} mention you` : `${ch.unreadCount} unread`} />}
      </SoftLink>
      {menu && (
        <span className="absolute top-1/2 right-1.5 -translate-y-1/2 opacity-100 transition focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100 md:opacity-0 md:group-hover/ch:opacity-100">
          <Dropdown
            items={menu}
            label={`#${ch.name} options`}
            align="right"
            trigger={({ open, props }) => (
              <button {...props} aria-label={`#${ch.name} options`} title="Channel options" className={cx("inline-flex size-6 items-center justify-center rounded-full text-ink-muted hover:bg-line hover:text-ink", open && "bg-line text-ink")}>
                <Icon name="sliders" size={13} />
              </button>
            )}
          />
        </span>
      )}
    </>
  );
  return (
    <li className="group/ch relative">
      {menu ? (
        <ContextMenu items={menu} label={`#${ch.name} options`}>
          {row}
        </ContextMenu>
      ) : (
        row
      )}
    </li>
  );
}

/**
 * Move up / down / to the top / to the bottom, for owners and admins (channels in a category, categories, boards,
 * the Boards section). Nothing when there's only one; the ends are greyed out where they can't go further.
 */
function moveEntries(index: number, count: number, onMove: (m: Move) => void, what = ""): MenuEntry[] {
  if (count < 2 || index < 0) return [];
  const first = index === 0;
  const last = index >= count - 1;
  const w = what ? ` ${what}` : "";
  return [
    { type: "sep" },
    { label: `Move${w} to top`, icon: "chevron-up", disabled: first, onSelect: () => onMove("top") },
    { label: `Move${w} up`, icon: "chevron-up", disabled: first, onSelect: () => onMove("up") },
    { label: `Move${w} down`, icon: "chevron-down", disabled: last, onSelect: () => onMove("down") },
    { label: `Move${w} to bottom`, icon: "chevron-down", disabled: last, onSelect: () => onMove("bottom") },
  ];
}
