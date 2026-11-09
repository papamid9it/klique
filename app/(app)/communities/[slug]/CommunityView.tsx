"use client";

import { AgeGate } from "@/components/domain/space/AgeGate";
import { placeLabel } from "@/lib/places";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChannelService } from "@/app/services/ChannelService";
import { CommunityService } from "@/app/services/CommunityService";
import { SpaceService } from "@/app/services/SpaceService";
import { SubcommunityService } from "@/app/services/SubcommunityService";
import { VoicePanel } from "@/components/domain/voice/VoicePanel";
import { TopicService } from "@/app/services/TopicService";
import { TopicDetailProvider, TopicSide } from "@/components/domain/topics/TopicThread";
import { VoiceSide, type VoiceSnapshot } from "@/components/domain/voice/VoicePanel";
import { TopicsPanel } from "@/components/domain/topics/TopicsPanel";
import { BoardSidebar } from "@/components/domain/topics/BoardSidebar";
import { CrewService } from "@/app/services/CrewService";
import { CrewsBoard } from "@/components/domain/crews/CrewsBoard";
import { CrewView } from "@/components/domain/crews/CrewView";
import { crewLeaveWarning } from "@/components/domain/crews/parts";
import { useAppEvent } from "@/lib/appEvents";
import { ChannelList, orderChannels, type GroupView, type WorkspaceView } from "@/components/domain/chat/ChannelList";
import { ChatPane } from "@/components/domain/chat/ChatPane";
import { CommunityInfo } from "@/components/domain/chat/CommunityInfo";
import { GroupInfo } from "@/components/domain/chat/GroupInfo";
import { GroupSettings } from "@/components/domain/space/GroupSettings";
import { PostsPanel } from "@/components/domain/space/PostsPanel";
import { FeedPanel } from "@/components/domain/feed/FeedPanel";
import { PostsSidebar } from "@/components/domain/feed/PostsSidebar";
import { CommunityRail } from "@/components/layout/CommunityRail";
import { noteCommunityOpened } from "@/components/layout/prefetchCommunity";
import { JoinButton } from "@/components/domain/JoinButton";
import { ReportDialog } from "@/components/domain/ReportDialog";
import { SectionHeader } from "@/components/domain/SectionHeader";
import { DashboardView } from "@/components/domain/space/DashboardView";
import { CommunitySettings } from "@/components/domain/space/CommunitySettings";
import { MembersPanel } from "@/components/domain/space/MembersPanel";
import { ConfirmModal, SpaceError } from "@/components/domain/space/parts";
import { Modal } from "@/components/ui/Modal";
import { SpaceEvents } from "@/components/domain/space/SpaceEvents";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ChannelListSkeleton, ChatSkeleton } from "@/components/ui/Skeleton";
import { cx } from "@/components/ui/cx";
import { slowModeLabel, audienceLabel, audienceRefusal } from "@/lib/constants";
import { SlideOver } from "@/components/ui/SlideOver";
import { EmptyState, ErrorState } from "@/components/ui/States";

