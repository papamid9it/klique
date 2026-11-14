"use client";

import { HeaderIcons } from "@/components/layout/HeaderIcons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRealtime, useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { softNavigate } from "@/lib/nav";
import { useAppEvent } from "@/lib/appEvents";
import { SpaceService } from "@/app/services/SpaceService";
import { errorMessage, isApiError } from "@/app/ApiCore";
import { CrewService } from "@/app/services/CrewService";
import { crewSource } from "@/app/services/ChatSource";
import { ChatPane } from "@/components/domain/chat/ChatPane";
import { ConfirmModal, SpaceError } from "@/components/domain/space/parts";
import { ShareButton } from "@/components/domain/ShareButton";
import { ReportDialog } from "@/components/domain/ReportDialog";
import { PlanBadge, UpgradePrompt } from "@/components/domain/account/PlanTab";
import { Cover } from "@/components/ui/Cover";
import { ImageField } from "@/components/ui/ImageField";
import { useAuth } from "@/components/providers/AuthProvider";
import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { TextArea, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { SlideOver } from "@/components/ui/SlideOver";
import { cx } from "@/components/ui/cx";
import { formatDateLong, formatDateShort, formatTime, relativeStamp } from "@/lib/format";
import { useApi, useNow } from "@/lib/hooks/useApi";
import type { ChannelDTO, CrewDTO, CrewJoinMode } from "@/lib/types";
import { Faces, StandingTag, crewHref, fromWall, wallInputs } from "./parts";
import { YourTime, zoneCity } from "@/components/domain/places/ZoneField";
import { zoneLabel } from "@/lib/timezones";
import { AudienceFields, audienceInput, audienceTag, checkAudience, type AudienceValue } from "./AudienceFields";
import { useConfirm } from "@/components/providers/ConfirmProvider";

/**
 * One klique: its cover and hook line, where and when to meet (members only), who's in, join / ask / leave, the
 * host's requests, and the chat. `embedded`: shown inside its community's workspace (the left panel lists your
 * kliques); `onChanged` lets that panel refresh when you join, leave or call one off. On its own page, a klique
 * that belongs to a community moves into that community. `onMenu` opens the community's channel list on phones.
 */
export function CrewView({ id, embedded, onChanged, onRead, onMenu, tab }: { id: string; embedded?: boolean; onChanged?: () => void; onRead?: () => void; onMenu?: () => void; tab?: string | null }) {
  const router = useRouter();
  const { data: crew, loading, error, status, reload, setData } = useApi(() => CrewService.get(id), [id], { key: `crew:${id}` });
  // someone asked, joined, left or was let in (you included): the page updates by itself
  useRealtimeEvent(
    () => {
      void reload();
      onChanged?.();
    },
    // (a community request approved also changes what you can do here)
    { filter: (e) => (e.type === "crew" && e.crewId === id && !e.chat) || (e.type === "notify" && (e.ref === `crew:${id}` || e.category === "community")), debounceMs: 250 },
  );
  // you joined, asked to join or left a community somewhere in this tab: the Join button follows at once
  useAppEvent("membership", () => void reload());
  // without a live connection, look again every so often
  const { connected } = useRealtime();
  useEffect(() => {
    if (connected) return;
    const t = setInterval(() => document.visibilityState === "visible" && void reload(), 15_000);
    return () => clearInterval(t);
  }, [connected, reload]);
  const target = crew && !embedded && crew.space ? crewTabHref(crew, tab ?? null) : null;
  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  if (loading || target) {
    return (
      <Page>
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-48" />
          <Skeleton className="h-32" />
        </div>
      </Page>
    );
  }
  if (error || !crew)
    return (
      <Page>
        <SpaceError status={status} message={error} onRetry={reload} backHref="/kliques" backLabel="Back to kliques" />
      </Page>
    );
  return (
    <Crew
      crew={crew}
      tab={tab ?? null}
      onRead={onRead}
      onMenu={onMenu}
      embedded={!!embedded}
      onChange={(c) => {
        setData(c);
        onChanged?.();
      }}
      onGone={onChanged}
      reload={reload}
    />
  );
}

/** The crew's own address, plus "&tab=…" / "?tab=…" for a sub-page such as its join requests. */
const crewTabHref = (crew: CrewDTO, tab: string | null) => {
  const base = crewHref(crew);
  return tab ? `${base}${base.includes("?") ? "&" : "?"}tab=${tab}` : base;
};

/** how many of "Who's in" show on the page; See all opens everyone */
const MEMBERS_SHOWN = 10;

/** A scrolling page column, for everything that isn't the chat (loading, the way in, the requests list). */
function Page({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-full min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8">{children}</div>
    </div>
  );
}

function Crew({ crew, tab, embedded, onChange, onGone, onRead, onMenu, reload }: { crew: CrewDTO; tab: string | null; embedded: boolean; onChange: (c: CrewDTO) => void; onGone?: () => void; onRead?: () => void; onMenu?: () => void; reload: () => Promise<void> }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { requireAuth } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [callingOff, setCallingOff] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [limit, setLimit] = useState<string | null>(null);
  const [allMembers, setAllMembers] = useState(false);
  const closeInfo = useCallback(() => setInfoOpen(false), []);
  // the crew chat runs on the same chat screen as a community channel; it only needs a channel-shaped label
  const [source] = useState(() => crewSource(crew.id));
  const chatChannel = useMemo<ChannelDTO>(
    () => ({ id: crew.id, slug: "klique", name: crew.title, topic: "", type: "text", visibility: "invite", categoryId: null, position: 0, lastMessageAt: null, unread: false, unreadCount: 0, canPost: true, mentions: 0, slowModeSec: 0, slowModeExempt: true }),
    [crew.id, crew.title],
  );
  const read = useCallback(() => onRead?.(), [onRead]);
  const v = crew.viewer;
  const isHost = v.standing === "host";
  const inCrew = v.standing === "host" || v.standing === "member";
  // back to the kliques it sits with: its community's (on this event, if it has one), the event's page, or /kliques
  const backHref = crew.space ? `/communities/${crew.space.slug}?${crew.space.sub ? `g=${crew.space.sub}&` : ""}view=kliques${crew.event ? `&e=${crew.event.id}` : ""}` : crew.event ? `/events/${crew.event.id}/kliques` : "/kliques";
  const backLabel = crew.event ? crew.event.title : crew.community ? `Kliques in ${crew.community.name}` : "Kliques";

  async function act(key: string, fn: () => Promise<{ data: CrewDTO }>, done?: string) {
    setBusy(key);
    try {
      onChange((await fn()).data);
      if (done) toast(done, "success");
    } catch (e) {
      // a plan limit: offer the way to more instead of just an error
      if (isApiError(e) && e.code === "plan_limit") setLimit(errorMessage(e));
      else toast(errorMessage(e), "error");
      void reload();
    } finally {
      setBusy(null);
    }
  }

  /** move between the crew and its sub-pages without reloading the community around it */
  const go = (t: string | null, replace = false) => {
    const href = crewTabHref(crew, t);
    if (embedded) softNavigate(href, { replace });
    else if (replace) router.replace(href, { scroll: false });
    else router.push(href, { scroll: false });
  };

  const join = () => {
    if (!requireAuth()) return;
    if (crew.joinMode === "approval") setAsking(true);
    else void act("join", () => CrewService.join(crew.id), "You're in the klique");
  };

  if (tab === "requests" && isHost) {
    return (
      <Page>
      <RequestsPage
        crew={crew}
        busy={busy}
        onBack={() => go(null)}
        onDecide={(userId, name, accept) => void act(`${accept ? "ok" : "no"}:${userId}`, () => CrewService.decide(crew.id, userId, accept), accept ? `${name} is in` : undefined)}
        onAll={(accept) => void act(accept ? "all-ok" : "all-no", () => CrewService.decideAll(crew.id, accept), accept ? "Accepted" : "Declined")}
      />
      </Page>
    );
  }

  // one person in "Who's in" (the host is first): the short list and the See all pop-up share it
  const memberRow = (m: CrewDTO["members"][number], i: number) => (
    <li key={m.id} className="flex items-center gap-2.5 rounded-control px-1 py-1.5">
      <ProfileTrigger handle={m.handle} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <Avatar name={m.displayName} src={m.avatarUrl} size={30} />
        <span className="truncate text-sm font-medium">{m.displayName}</span>
        <PlanBadge plan={m.badge} size={14} />
        {i === 0 && <span className="rounded bg-accent/15 px-1.5 text-[10px] font-bold tracking-wide text-accent-text uppercase">Host</span>}
      </ProfileTrigger>
      {isHost && i > 0 && (
        <button
          type="button"
          aria-label={`Remove ${m.displayName}`}
          title="Remove from klique"
          onClick={async () => (await confirm({ title: `Remove ${m.displayName}?`, body: "They leave the klique and its chat.", confirmLabel: "Remove" })) && void act(`rm:${m.id}`, () => CrewService.removeMember(crew.id, m.id), `${m.displayName} was removed`)}
          className="inline-flex size-7 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink"
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </li>
  );

  const details = (compact: boolean) => (
    <>
      <section className="overflow-hidden rounded-card border border-line bg-surface">
        <Cover src={crew.coverImage} seed={crew.id} interest={crew.interest} className={compact ? "aspect-[16/9]" : "aspect-[21/9]"} />
        <div className={compact ? "p-4" : "p-5 sm:p-6"}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="eyebrow">Klique · {formatDateShort(crew.meetupAt, crew.timeZone)}</p>
          {audienceTag(crew) && <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold">{audienceTag(crew)}</span>}
          <StandingTag standing={v.standing} />
        </div>
        <h1 className={cx("mt-2 leading-tight font-bold tracking-[-0.03em]", compact ? "text-xl" : "text-[clamp(1.5rem,3.5vw,2rem)]")}>{crew.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {crew.event ? (
            <>
              To{" "}
              <Link href={`/events/${crew.event.id}`} className="font-medium text-accent-text hover:underline">
                {crew.event.title}
              </Link>
            </>
          ) : crew.community ? (
            <>
              In{" "}
              <Link href={`/communities/${crew.community.slug}`} className="font-medium text-accent-text hover:underline">
                {crew.community.name}
              </Link>
            </>
          ) : (
            <>From {crew.area}</>
          )}{" "}
          · hosted by{" "}
          <ProfileTrigger handle={crew.host.handle} className="font-medium text-ink hover:underline">
            {crew.host.displayName}
          </ProfileTrigger>
        </p>

        <dl className={cx("mt-5 grid gap-3", !compact && "sm:grid-cols-2")}>
          <div className="flex gap-3 rounded-control border border-line bg-raised p-3">
            <dt className="mt-0.5 text-ink-muted">
              <Icon name="clock" />
              <span className="sr-only">Meetup time</span>
            </dt>
            <dd>
              <span className="block text-sm font-semibold">{formatTime(crew.meetupAt, crew.timeZone)}</span>
              <span className="block text-xs text-ink-muted">{formatDateLong(crew.meetupAt, crew.timeZone)}</span>
              <YourTime iso={crew.meetupAt} zone={crew.timeZone} />
            </dd>
          </div>
          <div className="flex gap-3 rounded-control border border-line bg-raised p-3">
            <dt className="mt-0.5 text-ink-muted">
              <Icon name={crew.meetupPoint ? "pin" : "lock"} />
              <span className="sr-only">Meetup point</span>
            </dt>
            <dd>
              {crew.meetupPoint ? (
                <span className="block text-sm font-semibold break-words">{crew.meetupPoint}</span>
              ) : (
                <>
                  <span className="block text-sm font-semibold">Somewhere in {crew.area}</span>
                  <span className="block text-xs text-ink-muted">The exact spot shows once you&apos;re in.</span>
                </>
              )}
            </dd>
          </div>
        </dl>

        {crew.note && <p className="mt-4 text-[15px] leading-relaxed whitespace-pre-line">{crew.note}</p>}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <span className="flex items-center gap-2.5 text-sm text-ink-muted">
            <Faces people={crew.faces} total={crew.memberCount} size={28} />
            <span className="font-mono text-xs">
              {crew.memberCount}/{crew.maxMembers}
            </span>
            <span className="text-xs">{crew.joinMode === "open" ? "Open" : "Ask to join"}</span>
          </span>
          <div className="flex flex-wrap gap-2">
            {isHost ? (
              <>
                <Button size="sm" onClick={() => setEditing(true)}>
                  <Icon name="edit" size={14} /> Edit
                </Button>
                <Button size="sm" variant="danger" onClick={() => setCallingOff(true)}>
                  Call off
                </Button>
              </>
            ) : v.standing === "member" ? (
              <Button size="sm" onClick={async () => (await confirm({ title: "Leave this klique?", body: "You can ask to join again later if there's room.", confirmLabel: "Leave" })) && void act("leave", () => CrewService.leave(crew.id), "You left the klique")} loading={busy === "leave"}>
                Leave klique
              </Button>
            ) : v.standing === "pending" ? (
              <Button size="sm" onClick={() => void act("leave", () => CrewService.leave(crew.id), "Request taken back")} loading={busy === "leave"}>
                Take back request
              </Button>
            ) : v.canJoin ? (
              <Button size="sm" variant="primary" onClick={join} loading={busy === "join"}>
                {crew.joinMode === "open" ? "Join klique" : "Ask to join"}
              </Button>
            ) : crew.isFull && !crew.closed ? (
              <>
                <Button size="sm" disabled>
                  Full
                </Button>
                <p className="text-xs text-ink-muted">This klique is full.</p>
              </>
          ) : v.joinSpace ? (
              <JoinSpaceButton
                space={v.joinSpace}
                crewOpen={crew.joinMode === "open"}
                onJoined={async () => {
                  await reload();
                  if (crew.joinMode === "approval") setAsking(true);
                  else onChange((await CrewService.join(crew.id, "")).data);
                }}
              />
            ) : (
              v.joinBlockedReason && <p className="text-xs text-ink-muted">{v.joinBlockedReason}</p>
            )}
            <ShareButton path={`/kliques/${crew.id}`} text={crew.title} />
            {!isHost && (
              <Button size="sm" variant="ghost" onClick={() => requireAuth() && setReporting(true)}>
                <Icon name="flag" size={14} /> Report
              </Button>
            )}
            {/* moderators (site admins, the community's owner and admins) may delete it: logged */}
            {!isHost && v.canEdit && (
              <Button size="sm" variant="danger" onClick={() => setCallingOff(true)}>
                <Icon name="trash" size={14} /> Delete klique
              </Button>
            )}
          </div>
        </div>
        {v.standing === "pending" && <p className="mt-3 text-sm text-ink-muted">You asked to join. The host will let you in, and you&apos;ll get a notification.</p>}
        {v.joinSpace && (
          <p className="mt-3 text-sm text-ink-muted">
            {v.joinSpace.requested
              ? `You asked to join ${v.joinSpace.name}. Once you're let in, you can join this crew right here.`
              : `This klique is for members of ${v.joinSpace.name}. ${v.joinSpace.ask ? "Ask to join it" : "Join it"} and you can join this klique straight away.`}
          </p>
        )}
        </div>
      </section>

      {/* one compact line however many ask; the list itself is its own page */}
      {isHost && crew.requests.length > 0 && (
        <section className="mt-5 flex flex-wrap items-center gap-3 rounded-card border border-accent-text/60 bg-surface p-3.5" aria-label="Requests to join">
          <Faces people={crew.requests.slice(0, 4).map((r) => r.user)} total={crew.requests.length} size={30} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {crew.requests.length} {crew.requests.length === 1 ? "person is" : "people are"} asking to join
            </p>
            <p className="truncate text-xs text-ink-muted">
              Newest: {crew.requests[crew.requests.length - 1].user.displayName} · {Math.max(0, crew.maxMembers - crew.memberCount)} spots left
            </p>
          </div>
          <Button size="sm" variant="primary" onClick={() => go("requests")}>
            Requests · {crew.requests.length}
            <Icon name="chevron-right" size={14} />
          </Button>
        </section>
      )}

        <section aria-label="Who's in" className="mt-5">
          <h2 className="mb-2 text-base font-semibold">Who&apos;s in · {crew.membersLimited ? `${crew.memberCount} of ${crew.maxMembers}` : crew.memberCount}</h2>
          <ul className="space-y-1">{crew.members.slice(0, MEMBERS_SHOWN).map(memberRow)}</ul>
          {crew.membersLimited && crew.memberCount > crew.members.length && (
            <p className="mt-1.5 px-1 text-xs text-ink-muted">
              Only the host and your friends show here. {v.standing ? "Everyone shows once you're in." : "Join to see everyone."}
            </p>
          )}
          {crew.members.length > MEMBERS_SHOWN && (
            <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={() => setAllMembers(true)}>
              See all {crew.members.length}
            </Button>
          )}
        </section>
      <p className="mt-6 flex items-start gap-2 text-xs text-ink-muted">
        <Icon name="clock" size={13} className="mt-px shrink-0" /> This klique and its chat disappear on {formatDateShort(crew.expiresAt, crew.timeZone)}. Meet in public, and tell someone where you&apos;re going.
      </p>
    </>
  );
  const modals = (
    <>
      <UpgradePrompt message={limit} onClose={() => setLimit(null)} />
      <Modal open={allMembers} onClose={() => setAllMembers(false)} title={`Who's in · ${crew.memberCount}`}>
        <ul className="space-y-1">{crew.members.map(memberRow)}</ul>
      </Modal>
      {reporting && <ReportDialog open onClose={() => setReporting(false)} targetType="klique" targetId={crew.id} subject="this klique" />}
      {asking && <AskModal crew={crew} onClose={() => setAsking(false)} onDone={(c) => (setAsking(false), onChange(c))} />}
      {editing && <EditCrewModal crew={crew} onClose={() => setEditing(false)} onSaved={(c) => (setEditing(false), onChange(c))} />}
      <ConfirmModal
        open={callingOff}
        onClose={() => setCallingOff(false)}
        title="Call off this klique?"
        description="Everyone in it gets a notification, and the chat is deleted. They can join or start another crew."
        confirmLabel="Call off klique"
        onConfirm={async () => {
          await CrewService.remove(crew.id);
          toast("Klique called off", "success");
          onGone?.();
          if (embedded) softNavigate(backHref, { replace: true });
          else router.replace(backHref);
        }}
      />
    </>
  );

  // not in the klique: no chat, so the details (and the way in) fill the page (site admins still see the chat, to moderate)
  if (!inCrew && !v.canChat) {
    return (
      <div className="relative h-full min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8">
          {onMenu && (
            <button type="button" onClick={onMenu} aria-label="Open channels" className="mb-2 -ml-2 inline-flex size-10 items-center justify-center rounded-full text-ink hover:bg-raised lg:hidden">
              <Icon name="menu" size={20} />
            </button>
          )}
          <Link href={backHref} scroll={false} onClick={(e) => { if (embedded) { e.preventDefault(); softNavigate(backHref); } }} className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
            <Icon name="arrow-left" size={15} /> {backLabel}
          </Link>

          {details(false)}
        </div>
        {modals}
      </div>
    );
  }

  // in the crew: the chat fills the middle like a community channel; the details sit in the right panel
  // (a sheet on phones and narrow screens, from the info button)
  return (
    <div className="flex h-full min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col" aria-label="Klique chat">
        <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-5">
          {onMenu && (
            <button type="button" onClick={onMenu} aria-label="Open channels" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink hover:bg-raised lg:hidden">
              <Icon name="menu" size={20} />
            </button>
          )}
          <Link href={backHref} scroll={false} onClick={(e) => { if (embedded) { e.preventDefault(); softNavigate(backHref); } }} aria-label={`Back to ${backLabel}`} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink">
            <Icon name="arrow-left" size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em]">{crew.title}</h1>
            <p className="truncate text-xs text-ink-muted">
              {crew.event?.title ?? crew.community?.name ?? "All communities"} · {formatDateShort(crew.meetupAt, crew.timeZone)}
            </p>
          </div>
          <span className="hidden sm:block">
            <Faces people={crew.faces} total={crew.memberCount} size={24} />
          </span>
          {isHost && crew.requests.length > 0 && (
            <Button size="sm" variant="primary" onClick={() => go("requests")}>
              Requests · {crew.requests.length}
            </Button>
          )}
          <button type="button" onClick={() => setInfoOpen(true)} aria-label="Klique info" title="Klique info" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink hover:bg-raised xl:hidden">
            <Icon name="info" size={19} />
          </button>
          <HeaderIcons className="ml-auto" />
        </header>
        <ChatPane
          key={crew.id}
          source={source}
          channel={chatChannel}
          isMember={inCrew}
          gate={null}
          onRead={read}
          placeholder="Message the klique"
          intro={(empty) => (
            <div className="px-4 pt-8 pb-2 sm:px-6">
              <span className="mb-3 inline-flex size-14 items-center justify-center rounded-full bg-raised text-accent-text">
                <Icon name="pin" size={26} />
              </span>
              <h2 className="text-2xl font-semibold tracking-[-0.03em]">{crew.title}</h2>
              <p className="mt-1 text-sm text-ink-muted">
                {crew.event ? `Going to ${crew.event.title}. ` : ""}{empty ? "Say hi and sort out the plan: who's bringing what, splitting a ride, running late." : "Sort out the plan here."}
              </p>
            </div>
          )}
        />
      </section>
      <aside className="hidden w-[22rem] shrink-0 overflow-y-auto border-l border-line p-4 xl:block 2xl:w-[24rem]" aria-label="Klique info">
        {details(true)}
      </aside>
      <SlideOver open={infoOpen} onClose={closeInfo} side="right" title="Klique info">
        <div className="p-4 pt-14">{details(true)}</div>
      </SlideOver>
      {modals}
    </div>
  );
}

/**
 * The host's queue of join requests, on its own page so the crew page never grows with it: searchable,
 * oldest first, Accept / Decline per person and both for everyone at once. Back to the crew when it's empty.
 */
function RequestsPage({ crew, busy, onBack, onDecide, onAll }: { crew: CrewDTO; busy: string | null; onBack: () => void; onDecide: (userId: string, name: string, accept: boolean) => void; onAll: (accept: boolean) => void }) {
  const [q, setQ] = useState("");
  const now = useNow();
  const needle = q.trim().toLowerCase().replace(/^@/, "");
  const list = needle ? crew.requests.filter((r) => r.user.displayName.toLowerCase().includes(needle) || r.user.handle.includes(needle)) : crew.requests;
  const room = Math.max(0, crew.maxMembers - crew.memberCount);

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <Icon name="arrow-left" size={15} /> {crew.title}
      </button>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Asking to join</p>
          <h1 className="text-[clamp(1.4rem,3vw,1.8rem)] font-bold tracking-[-0.03em]">
            {crew.requests.length} {crew.requests.length === 1 ? "request" : "requests"}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">{room ? `${room} ${room === 1 ? "spot" : "spots"} left. Tap a name to see their profile, mutual friends and communities first.` : "Your klique is full. To let more people in, raise its size (Edit) or remove someone."}</p>
        </div>
        {crew.requests.length > 0 && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" loading={busy === "all-no"} onClick={() => onAll(false)}>
              Decline all
            </Button>
            <Button size="sm" variant="primary" disabled={!room} loading={busy === "all-ok"} onClick={() => onAll(true)}>
              {!room ? "Klique is full" : crew.requests.length <= room ? `Accept all ${crew.requests.length}` : `Accept the first ${room}`}
            </Button>
          </div>
        )}
      </header>
      {crew.requests.length > 6 && (
        <div className="mb-3 max-w-sm">
          <TextField label="Find someone" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or @handle" />
        </div>
      )}
      {crew.requests.length === 0 ? (
        <div className="rounded-card border border-dashed border-line p-8 text-center">
          <p className="text-sm text-ink-muted">Nobody is waiting. New requests show up here by themselves.</p>
          <Button size="sm" className="mt-3" onClick={onBack}>
            Back to the klique
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {list.map((r) => (
            <li key={r.user.id} className="flex items-center gap-3 px-4 py-3">
              <ProfileTrigger handle={r.user.handle} className="shrink-0">
                <Avatar name={r.user.displayName} src={r.user.avatarUrl} size={38} frame={r.user.avatarFrame} />
              </ProfileTrigger>
              <div className="min-w-0 flex-1">
                <ProfileTrigger handle={r.user.handle} className="block truncate text-left text-sm font-semibold hover:underline">
                  {r.user.displayName}
                </ProfileTrigger>
                <p className="truncate text-xs text-ink-muted">
                  {r.message ? `"${r.message}"` : `@${r.user.handle}`}
                  {now ? ` · ${relativeStamp(r.createdAt, now)}` : ""}
                </p>
              </div>
              <Button size="sm" variant="primary" disabled={!room} loading={busy === `ok:${r.user.id}`} onClick={() => onDecide(r.user.id, r.user.displayName, true)}>
                Accept
              </Button>
              <button type="button" aria-label={`Decline ${r.user.displayName}`} title="Decline" disabled={busy === `no:${r.user.id}`} onClick={() => onDecide(r.user.id, r.user.displayName, false)} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink">
                <Icon name="x" size={15} />
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="py-6 text-center text-sm text-ink-muted">Nobody matches that.</li>}
        </ul>
      )}
    </div>
  );
}

/**
 * Join (or ask to join) the community or group a crew belongs to, right from the crew. The crew page reloads
 * itself afterwards (SpaceService tells the app memberships changed), and its own Join button appears.
 */
function JoinSpaceButton({ space, crewOpen, onJoined }: { space: NonNullable<CrewDTO["viewer"]["joinSpace"]>; crewOpen: boolean; /** straight on to the klique */ onJoined: () => Promise<void> }) {
  const toast = useToast();
  const router = useRouter();
  const { requireAuth } = useAuth();
  const [busy, setBusy] = useState(false);
  if (space.requested)
    return (
      <Button size="sm" disabled>
        <Icon name="clock" size={14} /> Asked to join {space.name}
      </Button>
    );
  async function go() {
    if (!requireAuth()) return;
    setBusy(true);
    try {
      const res = await SpaceService.join(space.slug, space.sub ?? undefined);
      if (res.data.status === "joined" || res.data.status === "already_member") await onJoined();
      else toast(res.data.message, "success");
    } catch (e) {
      toast(errorMessage(e), "error");
      // entry questions are answered on the community's page
      if (isApiError(e) && e.status === 400 && !space.sub) router.push(`/communities/${space.slug}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size="sm" variant="primary" loading={busy} onClick={() => void go()}>
      {space.ask ? `Ask to join ${space.name}` : `Join ${space.name} & ${crewOpen ? "join klique" : "ask to join klique"}`}
    </Button>
  );
}

function AskModal({ crew, onClose, onDone }: { crew: CrewDTO; onClose: () => void; onDone: (c: CrewDTO) => void }) {
  const toast = useToast();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    try {
      onDone((await CrewService.join(crew.id, message.trim())).data);
      toast("Request sent", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Ask to join ${crew.title}`} description={`${crew.host.displayName} accepts each person. Say hi so they know who you are.`} size="sm">
      <div className="space-y-4">
        <TextArea label="Message (optional)" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={200} counter={200} placeholder="e.g. Hey! Coming from Sabo, first time at this one." />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void send()}>
            Send request
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function EditCrewModal({ crew, onClose, onSaved }: { crew: CrewDTO; onClose: () => void; onSaved: (c: CrewDTO) => void }) {
  const toast = useToast();
  // the meetup's time as it reads in its own zone
  const start = wallInputs(crew.meetupAt, crew.timeZone);
  const [title, setTitle] = useState(crew.title);
  const [coverImage, setCoverImage] = useState(crew.coverImage ?? "");
  const [area, setArea] = useState(crew.area);
  const [meetupPoint, setMeetupPoint] = useState(crew.meetupPoint ?? "");
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [note, setNote] = useState(crew.note);
  const [joinMode, setJoinMode] = useState<CrewJoinMode>(crew.joinMode);
  const { user } = useAuth();
  const [who, setWho] = useState<AudienceValue>({ spots: String(crew.maxMembers - 1), audience: crew.audience, womenSpots: String(crew.womenSpots), menSpots: String(crew.menSpots) });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const bad = checkAudience(who);
    if (Math.round(Number(who.spots)) + 1 < crew.memberCount) bad.maxMembers = `${crew.memberCount} people are in already (you included), so keep at least ${crew.memberCount - 1} ${crew.memberCount - 1 === 1 ? "spot" : "spots"}.`;
    if (Object.keys(bad).length) {
      setErrors(bad);
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const meetupAt = fromWall(date, time, crew.timeZone);
      const res = await CrewService.update(crew.id, {
        title: title.trim(),
        ...(coverImage && coverImage !== crew.coverImage ? { coverImage } : {}),
        area: area.trim(),
        meetupPoint: meetupPoint.trim(),
        ...(meetupAt !== new Date(crew.meetupAt).toISOString() ? { meetupAt, timeZone: crew.timeZone } : {}),
        note: note.trim(),
        joinMode,
        ...audienceInput(who),
      });
      toast("Klique updated", "success");
      onSaved(res.data);
    } catch (err) {
      if (isApiError(err) && err.errors) setErrors(err.errors);
      toast(errorMessage(err), "error");
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit klique" description="Everyone in the klique is told if the meetup point or time changes.">
      <form onSubmit={save} className="space-y-4" noValidate>
        <ImageField kind="photo" label="Cover picture" value={coverImage} onChange={setCoverImage} error={errors.coverImage} required reposition={{ aspect: 4 / 5 }} />
        <TextField label="What's the plan?" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} error={errors.title} />
        <TextField label="Area" value={area} onChange={(e) => setArea(e.target.value)} maxLength={40} error={errors.area} />
        <TextField label="Meetup point" value={meetupPoint} onChange={(e) => setMeetupPoint(e.target.value)} maxLength={120} error={errors.meetupPoint} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Meetup date" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.meetupAt} />
          <TextField label="Meetup time" type="time" value={time} onChange={(e) => setTime(e.target.value)} hint={`${zoneCity(crew.timeZone)} time (${zoneLabel(crew.timeZone)})`} />
        </div>
        <TextArea label="Note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} counter={300} />
        <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium">How people get in</span>
            <select value={joinMode} onChange={(e) => setJoinMode(e.target.value as CrewJoinMode)} className="h-11 w-full rounded-control border border-line bg-raised px-3 text-sm">
              <option value="approval">Ask to join</option>
              <option value="open">Open</option>
            </select>
          </label>
        <AudienceFields value={who} onChange={setWho} canWomen={user?.gender === "woman"} canMen={user?.gender === "man"} errors={errors} minSpots={Math.max(1, crew.memberCount - 1)} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
