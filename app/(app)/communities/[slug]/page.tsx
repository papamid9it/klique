"use client";

import { placeLabel } from "@/lib/places";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChannelService } from "@/app/services/ChannelService";
import { CommunityService } from "@/app/services/CommunityService";
import { SpaceService } from "@/app/services/SpaceService";
import { SubcommunityService } from "@/app/services/SubcommunityService";
import { errorMessage } from "@/app/ApiCore";
import { VoicePanel } from "@/components/domain/voice/VoicePanel";
import { TopicService } from "@/app/services/TopicService";
import { TopicComments, TopicDetailProvider } from "@/components/domain/topics/TopicThread";
import { VoiceSide, type VoiceSnapshot } from "@/components/domain/voice/VoicePanel";
import { TopicsPanel } from "@/components/domain/topics/TopicsPanel";
import { ChannelList, orderChannels, type GroupView, type WorkspaceView } from "@/components/domain/chat/ChannelList";
import { ChatPane } from "@/components/domain/chat/ChatPane";
import { CommunityInfo } from "@/components/domain/chat/CommunityInfo";
import { GroupInfo } from "@/components/domain/chat/GroupInfo";
import { GroupSettings } from "@/components/domain/space/GroupSettings";
import { PostsPanel } from "@/components/domain/space/PostsPanel";
import { CommunityRail } from "@/components/layout/CommunityRail";
import { JoinButton } from "@/components/domain/JoinButton";
import { ReportDialog } from "@/components/domain/ReportDialog";
import { SectionHeader } from "@/components/domain/SectionHeader";
import { GroupsView } from "@/components/domain/space/GroupsView";
import { CommunitySettings } from "@/components/domain/space/CommunitySettings";
import { MembersPanel } from "@/components/domain/space/MembersPanel";
import { ConfirmModal, SpaceError } from "@/components/domain/space/parts";
import { SpaceEvents } from "@/components/domain/space/SpaceEvents";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { cx } from "@/components/ui/cx";
import { SlideOver } from "@/components/ui/SlideOver";
import { EmptyState, ErrorState } from "@/components/ui/States";