import { useRealtime, useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { mutateApi, useApi } from "@/lib/hooks/useApi";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { softNavigate } from "@/lib/nav";
import type { ChannelDTO, ChannelGroupDTO, ChannelsDTO, CommunityDTO, MyCommunityDTO } from "@/lib/types";
import { CommunitySearchBox, CommunitySearchResults } from "@/components/domain/space/CommunitySearch";
import { WelcomeModal } from "@/components/domain/space/Welcome";
import { ThreadSide, ThreadsModal } from "@/components/domain/chat/Threads";

const VIEWS: Record<WorkspaceView, { label: string; icon: IconName }> = {
  dashboard: { label: "Dashboard", icon: "sliders" },
  topics: { label: "Topics", icon: "topics" },
  posts: { label: "Posts", icon: "image" },
  events: { label: "Events", icon: "calendar" },
  kliques: { label: "Kliques", icon: "pin" },
  search: { label: "Search", icon: "search" },
  members: { label: "Members", icon: "users" },
};

const GROUP_VIEWS: Record<Exclude<GroupView, "updates">, { label: string; icon: IconName }> = {
  events: { label: "Events", icon: "calendar" },
  kliques: { label: "Kliques", icon: "pin" },
  members: { label: "Members", icon: "users" },
};

/**
 * A community is a chat space: channels on the left (grouped in categories), the conversation in the
 * middle. The right side only opens for a topic's comments or a call; the community's (or group's) about,
 * admins and what's coming up open from its name menu instead ("About"). Events, members and settings are views in the
 * middle pane. URL: /communities/<slug>?c=<channel>  or  ?view=events|members|manage
 * A group is a section of the same workspace: ?g=<group>&c=<channel>  or  ?g=<group>&view=updates|events|members|manage
 */
export function CommunityView() {
  // Read from the address, not the route params: hopping between communities in the rail changes the URL in the
  // browser only (see CommunityRail), so the page never waits on the server. Keyed by slug so each community
  // starts fresh, straight from what's already in memory.
  const pathname = usePathname();
  const slug = decodeURIComponent(/^\/communities\/([^/]+)/.exec(pathname)?.[1] ?? "");
  return <CommunityWorkspace key={slug} slug={slug} />;
}

function CommunityWorkspace({ slug }: { slug: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { data: c, loading, error, status, reload, setData } = useApi(() => CommunityService.get(slug), [slug, user?.id], { key: `community:${slug}` });
  // the welcome screen: null = as the server says (once, for new members); the composer can open it again
  const [welcomeOpen, setWelcomeOpen] = useState<boolean | null>(null);
  // a channel's thread list (opened from its header)
  const [threadsOf, setThreadsOf] = useState<{ slug: string; name: string } | null>(null);
  useAppEvent("welcome", () => setWelcomeOpen(true));
  // the tab title follows along when the community changed without a page load
  const communityName = c?.name;
  useEffect(() => {
    if (communityName) document.title = `${communityName} · klique.`;
  }, [communityName]);
  // remembered so it's among the first preloaded next time
  useEffect(() => {
    if (c?.viewer.isMember) noteCommunityOpened(slug);
  }, [slug, c?.viewer.isMember]);
  const canUse = !!c && !c.locked;
  const channels = useApi(canUse ? () => ChannelService.list({ slug }) : null, [slug, user?.id, c?.id, c?.viewer.isMember, c?.locked], { key: `channels:${slug}` });

  const gSlug = sp.get("g");
  const boardsApi = useApi(canUse ? () => TopicService.boards(slug) : null, [slug, user?.id, c?.id, c?.viewer.isMember, c?.locked], { key: `boards:${slug}` });
  const boards = useMemo(() => boardsApi.data ?? [], [boardsApi.data]);
  // your posts under each board: a reply moves them up and adds to "new"
  useRealtimeEvent(() => void boardsApi.reload(), { filter: (e) => e.type === "topic" && e.communityId === c?.id, debounceMs: 1500 });
  // opening or leaving a post reads it: refresh so its "new" count goes
  const openPost = sp.get("t");
  const reloadBoards = boardsApi.reload;
  const seenPost = useRef(openPost);
  useEffect(() => {
    if (seenPost.current === openPost) return;
    seenPost.current = openPost;
    const t = setTimeout(() => void reloadBoards(), 800);
    return () => clearTimeout(t);
  }, [openPost, reloadBoards]);
  const group = useApi(canUse && gSlug ? () => SubcommunityService.get(slug, gSlug) : null, [slug, gSlug, user?.id, c?.id], { key: `group:${slug}:${gSlug}` });
  const g = gSlug ? group.data : null;
  const gReadable = !!g && !g.moderationOnly && g.viewer.canView;
  const groupChannels = useApi(canUse && gSlug && gReadable ? () => ChannelService.list({ slug, sub: gSlug }) : null, [slug, gSlug, user?.id, gReadable, g?.viewer.isMember], { key: `channels:${slug}:${gSlug}` });
  // crews you're in for this community's events: listed on the left, one tap from their chat
  const myCrews = useApi(canUse && user ? () => CrewService.mineIn(slug) : null, [slug, user?.id, canUse], { key: `my-crews:${slug}` });
  const reloadCrews = myCrews.reload;
  // ?klique=<id> (old links: ?crew=<id>)
  const crewOpen = sp.get("klique") ?? sp.get("crew");
  const [deletingGroup, setDeletingGroup] = useState(false);

  const wide = useMediaQuery("(min-width: 80rem)");
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [reporting, setReporting] = useState(false);

  // Refresh unread dots while the tab is visible.
  const reloadChannels = channels.reload;
  const member = !!c?.viewer.isMember;
  const { connected } = useRealtime();
  useEffect(() => {
    if (!canUse || !member) return;
    const t = setInterval(() => document.visibilityState === "visible" && void reloadChannels(), connected ? 180_000 : 45_000);
    return () => clearInterval(t);
  }, [canUse, member, reloadChannels, connected]);
  // activity in this community: refresh unread badges and the channel list right away
  const communityId = c?.id;
  useRealtimeEvent(() => void reloadChannels(), { filter: (e) => e.type === "channel" && e.communityId === communityId, debounceMs: 1200 });
  // you were let in (or added to a group): the community opens up without a refresh
  useRealtimeEvent(
    () => {
      void reload();
      void reloadChannels();
    },
    { filter: (e) => e.type === "notify" && e.ref === `community:${communityId}`, debounceMs: 300 },
  );
  // you joined or left here from somewhere else on the page (a crew's "Join" button): everything follows
  useAppEvent("membership", () => {
    void reload();
    void reloadChannels();
    void myCrews.reload();
  });
  // your crews changed (someone joined, you were accepted, a crew was called off): the left panel follows
  useRealtimeEvent(() => void myCrews.reload(), { filter: (e) => e.type === "crew" || (e.type === "notify" && e.category === "crews"), debounceMs: 500 });

  const closeLeft = useCallback(() => setLeftOpen(false), []);
  const closeRight = useCallback(() => setRightOpen(false), []);

  const ordered = useMemo(() => (channels.data ? orderChannels(channels.data).flatMap((s) => s.channels) : []), [channels.data]);

  // channels of the group being viewed (a preview section for a group you haven't joined)
  const groupList = useMemo(() => (groupChannels.data ? [...groupChannels.data.channels] : []), [groupChannels.data]);
  const pool = gSlug ? groupList : ordered;

  // ?view=crews is the old name of ?view=kliques
  const requestedView = sp.get("view") === "crews" ? "kliques" : sp.get("view");
  const viewTable: Record<string, { label: string; icon: IconName }> = gSlug ? GROUP_VIEWS : VIEWS;
  const view = (
    requestedView && requestedView in viewTable &&
    (requestedView !== "members" || (gSlug ? !!g?.viewer.isMember : !!c?.viewer.canSeeMembers)) &&
    (requestedView !== "dashboard" || (!gSlug && !!c?.viewer.canManage)) &&
    (!!gSlug || requestedView !== "updates")
      ? requestedView
      : null
  ) as (WorkspaceView | GroupView) | null;
  const [voice, setVoice] = useState<VoiceSnapshot | null>(null);
  const activeBoard = boards.find((b) => b.slug === sp.get("b")) ?? boards[0] ?? null;
  const requestedChannel = sp.get("c");
  const activeChannel: ChannelDTO | null = view || crewOpen ? null : (pool.find((x) => x.slug === requestedChannel) ?? pool.find((x) => x.slug === "general") ?? pool[0] ?? null);

  const markReadLocally = useCallback(
    (channelSlug: string) => {
      const clear = (list: ChannelDTO[]) => list.map((x) => (x.slug === channelSlug ? { ...x, unread: false, unreadCount: 0, mentions: 0 } : x));
      if (gSlug) {
        groupChannels.setData((d: ChannelsDTO | null) => (d ? { ...d, channels: clear(d.channels) } : d));
        channels.setData((d: ChannelsDTO | null) => (d ? { ...d, groups: d.groups.map((x) => (x.slug === gSlug ? { ...x, channels: clear(x.channels) } : x)) } : d));
      } else {
        channels.setData((d: ChannelsDTO | null) => (d ? { ...d, channels: clear(d.channels) } : d));
      }
      // the community's icon in the left rail drops its dot / mention count straight away
      const d = channels.data;
      if (d) {
        const all = [...(gSlug ? d.channels : clear(d.channels)), ...d.groups.flatMap((x) => (x.slug === gSlug ? clear(x.channels) : x.channels))];
        const crewUnread = (myCrews.data ?? []).reduce((n, x) => n + (x.unreadCount ?? 0), 0);
        mutateApi<MyCommunityDTO[]>("my-communities", (list) =>
          list.map((m) => (m.slug === slug ? { ...m, unread: all.some((x) => x.unread) || crewUnread > 0, unreadCount: Math.min(99, all.reduce((n, x) => n + (x.unreadCount ?? 0), 0) + crewUnread), mentions: all.reduce((n, x) => n + (x.mentions ?? 0), 0) } : m)),
        );
      }
    },
    [channels, groupChannels, gSlug, slug, myCrews.data],
  );
  /** opening a crew's chat reads it: its count and the rail's drop at once */
  const markCrewReadLocally = useCallback(
    (crewId: string) => {
      const was = (myCrews.data ?? []).find((x) => x.id === crewId)?.unreadCount ?? 0;
      if (!was) return;
      myCrews.setData((list) => (list ? list.map((x) => (x.id === crewId ? { ...x, unreadCount: 0 } : x)) : list));
      mutateApi<MyCommunityDTO[]>("my-communities", (list) => list.map((m) => (m.slug === slug ? { ...m, unreadCount: Math.max(0, (m.unreadCount ?? 0) - was) } : m)));
    },
    [myCrews, slug],
  );

  // the channel list with a preview section for a group you're looking at but haven't joined
  const listData: ChannelsDTO | null = useMemo(() => {
    const d = channels.data;
    if (!d) return null;
    if (!gSlug || !g || !gReadable || d.groups.some((x) => x.slug === gSlug) || !groupChannels.data) return d;
    const preview: ChannelGroupDTO = { id: g.id, slug: g.slug, name: g.name, visibility: g.visibility, role: null, channels: groupChannels.data.channels };
    return { ...d, groups: [...d.groups, preview] };
  }, [channels.data, gSlug, g, gReadable, groupChannels.data]);

  /* ---------------------------- states ---------------------------- */

  if (loading) {
    return (
      // the channel list and a chat, where they'll be
      <div className="flex h-dvh" role="status" aria-label="Loading community">
        <div className="hidden w-64 shrink-0 border-r border-line bg-surface/40 lg:block">
          <ChannelListSkeleton />
        </div>
        <ChatSkeleton />
      </div>
    );
  }
  if (error || !c) {
    return (
      <Scroll>
        <SpaceError status={status} message={error} onRetry={reload} />
      </Scroll>
    );
  }

  // an 18+ community they can't enter yet: ask for what's missing, show nothing else
  if (c.ageGate) {
    return (
      <Scroll>
        <div className="py-10">
          <AgeGate community={c} onPassed={() => void reload()} />
        </div>
      </Scroll>
    );
  }

  if (c.locked) {
    return (
      <Scroll>
        <div className="mx-auto max-w-xl py-6">
          <Button href="/communities" variant="ghost" size="sm" className="mb-3">
            <Icon name="arrow-left" size={14} /> Communities
          </Button>
          <section className="rounded-card border border-line bg-surface p-6 text-center">
            <span className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full bg-raised text-accent-text">
              <Icon name="lock" size={22} />
            </span>
            <p className="eyebrow">{audienceLabel(c.audience) ?? "Private community"}</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{c.name}</h1>
            <p className="mt-1 text-sm text-ink-muted">{placeLabel(c)}</p>
            <p className="mx-auto mt-4 max-w-sm text-sm text-ink-muted">{(user && audienceRefusal(c.audience, user.gender)) || "Channels, events and members are only visible to members. Send a request and an admin will take a look."}</p>
            <div className="mt-5 flex justify-center">
              <JoinButton
                size="md"
                community={c}
                onChange={(next) => {
                  setData(next as CommunityDTO);
                  void reload();
                }}
              />
            </div>
            {!(user && audienceRefusal(c.audience, user.gender)) && <p className="mt-4 text-xs text-ink-muted">Got an invite link? Open it to join straight away.</p>}
          </section>
          {user && (
            <div className="mt-3 flex justify-center">
              <Button size="sm" variant="ghost" onClick={() => setReporting(true)}>
                Report community
              </Button>
            </div>
          )}
          {reporting && <ReportDialog open onClose={() => setReporting(false)} targetType="community" targetId={c.id} subject="this community" />}
        </div>
      </Scroll>
    );
  }

  // Settings are a full-screen layer over the workspace: ?settings=<tab> (old ?view=manage links open it too).
  const settingsReq = sp.get("settings") ?? (sp.get("view") === "manage" ? "overview" : null);
  // owners and admins, and anyone whose roles give them moderation tools (they see just those tabs)
  const canSettings = gSlug ? !!g?.viewer.canManage : c.viewer.canManage || (c.viewer.perms ?? []).some((p) => ["kick", "ban", "timeout", "manageRoles", "viewModLog", "manageWebhooks", "manageEmoji"].includes(p));
  const setSettings = (tab: string | null) => {
    const q = new URLSearchParams(sp.toString());
    if (q.get("view") === "manage") q.delete("view");
    if (tab) q.set("settings", tab);
    else q.delete("settings");
    const qs = q.toString();
    softNavigate(qs ? `/communities/${slug}?${qs}` : `/communities/${slug}`, { replace: true });
  };

  const joined = (next: CommunityDTO) => {
    setData(next);
    void reload();
    void reloadChannels();
  };
  const leave = async () => {
    await SpaceService.leave(slug);
    toast(`You left ${c.name}`, "success");
    setLeaving(false);
    await Promise.all([reload(), myCrews.reload()]);
  };
  /** leaving takes you out of its crews too: say which, before they confirm */
  const crewWarning = (inGroup: string | null) => crewLeaveWarning(myCrews.data ?? [], inGroup);

  const list = (onNavigate?: () => void) =>
    listData ? (
      <div className="flex h-full flex-col">
        {onNavigate && <CommunityRail activeSlug={slug} horizontal onNavigate={onNavigate} />}
        <div className="min-h-0 flex-1">{channelTree(onNavigate)}</div>
      </div>
    ) : (
      channelTree(onNavigate)
    );
  const channelTree = (onNavigate?: () => void) =>
    listData ? (
      <ChannelList community={c} data={listData} activeChannel={activeChannel?.slug ?? null} activeGroup={gSlug} view={view} boards={boards} activeBoard={activeBoard?.slug ?? null} activeTopic={view === "topics" ? sp.get("t") : null} onBoardsChanged={() => void boardsApi.reload()} onChanged={() => void reloadChannels()} onNavigate={onNavigate} onLeave={() => setLeaving(true)} onReport={() => setReporting(true)} onAbout={() => (onNavigate?.(), setAboutOpen(true))} crews={myCrews.data ?? []} activeCrew={crewOpen} />
    ) : channels.error ? (
      <div className="p-4">
        <ErrorState title="Couldn't load channels" message={channels.error} onRetry={channels.reload} />
      </div>
    ) : (
      <div role="status" aria-label="Loading channels">
        <ChannelListSkeleton />
      </div>
    );

  const threadId = view === "topics" && !g ? sp.get("t") : null;
  // ?full=1: the post fills the page (opened from your posts under the board in the sidebar), like Discord
  const postFull = !!threadId && sp.get("full") === "1";
  // closing the topic brings the community info back; the board underneath never moved
  const closeTopic = () => {
    const q = new URLSearchParams(sp.toString());
    q.delete("t");
    q.delete("full");
    softNavigate(`/communities/${slug}?${q.toString()}`);
  };
  // ?th=<thread slug>: a thread open in the side panel (community channels)
  const threadSlug = !view && !g ? sp.get("th") : null;
  const openThread = (s: string | null) => {
    const q = new URLSearchParams(sp.toString());
    if (s) q.set("th", s);
    else q.delete("th");
    softNavigate(`/communities/${slug}?${q.toString()}`);
  };
  const voiceChannel = !view && activeChannel?.type === "voice" ? activeChannel : null;
  // the right panel only opens for what you're looking at: a topic's comments or a call's roster
  // on a wide screen a board with no topic open gets its sidebar (trending, rules, contributors, events)
  const boardSide = view === "topics" && !g && !threadId && activeBoard ? activeBoard : null;
  // Posts gets one too (about the community, top posters, events)
  const postsSide = view === "posts" && !g && !!c && (c.feedPolicy ?? "off") !== "off";
  const sideKind = threadId && !postFull ? "comments" : threadSlug ? "thread" : voiceChannel ? "voice" : boardSide ? "board" : postsSide ? "posts" : null;
  // the wide-screen-only panels: no header button, no slide-over on narrow screens
  const panelOnly = sideKind === "board" || sideKind === "posts";
  const side = (onNavigate?: () => void) =>
    sideKind === "comments" ? (
      <TopicSide onClose={closeTopic} bare={!!onNavigate} />
    ) : sideKind === "thread" && threadSlug ? (
      <ThreadSide key={threadSlug} slug={slug} threadSlug={threadSlug} isMember={member} gate={<JoinButton size="md" community={c} onChange={(next) => joined(next as CommunityDTO)} />} onClose={() => openThread(null)} />
    ) : sideKind === "voice" && voiceChannel ? (
      <VoiceSide channel={voiceChannel} communityName={g ? g.name : c.name} snapshot={voice} />
    ) : sideKind === "board" && boardSide ? (
      <BoardSidebar slug={slug} communityId={c.id} board={boardSide} onBoardChanged={() => void boardsApi.reload()} />
    ) : sideKind === "posts" && c ? (
      <PostsSidebar c={c} onCommunity={(next) => setData({ ...c, ...next })} />
    ) : null;
  const sideLabel = sideKind === "comments" ? "Post" : sideKind === "thread" ? "Thread" : sideKind === "board" ? "About this board" : sideKind === "posts" ? `About ${c?.name ?? "this community"}` : "Voice info";
  const closeAbout = () => setAboutOpen(false);

  const headerIcon: IconName = crewOpen ? "pin" : view ? viewTable[view].icon : activeChannel?.type === "announcement" ? "megaphone" : activeChannel?.type === "voice" ? "mic" : "hash";
  const headerTitle = crewOpen ? "Klique" : view === "topics" && !g && activeBoard ? activeBoard.name : view ? viewTable[view].label : (activeChannel?.name ?? "Channels");
  const headerPrefix = g ? `${g.name} · ` : `${c.name} · `;
  // the community's owner (or a site admin) can look into any group; to chat they add themselves first
  const groupGate = !g || g.viewer.isMember ? null : g.viewer.canManage ? (
    <Button variant="primary" size="sm" href={`/communities/${slug}?g=${g.slug}&view=members`}>
      <Icon name="userplus" size={14} /> Add yourself to chat
    </Button>
  ) : null;

  // The middle pane for a group, before it can show anything.
  const groupPane = (): ReactNode | null => {
    if (!gSlug) return null;
    if (group.loading || (!group.data && !group.error)) {
      return (
        <ChatSkeleton />
      );
    }
    if (group.error || !g) {
      return (
        <Scroll inner>
          <SpaceError status={group.status} message={group.error} onRetry={group.reload} backHref={`/communities/${slug}`} backLabel="Back to community" />
        </Scroll>
      );
    }
    if (g.moderationOnly) {
      return (
        <Scroll inner>
          <section className="rounded-card border border-line bg-surface p-6 text-center">
            <span className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full bg-raised text-accent-text">
              <Icon name="shield" size={22} />
            </span>
            <p className="eyebrow">Invite-only group · moderator view</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{g.name}</h1>
            <p className="mx-auto mt-3 max-w-sm text-sm text-ink-muted">You can moderate this group as an admin of {g.parent.name}, but its channels, events and members stay private to its members.</p>
            <Button variant="danger" className="mt-5" onClick={() => setDeletingGroup(true)}>
              <Icon name="trash" size={15} /> Delete group
            </Button>
          </section>
        </Scroll>
      );
    }
    if (!g.viewer.canView) {
      return (
        <Scroll inner>
          <EmptyState icon="lock" title={`Join ${g.parent.name} to see this group`}>
            This group lives inside {g.parent.name}. Members of the community can join it.
          </EmptyState>
        </Scroll>
      );
    }
    return null;
  };
  const gp = groupPane();

  return (
    <TopicDetailProvider slug={slug} topicId={threadId}>
    <div className="relative flex h-dvh min-h-0 overflow-hidden">
      <aside className="hidden w-64 shrink-0 border-r border-line bg-surface/40 lg:block">{list()}</aside>

      <section className="flex min-w-0 flex-1 flex-col" aria-label={view ? viewTable[view].label : "Conversation"}>
        {/* an open crew brings its own header (with the info button), like a channel's */}
        {!(crewOpen && !gp) && (
        <header className={cx("flex min-h-14 items-center gap-2 border-b border-line px-3 sm:px-5", postFull && "lg:hidden")}>
          <button type="button" onClick={() => setLeftOpen(true)} aria-label="Open channels" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink hover:bg-raised lg:hidden">
            <Icon name="menu" size={20} />
          </button>
          <Icon name={headerIcon} size={18} className="hidden shrink-0 text-ink-muted sm:block" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold tracking-[-0.01em]">
              <span className="text-ink-muted lg:hidden">{headerPrefix}</span>
              {headerTitle}
            </h2>
            {!view && activeChannel?.topic && <p className="hidden truncate text-xs text-ink-muted sm:block">{activeChannel.topic}</p>}
          </div>
          {!view && !!activeChannel?.slowModeSec && (
            <span title={`Slow mode: one message every ${slowModeLabel(activeChannel.slowModeSec)}`} className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 font-mono text-[11px] font-semibold text-ink-muted">
              <Icon name="timer" size={14} />
              <span className="sr-only">Slow mode:</span>
              {slowModeLabel(activeChannel.slowModeSec)}
            </span>
          )}
          {/* search the community (Discord style): ?view=search&q=… */}
          {!g && c && member && (
            <span className="hidden sm:block">
              <CommunitySearchBox slug={slug} channels={(channels.data?.channels ?? []).map((x) => ({ slug: x.slug, name: x.name }))} initial={view === "search" ? (sp.get("q") ?? "") : ""} />
            </span>
          )}
          {!view && !g && activeChannel && activeChannel.type !== "voice" && (
            <button type="button" onClick={() => setThreadsOf({ slug: activeChannel.slug, name: activeChannel.name })} aria-label="Threads" title="Threads" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink hover:bg-raised">
              <Icon name="message" size={19} />
            </button>
          )}
          {sideKind && !panelOnly && (
            <button type="button" onClick={() => setRightOpen(true)} aria-label={sideLabel} className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink hover:bg-raised xl:hidden">
              <Icon name={sideKind === "comments" || sideKind === "thread" ? "message" : "mic"} size={19} />
            </button>
          )}
        </header>
        )}

        {gp ? (
          gp
        ) : crewOpen ? (
          <CrewView key={crewOpen} id={crewOpen} tab={sp.get("tab")} embedded onMenu={() => setLeftOpen(true)} onChanged={() => void reloadCrews()} onRead={() => markCrewReadLocally(crewOpen)} />
        ) : view === "search" && !g ? (
          <Scroll inner>
            <div className="mb-3 sm:hidden">
              <CommunitySearchBox slug={slug} channels={(channels.data?.channels ?? []).map((x) => ({ slug: x.slug, name: x.name }))} initial={sp.get("q") ?? ""} />
            </div>
            <CommunitySearchResults slug={slug} q={sp.get("q") ?? ""} />
          </Scroll>
        ) : view === "kliques" ? (
          <Scroll inner wide>
            <CrewsBoard slug={slug} sub={gSlug} eventId={sp.get("e")} community={{ slug, name: c?.name ?? "", interest: c?.interest ?? "" }} onChanged={() => void reloadCrews()} />
          </Scroll>
        ) : view === "events" ? (
          <Scroll inner full>
            <SectionHeader title="Events" />
            <SpaceEvents slug={slug} subSlug={gSlug ?? undefined} canHost={g ? g.viewer.canManage : c.canHostEvents} canSubmit={!g && c.canSubmitEvents} />
          </Scroll>
        ) : view === "posts" && !g ? (
          <Scroll inner>
            <FeedPanel c={c} />
          </Scroll>
        ) : postFull ? (
          <div className="min-h-0 flex-1">
            <TopicSide onClose={closeTopic} full />
          </div>
        ) : view === "topics" && !g ? (
          // the post list fills the room between the channels and an open post
          <Scroll inner fill>
            <TopicsPanel slug={slug} communityName={c.name} isMember={member} openId={threadId} board={activeBoard} />
          </Scroll>
        ) : view === "updates" && g ? (
          <Scroll inner>
            <SectionHeader title="Updates" />
            <PostsPanel slug={slug} subSlug={g.slug} canPost={g.viewer.canPost} />
          </Scroll>
        ) : view === "dashboard" && !g ? (
          <Scroll inner wide>
            <SectionHeader title="Dashboard" />
            <DashboardView c={c} />
          </Scroll>
        ) : view === "members" ? (
          <Scroll inner full>
            <SectionHeader title="Members" />
            <MembersPanel
              slug={slug}
              subSlug={gSlug ?? undefined}
              group={g ? { name: g.name, communityName: c.name, memberCount: g.memberCount ?? 0, canAdd: g.viewer.canManage, onChanged: () => void Promise.all([group.reload(), reloadChannels(), groupChannels.reload()]) } : undefined}
            />
          </Scroll>
        ) : channels.loading || (!channels.data && !channels.error) || (gSlug && (groupChannels.loading || (!groupChannels.data && !groupChannels.error))) ? (
          <ChatSkeleton />
        ) : channels.error || (gSlug && groupChannels.error) ? (
          <Scroll inner>
            <ErrorState message={channels.error ?? groupChannels.error ?? ""} onRetry={() => void (channels.error ? channels.reload() : groupChannels.reload())} />
          </Scroll>
        ) : activeChannel?.type === "voice" ? (
          <VoicePanel
            key={`${gSlug ?? ""}/${activeChannel.slug}`}
            space={{ slug, sub: gSlug }}
            channel={activeChannel}
            isMember={g ? g.viewer.isMember : member}
            gate={g ? groupGate : <JoinButton size="md" community={c} onChange={(next) => joined(next as CommunityDTO)} />}
            onState={setVoice}
          />
        ) : activeChannel ? (
          <ChatPane
            key={`${gSlug ?? ""}/${activeChannel.slug}`}
            space={{ slug, sub: gSlug }}
            channel={activeChannel}
            isMember={g ? g.viewer.isMember : member}
            gate={g ? groupGate : <JoinButton size="md" community={c} onChange={(next) => joined(next as CommunityDTO)} />}
            onRead={() => markReadLocally(activeChannel.slug)}
            // ?m=<message id>: jump to it (from search)
            focus={sp.get("m")}
            onOpenThread={g ? undefined : (s) => openThread(s)}
          />
        ) : (
          <Scroll inner>
            <EmptyState
              icon="hash"
              title="No channels yet"
              action={
                !g && c.viewer.canManage ? (
                  <Link href={`/communities/${c.slug}?settings=overview`} className="text-sm font-semibold text-accent-text hover:underline">
                    Open settings
                  </Link>
                ) : undefined
              }
            >
              {(g ? g.viewer.canManage : c.viewer.canManage) ? "Use the + in the left panel to create the first one." : "The admins haven't set up any channels yet."}
            </EmptyState>
          </Scroll>
        )}
      </section>

      {sideKind === "comments" || sideKind === "thread" ? (
        <ResizableSide label={sideLabel}>{side()}</ResizableSide>
      ) : sideKind ? (
        <aside className={cx("hidden shrink-0 border-l border-line xl:block", panelOnly ? "w-[22rem] overflow-hidden 2xl:w-[24rem]" : "w-[24rem] overflow-hidden")} aria-label={sideLabel}>
          {side()}
        </aside>
      ) : null}

      {settingsReq && canSettings && (g ? (
        <GroupSettings
          g={g}
          tab={settingsReq}
          onTab={setSettings}
          onClose={() => setSettings(null)}
          onChanged={async () => {
            await Promise.all([group.reload(), reloadChannels()]);
          }}
        />
      ) : !gSlug ? (
        <CommunitySettings
          c={c}
          tab={settingsReq}
          onTab={setSettings}
          onClose={() => setSettings(null)}
          onChanged={async () => {
            await reload();
            await reloadChannels();
          }}
        />
      ) : null)}

      {threadsOf && (
        <ThreadsModal
          slug={slug}
          channel={threadsOf}
          onClose={() => setThreadsOf(null)}
          onOpen={(s) => {
            setThreadsOf(null);
            openThread(s);
          }}
        />
      )}
      {/* the welcome screen: once for new members (or when they open it to accept the rules) */}
      {c && (welcomeOpen ?? !!c.viewer.welcomePending) && !settingsReq && (
        <WelcomeModal
          slug={c.slug}
          name={c.name}
          onClose={() => setWelcomeOpen(false)}
          onDone={async () => {
            setWelcomeOpen(false);
            await reload();
            await reloadChannels();
          }}
        />
      )}

      <SlideOver open={leftOpen} onClose={closeLeft} side="left" title="Channels">
        {list(closeLeft)}
      </SlideOver>
      {/* below xl the right panel is a drawer; an open topic opens it by itself, and closing it closes the topic */}
      <SlideOver open={(rightOpen && !!sideKind && !panelOnly) || ((sideKind === "comments" || sideKind === "thread") && !wide)} onClose={sideKind === "comments" ? () => (setRightOpen(false), closeTopic()) : sideKind === "thread" ? () => (setRightOpen(false), openThread(null)) : closeRight} side="right" title={sideLabel} wide={sideKind === "comments" || sideKind === "thread"}>
        {side(sideKind === "comments" ? () => (setRightOpen(false), closeTopic()) : sideKind === "thread" ? () => (setRightOpen(false), openThread(null)) : closeRight)}
      </SlideOver>

      {/* About (from the community or group name menu): what it is, who runs it, what's coming up, share */}
      <Modal open={aboutOpen} onClose={closeAbout} title={g ? "About this group" : "About this community"} size="lg">
        {aboutOpen &&
          (g ? (
            <GroupInfo group={g} onNavigate={closeAbout} />
          ) : (
            <CommunityInfo community={c} onJoined={joined} onNavigate={closeAbout} />
          ))}
      </Modal>

      <ConfirmModal
        open={leaving}
        onClose={() => setLeaving(false)}
        title={`Leave ${c.name}?`}
        description={(c.privacy === "private" ? "This is a private community. You'll need an invite or approval to get back in." : "You can rejoin any time.") + crewWarning(null)}
        confirmLabel="Leave community"
        onConfirm={leave}
      />
      <ConfirmModal
        open={deletingGroup}
        onClose={() => setDeletingGroup(false)}
        title="Delete this group?"
        description="This can't be undone."
        confirmLabel="Delete group"
        onConfirm={async () => {
          await SubcommunityService.remove(slug, gSlug!);
          toast("Group deleted", "success");
          setDeletingGroup(false);
          router.replace(`/communities/${slug}`);
        }}
      />
      {reporting && <ReportDialog open onClose={() => setReporting(false)} targetType="community" targetId={c.id} subject="this community" />}
    </div>
    </TopicDetailProvider>
  );
}

/** Scrollable page area. `inner` constrains width for non-chat views; `wide` and `full` loosen it. */
function Scroll({ children, inner, wide, full, fill }: { children: ReactNode; inner?: boolean; wide?: boolean; full?: boolean; fill?: boolean }) {
  return (
    // relative: anything absolutely placed inside (screen-reader text, a chart's tooltip) is held by this scroller.
    // Without it, it belongs to the whole page, and the page itself scrolled, leaving the side columns cut short.
    <div className={inner ? "relative min-h-0 flex-1 overflow-y-auto" : "relative h-dvh overflow-y-auto"}>
      {inner ? <div className={cx("mx-auto px-4 py-6 sm:px-8", fill ? "max-w-none" : full ? "max-w-6xl" : wide ? "max-w-5xl" : "max-w-3xl")}>{children}</div> : <div className="p-4 sm:p-8">{children}</div>}
    </div>
  );
}


const SIDE_WIDTH_KEY = "klique:side-width";

/**
 * The chat panel beside a board (an open post, a thread): drag its left edge to make it wider or narrower, or use the
 * arrow keys on the edge. It never gets so wide the list in the middle disappears; double-click the edge to reset.
 * The width is remembered on this device.
 */
function ResizableSide({ label, children }: { label: string; children: ReactNode }) {
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(SIDE_WIDTH_KEY));
      if (saved) setWidth(saved);
    } catch {
      /* storage blocked: the default width */
    }
  }, []);
  const save = (w: number | null) => {
    try {
      if (w) localStorage.setItem(SIDE_WIDTH_KEY, String(w));
      else localStorage.removeItem(SIDE_WIDTH_KEY);
    } catch {
      /* fine */
    }
  };
  // at least 360px; at most what leaves the channels and about 420px of list beside it (CSS max-width enforces it too)
  const clamp = (w: number) => Math.round(Math.max(360, Math.min(w, window.innerWidth - 760)));
  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const from = e.clientX;
    const start = e.currentTarget.parentElement!.getBoundingClientRect().width;
    let last = start;
    const move = (ev: PointerEvent) => {
      last = clamp(start + (from - ev.clientX));
      setWidth(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      save(last);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };
  const nudge = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = clamp((width ?? e.currentTarget.parentElement!.getBoundingClientRect().width) + (e.key === "ArrowLeft" ? 32 : -32));
    setWidth(next);
    save(next);
  };
  return (
    <aside
      aria-label={label}
      style={width ? { width, minWidth: 360, maxWidth: "calc(100vw - 760px)" } : { minWidth: 360, maxWidth: "calc(100vw - 760px)" }}
      className={cx("relative hidden shrink-0 overflow-hidden border-l border-line xl:block", !width && "w-[30rem] 2xl:w-[34rem]")}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the panel"
        title="Drag to resize · double-click to reset"
        tabIndex={0}
        onPointerDown={drag}
        onKeyDown={nudge}
        onDoubleClick={() => {
          setWidth(null);
          save(null);
        }}
        className="absolute inset-y-0 left-0 z-20 w-2 cursor-col-resize transition-colors hover:bg-ink-muted/25 focus-visible:bg-ink-muted/40 focus-visible:outline-none"
      />
      {children}
    </aside>
  );
}