import { useRealtime, useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { useApi } from "@/lib/hooks/useApi";
import type { ChannelDTO, ChannelGroupDTO, ChannelsDTO, CommunityDTO } from "@/lib/types";

const VIEWS: Record<WorkspaceView, { label: string; icon: IconName }> = {
  topics: { label: "Topics", icon: "topics" },
  events: { label: "Events", icon: "calendar" },
  groups: { label: "Groups", icon: "folder" },
  members: { label: "Members", icon: "users" },
};

const GROUP_VIEWS: Record<Exclude<GroupView, "updates">, { label: string; icon: IconName }> = {
  events: { label: "Events", icon: "calendar" },
  members: { label: "Members", icon: "users" },
};

/**
 * A community is a chat space: channels on the left (grouped in categories), the conversation in the
 * middle, and the community's info on the right. Events, groups, members and settings are views in the
 * middle pane. URL: /communities/<slug>?c=<channel>  or  ?view=events|groups|members|manage
 * A group is a section of the same workspace: ?g=<group>&c=<channel>  or  ?g=<group>&view=updates|events|members|manage
 */
export default function CommunityPage() {
  const { slug } = useParams<{ slug: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { data: c, loading, error, status, reload, setData } = useApi(() => CommunityService.get(slug), [slug, user?.id]);
  const canUse = !!c && !c.locked;
  const channels = useApi(canUse ? () => ChannelService.list({ slug }) : null, [slug, user?.id, c?.id, c?.viewer.isMember, c?.locked]);

  const gSlug = sp.get("g");
  const boardsApi = useApi(canUse ? () => TopicService.boards(slug) : null, [slug, user?.id, c?.id, c?.viewer.isMember, c?.locked]);
  const boards = useMemo(() => boardsApi.data ?? [], [boardsApi.data]);
  const group = useApi(canUse && gSlug ? () => SubcommunityService.get(slug, gSlug) : null, [slug, gSlug, user?.id, c?.id]);
  const g = gSlug ? group.data : null;
  const gReadable = !!g && !g.moderationOnly && g.viewer.canView;
  const groupChannels = useApi(canUse && gSlug && gReadable ? () => ChannelService.list({ slug, sub: gSlug }) : null, [slug, gSlug, user?.id, gReadable, g?.viewer.isMember]);
  const [joiningGroup, setJoiningGroup] = useState(false);
  const [leavingGroup, setLeavingGroup] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);

  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
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

  const closeLeft = useCallback(() => setLeftOpen(false), []);
  const closeRight = useCallback(() => setRightOpen(false), []);

  const ordered = useMemo(() => (channels.data ? orderChannels(channels.data).flatMap((s) => s.channels) : []), [channels.data]);

  // channels of the group being viewed (a preview section for a group you haven't joined)
  const groupList = useMemo(() => (groupChannels.data ? [...groupChannels.data.channels] : []), [groupChannels.data]);
  const pool = gSlug ? groupList : ordered;

  const requestedView = sp.get("view");
  const viewTable: Record<string, { label: string; icon: IconName }> = gSlug ? GROUP_VIEWS : VIEWS;
  const view = (
    requestedView && requestedView in viewTable &&
    (requestedView !== "members" || (gSlug ? !!g?.viewer.isMember : member)) &&
    (gSlug ? requestedView !== "groups" : requestedView !== "updates")
      ? requestedView
      : null
  ) as (WorkspaceView | GroupView) | null;
  const [voice, setVoice] = useState<VoiceSnapshot | null>(null);
  const activeBoard = boards.find((b) => b.slug === sp.get("b")) ?? boards[0] ?? null;
  const requestedChannel = sp.get("c");
  const activeChannel: ChannelDTO | null = view ? null : (pool.find((x) => x.slug === requestedChannel) ?? pool.find((x) => x.slug === "general") ?? pool[0] ?? null);

  const markReadLocally = useCallback(
    (channelSlug: string) => {
      const clear = (list: ChannelDTO[]) => list.map((x) => (x.slug === channelSlug ? { ...x, unread: false, mentions: 0 } : x));
      if (gSlug) {
        groupChannels.setData((d: ChannelsDTO | null) => (d ? { ...d, channels: clear(d.channels) } : d));
        channels.setData((d: ChannelsDTO | null) => (d ? { ...d, groups: d.groups.map((x) => (x.slug === gSlug ? { ...x, channels: clear(x.channels) } : x)) } : d));
      } else {
        channels.setData((d: ChannelsDTO | null) => (d ? { ...d, channels: clear(d.channels) } : d));
      }
    },
    [channels, groupChannels, gSlug],
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
      <div className="flex h-dvh" role="status" aria-label="Loading community">
        <div className="hidden w-64 shrink-0 space-y-3 border-r border-line p-4 lg:block">
          <Skeleton className="h-10" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
        <div className="flex-1 space-y-4 p-6">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
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
            <p className="eyebrow">Private community</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{c.name}</h1>
            <p className="mt-1 text-sm text-ink-muted">{placeLabel(c)}</p>
            <p className="mx-auto mt-4 max-w-sm text-sm text-ink-muted">Channels, events and members are only visible to members. Send a request and an admin will take a look.</p>
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
            <p className="mt-4 text-xs text-ink-muted">Got an invite link? Open it to join straight away.</p>
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
  const canSettings = gSlug ? !!g?.viewer.canManage : c.viewer.canManage;
  const setSettings = (tab: string | null) => {
    const q = new URLSearchParams(sp.toString());
    if (q.get("view") === "manage") q.delete("view");
    if (tab) q.set("settings", tab);
    else q.delete("settings");
    const qs = q.toString();
    router.replace(qs ? `/communities/${slug}?${qs}` : `/communities/${slug}`, { scroll: false });
  };

  const joined = (next: CommunityDTO) => {
    setData(next);
    void reload();
    void reloadChannels();
  };
  const joinGroup = async () => {
    setJoiningGroup(true);
    try {
      toast((await SpaceService.join(slug, gSlug!)).data.message, "success");
      await Promise.all([group.reload(), reloadChannels(), groupChannels.reload()]);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setJoiningGroup(false);
    }
  };
  const leaveGroup = async () => {
    await SpaceService.leave(slug, gSlug!);
    toast("You left the group", "success");
    setLeavingGroup(false);
    await Promise.all([group.reload(), reloadChannels(), groupChannels.reload()]);
  };
  const leave = async () => {
    await SpaceService.leave(slug);
    toast(`You left ${c.name}`, "success");
    setLeaving(false);
    await reload();
  };

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
      <ChannelList community={c} data={listData} activeChannel={activeChannel?.slug ?? null} activeGroup={gSlug} view={view} boards={boards} activeBoard={activeBoard?.slug ?? null} onBoardsChanged={() => void boardsApi.reload()} onChanged={() => void reloadChannels()} onNavigate={onNavigate} onLeave={() => setLeaving(true)} onReport={() => setReporting(true)} />
    ) : channels.error ? (
      <div className="p-4">
        <ErrorState title="Couldn't load channels" message={channels.error} onRetry={channels.reload} />
      </div>
    ) : (
      <div className="space-y-2 p-4" role="status" aria-label="Loading channels">
        <Skeleton className="h-10" />
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
      </div>
    );

  const threadId = view === "topics" && !g ? sp.get("t") : null;
  const voiceChannel = !view && activeChannel?.type === "voice" ? activeChannel : null;
  // the right panel follows what you're looking at: a topic's comments, a call's roster, or the community card
  const sideKind = threadId ? "comments" : voiceChannel ? "voice" : "about";
  const side = (onNavigate?: () => void) =>
    sideKind === "comments" ? (
      <TopicComments />
    ) : sideKind === "voice" && voiceChannel ? (
      <VoiceSide channel={voiceChannel} communityName={g ? g.name : c.name} snapshot={voice} />
    ) : (
      info(onNavigate)
    );
  const sideLabel = sideKind === "comments" ? "Comments" : sideKind === "voice" ? "Voice info" : g ? "About this group" : "About this community";

  const info = (onNavigate?: () => void) =>
    g ? (
      <GroupInfo group={g} onJoin={() => void joinGroup()} joining={joiningGroup} onLeave={() => setLeavingGroup(true)} onNavigate={onNavigate} />
    ) : (
      <CommunityInfo community={c} onJoined={joined} onNavigate={onNavigate} onLeave={() => setLeaving(true)} />
    );

  const headerIcon: IconName = view ? viewTable[view].icon : activeChannel?.type === "announcement" ? "megaphone" : activeChannel?.type === "voice" ? "mic" : "hash";
  const headerTitle = view === "topics" && !g && activeBoard ? activeBoard.name : view ? viewTable[view].label : (activeChannel?.name ?? "Channels");
  const headerPrefix = g ? `${g.name} · ` : `${c.name} · `;
  const groupGate = !g ? null : g.viewer.isMember ? null : g.viewer.canView && g.visibility !== "private" ? (
    <Button variant="primary" size="sm" onClick={() => void joinGroup()} loading={joiningGroup}>
      <Icon name="plus" size={14} /> Join {g.name} to chat
    </Button>
  ) : null;

  // The middle pane for a group, before it can show anything.
  const groupPane = (): ReactNode | null => {
    if (!gSlug) return null;
    if (group.loading || (!group.data && !group.error)) {
      return (
        <div className="space-y-4 p-6" role="status" aria-label="Loading group">
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-10 w-2/3" />
        </div>
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
    <div className="flex h-dvh min-h-0">
      <aside className="hidden w-64 shrink-0 border-r border-line bg-surface/40 lg:block">{list()}</aside>

      <section className="flex min-w-0 flex-1 flex-col" aria-label={view ? viewTable[view].label : "Conversation"}>
        <header className="flex min-h-14 items-center gap-2 border-b border-line px-3 sm:px-5">
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
          <button type="button" onClick={() => setRightOpen(true)} aria-label={sideLabel} className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink hover:bg-raised xl:hidden">
            <Icon name={sideKind === "comments" ? "message" : sideKind === "voice" ? "mic" : "info"} size={19} />
          </button>
        </header>

        {gp ? (
          gp
        ) : view === "events" ? (
          <Scroll inner full>
            <SectionHeader title="Events" />
            <SpaceEvents slug={slug} subSlug={gSlug ?? undefined} canHost={g ? g.viewer.canManage || c.canHostEvents : c.canHostEvents} />
          </Scroll>
        ) : view === "topics" && !g ? (
          <Scroll inner wide>
            <TopicsPanel slug={slug} communityName={c.name} isMember={member} topicId={sp.get("t")} board={activeBoard} />
            {/* below xl there's no room for the side panel: the comments sit under the post instead */}
            {threadId && (
              <div className="xl:hidden">
                <TopicComments inline />
              </div>
            )}
          </Scroll>
        ) : view === "updates" && g ? (
          <Scroll inner>
            <SectionHeader title="Updates" />
            <PostsPanel slug={slug} subSlug={g.slug} canPost={g.viewer.canPost} />
          </Scroll>
        ) : view === "groups" && !g ? (
          <Scroll inner full>
            <GroupsView c={c} />
          </Scroll>
        ) : view === "members" ? (
          <Scroll inner full>
            <SectionHeader title="Members" />
            <MembersPanel slug={slug} subSlug={gSlug ?? undefined} />
          </Scroll>
        ) : channels.loading || (!channels.data && !channels.error) || (gSlug && (groupChannels.loading || (!groupChannels.data && !groupChannels.error))) ? (
          <div className="space-y-4 p-6" role="status" aria-label="Loading">
            <Skeleton className="h-10 w-1/2" />
            <Skeleton className="h-10 w-2/3" />
          </div>
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

      <aside className={cx("hidden shrink-0 border-l border-line xl:block", sideKind === "about" ? "w-80 overflow-y-auto" : "w-[24rem] overflow-hidden")} aria-label={sideLabel}>
        {side()}
      </aside>

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

      <SlideOver open={leftOpen} onClose={closeLeft} side="left" title="Channels">
        {list(closeLeft)}
      </SlideOver>
      <SlideOver open={rightOpen} onClose={closeRight} side="right" title={sideLabel}>
        {side(closeRight)}
      </SlideOver>

      <ConfirmModal
        open={leaving}
        onClose={() => setLeaving(false)}
        title={`Leave ${c.name}?`}
        description={c.privacy === "private" ? "This is a private community. You'll need an invite or approval to get back in." : "You can rejoin any time."}
        confirmLabel="Leave community"
        onConfirm={leave}
      />
      <ConfirmModal open={leavingGroup} onClose={() => setLeavingGroup(false)} title={`Leave ${g?.name ?? "group"}?`} description={g?.visibility === "private" ? "It's invite-only, so you'll need a new invite to get back in." : "You can rejoin any time."} confirmLabel="Leave group" onConfirm={leaveGroup} />
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
function Scroll({ children, inner, wide, full }: { children: ReactNode; inner?: boolean; wide?: boolean; full?: boolean }) {
  return (
    <div className={inner ? "min-h-0 flex-1 overflow-y-auto" : "h-dvh overflow-y-auto"}>
      {inner ? <div className={cx("mx-auto px-4 py-6 sm:px-8", full ? "max-w-6xl" : wide ? "max-w-5xl" : "max-w-3xl")}>{children}</div> : <div className="p-4 sm:p-8">{children}</div>}
    </div>
  );
}
