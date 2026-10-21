"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { softNavigate } from "@/lib/nav";
import { errorMessage, isApiError } from "@/app/ApiCore";
import { CrewService } from "@/app/services/CrewService";
import { ConfirmModal, SpaceError } from "@/components/domain/space/parts";
import { ShareButton } from "@/components/domain/ShareButton";
import { useAuth } from "@/components/providers/AuthProvider";
import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { TextArea, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { cx } from "@/components/ui/cx";
import { formatDateLong, formatDateShort, formatTime, relativeStamp } from "@/lib/format";
import { useApi, useNow } from "@/lib/hooks/useApi";
import type { CrewDTO, CrewJoinMode, CrewMessageDTO } from "@/lib/types";
import { Faces, StandingTag, crewHref, fromLagos, lagosInputs } from "./parts";

/**
 * One crew: where and when to meet (members only), who's in, join / ask / leave, the host's requests, and the chat.
 * `embedded`: shown inside its community's workspace (the left panel lists your crews); `onChanged` lets that
 * panel refresh when you join, leave or call a crew off. On its own page, a crew that belongs to a community
 * moves into that community.
 */
export function CrewView({ id, embedded, onChanged }: { id: string; embedded?: boolean; onChanged?: () => void }) {
  const router = useRouter();
  const { data: crew, loading, error, status, reload, setData } = useApi(() => CrewService.get(id), [id], { key: `crew:${id}` });
  // someone asked, joined, left or was let in (you included): the page updates by itself
  useRealtimeEvent(
    () => {
      void reload();
      onChanged?.();
    },
    { filter: (e) => (e.type === "crew" && e.crewId === id && !e.chat) || (e.type === "notify" && e.ref === `crew:${id}`), debounceMs: 250 },
  );
  // without a live connection, look again every so often
  const { connected } = useRealtime();
  useEffect(() => {
    if (connected) return;
    const t = setInterval(() => document.visibilityState === "visible" && void reload(), 15_000);
    return () => clearInterval(t);
  }, [connected, reload]);
  const target = crew && !embedded && crew.space ? crewHref(crew) : null;
  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  if (loading || target) {
    return (
      <div className={cx("space-y-4", !embedded && "mx-auto max-w-3xl")} aria-busy="true">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (error || !crew) return <SpaceError status={status} message={error} onRetry={reload} backHref="/events" backLabel="Back to events" />;
  return (
    <Crew
      crew={crew}
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

function Crew({ crew, embedded, onChange, onGone, reload }: { crew: CrewDTO; embedded: boolean; onChange: (c: CrewDTO) => void; onGone?: () => void; reload: () => Promise<void> }) {
  const router = useRouter();
  const toast = useToast();
  const { requireAuth } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [callingOff, setCallingOff] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const v = crew.viewer;
  const isHost = v.standing === "host";
  const inCrew = v.standing === "host" || v.standing === "member";
  // back to this event's crews: in the community when there is one, else on the event page
  const backHref = crew.space ? `/communities/${crew.space.slug}?${crew.space.sub ? `g=${crew.space.sub}&` : ""}view=crews&e=${crew.event.id}` : `/events/${crew.event.id}#crews`;

  async function act(key: string, fn: () => Promise<{ data: CrewDTO }>, done?: string) {
    setBusy(key);
    try {
      onChange((await fn()).data);
      if (done) toast(done, "success");
    } catch (e) {
      toast(errorMessage(e), "error");
      void reload();
    } finally {
      setBusy(null);
    }
  }

  const join = () => {
    if (!requireAuth()) return;
    if (crew.joinMode === "approval") setAsking(true);
    else void act("join", () => CrewService.join(crew.id), "You're in the crew");
  };

  return (
    <div className={embedded ? undefined : "mx-auto max-w-3xl"}>
      <Link href={backHref} scroll={false} onClick={(e) => { if (embedded) { e.preventDefault(); softNavigate(backHref); } }} className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <Icon name="arrow-left" size={15} /> {embedded ? `Crews for ${crew.event.title}` : crew.event.title}
      </Link>

      <section className="rounded-card border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="eyebrow">Crew · {formatDateShort(crew.event.startsAt)}</p>
          <StandingTag standing={v.standing} />
        </div>
        <h1 className="mt-2 text-[clamp(1.5rem,3.5vw,2rem)] leading-tight font-bold tracking-[-0.03em]">From {crew.area}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          To{" "}
          <Link href={`/events/${crew.event.id}`} className="font-medium text-accent-text hover:underline">
            {crew.event.title}
          </Link>{" "}
          · hosted by{" "}
          <ProfileTrigger handle={crew.host.handle} className="font-medium text-ink hover:underline">
            {crew.host.displayName}
          </ProfileTrigger>
        </p>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="flex gap-3 rounded-control border border-line bg-raised p-3">
            <dt className="mt-0.5 text-ink-muted">
              <Icon name="clock" />
              <span className="sr-only">Meetup time</span>
            </dt>
            <dd>
              <span className="block text-sm font-semibold">{formatTime(crew.meetupAt)}</span>
              <span className="block text-xs text-ink-muted">{formatDateLong(crew.meetupAt)}</span>
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
              <Button size="sm" onClick={() => void act("leave", () => CrewService.leave(crew.id), "You left the crew")} loading={busy === "leave"}>
                Leave crew
              </Button>
            ) : v.standing === "pending" ? (
              <Button size="sm" onClick={() => void act("leave", () => CrewService.leave(crew.id), "Request taken back")} loading={busy === "leave"}>
                Take back request
              </Button>
            ) : v.canJoin ? (
              <Button size="sm" variant="primary" onClick={join} loading={busy === "join"}>
                {crew.joinMode === "open" ? "Join crew" : "Ask to join"}
              </Button>
            ) : (
              v.joinBlockedReason && <p className="text-xs text-ink-muted">{v.joinBlockedReason}</p>
            )}
            <ShareButton path={crewHref(crew)} text={`Crew from ${crew.area} to ${crew.event.title}`} />
          </div>
        </div>
        {v.standing === "pending" && <p className="mt-3 text-sm text-ink-muted">You asked to join. The host will let you in, and you&apos;ll get a notification.</p>}
      </section>

      {/* a compact bar however many ask; the list itself opens in a panel */}
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
          <Button size="sm" variant="primary" onClick={() => setReviewing(true)}>
            Review
          </Button>
        </section>
      )}
      {reviewing && isHost && (
        <RequestsModal
          crew={crew}
          busy={busy}
          onClose={() => setReviewing(false)}
          onDecide={(userId, name, accept) => void act(`${accept ? "ok" : "no"}:${userId}`, () => CrewService.decide(crew.id, userId, accept), accept ? `${name} is in` : undefined)}
          onAll={(accept) => void act(accept ? "all-ok" : "all-no", () => CrewService.decideAll(crew.id, accept), accept ? "Accepted" : "Declined")}
        />
      )}

      <div className={cx("mt-5 grid gap-5", inCrew && "lg:grid-cols-[16rem_1fr]")}>
        <section aria-label="Who's in">
          <h2 className="mb-2 text-base font-semibold">Who&apos;s in · {crew.memberCount}</h2>
          <ul className="space-y-1">
            {crew.members.map((m, i) => (
              <li key={m.id} className="flex items-center gap-2.5 rounded-control px-1 py-1.5">
                <ProfileTrigger handle={m.handle} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                  <Avatar name={m.displayName} src={m.avatarUrl} size={30} />
                  <span className="truncate text-sm font-medium">{m.displayName}</span>
                  {i === 0 && <span className="rounded bg-accent/15 px-1.5 text-[10px] font-bold tracking-wide text-accent-text uppercase">Host</span>}
                </ProfileTrigger>
                {isHost && i > 0 && (
                  <button
                    type="button"
                    aria-label={`Remove ${m.displayName}`}
                    title="Remove from crew"
                    onClick={() => void act(`rm:${m.id}`, () => CrewService.removeMember(crew.id, m.id), `${m.displayName} was removed`)}
                    className="inline-flex size-7 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink"
                  >
                    <Icon name="x" size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
        {inCrew && <CrewChat crewId={crew.id} />}
      </div>

      <p className="mt-6 flex items-center gap-2 text-xs text-ink-muted">
        <Icon name="clock" size={13} /> This crew and its chat disappear on {formatDateShort(crew.expiresAt)}. Meet in public, and tell someone where you&apos;re going.
      </p>

      {asking && <AskModal crew={crew} onClose={() => setAsking(false)} onDone={(c) => (setAsking(false), onChange(c))} />}
      {editing && <EditCrewModal crew={crew} onClose={() => setEditing(false)} onSaved={(c) => (setEditing(false), onChange(c))} />}
      <ConfirmModal
        open={callingOff}
        onClose={() => setCallingOff(false)}
        title="Call off this crew?"
        description="Everyone in it gets a notification, and the chat is deleted. They can join or start another crew."
        confirmLabel="Call off crew"
        onConfirm={async () => {
          await CrewService.remove(crew.id);
          toast("Crew called off", "success");
          onGone?.();
          if (embedded) softNavigate(backHref, { replace: true });
          else router.replace(backHref);
        }}
      />
    </div>
  );
}

/**
 * The host's queue of join requests, however long: searchable, scrolls inside the panel, oldest first, with
 * Accept / Decline per person and both for everyone at once. Closes itself when the queue is empty.
 */
function RequestsModal({ crew, busy, onClose, onDecide, onAll }: { crew: CrewDTO; busy: string | null; onClose: () => void; onDecide: (userId: string, name: string, accept: boolean) => void; onAll: (accept: boolean) => void }) {
  const [q, setQ] = useState("");
  const now = useNow();
  const needle = q.trim().toLowerCase().replace(/^@/, "");
  const list = needle ? crew.requests.filter((r) => r.user.displayName.toLowerCase().includes(needle) || r.user.handle.includes(needle)) : crew.requests;
  const room = Math.max(0, crew.maxMembers - crew.memberCount);
  useEffect(() => {
    if (!crew.requests.length) onClose();
  }, [crew.requests.length, onClose]);

  return (
    <Modal open onClose={onClose} title={`Asking to join · ${crew.requests.length}`} description={room ? `${room} ${room === 1 ? "spot" : "spots"} left. Tap a name to see their profile, mutual friends and communities first.` : "Your crew is full. To let more people in, raise the crew size (Edit) or remove someone."}>
      <div className="space-y-3">
        {crew.requests.length > 6 && <TextField label="Find someone" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or @handle" />}
        <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
          {list.map((r) => (
            <li key={r.user.id} className="flex items-center gap-3 rounded-control border border-line bg-raised/50 p-2.5">
              <ProfileTrigger handle={r.user.handle} className="shrink-0">
                <Avatar name={r.user.displayName} src={r.user.avatarUrl} size={34} />
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <Button size="sm" variant="ghost" loading={busy === "all-no"} onClick={() => onAll(false)}>
            Decline all
          </Button>
          <Button size="sm" variant="primary" disabled={!room} loading={busy === "all-ok"} onClick={() => onAll(true)}>
            {!room ? "Crew is full" : crew.requests.length <= room ? `Accept all ${crew.requests.length}` : `Accept the first ${room}`}
          </Button>
        </div>
      </div>
    </Modal>
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
    <Modal open onClose={onClose} title={`Ask to join the crew from ${crew.area}`} description={`${crew.host.displayName} accepts each person. Say hi so they know who you are.`} size="sm">
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
  const start = lagosInputs(crew.meetupAt);
  const [area, setArea] = useState(crew.area);
  const [meetupPoint, setMeetupPoint] = useState(crew.meetupPoint ?? "");
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [note, setNote] = useState(crew.note);
  const [joinMode, setJoinMode] = useState<CrewJoinMode>(crew.joinMode);
  const [maxMembers, setMaxMembers] = useState(String(crew.maxMembers));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const meetupAt = fromLagos(date, time);
      const res = await CrewService.update(crew.id, {
        area: area.trim(),
        meetupPoint: meetupPoint.trim(),
        ...(meetupAt !== new Date(crew.meetupAt).toISOString() ? { meetupAt } : {}),
        note: note.trim(),
        joinMode,
        maxMembers: Math.round(Number(maxMembers)),
      });
      toast("Crew updated", "success");
      onSaved(res.data);
    } catch (err) {
      if (isApiError(err) && err.errors) setErrors(err.errors);
      toast(errorMessage(err), "error");
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit crew" description="Everyone in the crew is told if the meetup point or time changes.">
      <form onSubmit={save} className="space-y-4" noValidate>
        <TextField label="Coming from" value={area} onChange={(e) => setArea(e.target.value)} maxLength={40} error={errors.area} />
        <TextField label="Meetup point" value={meetupPoint} onChange={(e) => setMeetupPoint(e.target.value)} maxLength={120} error={errors.meetupPoint} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Meetup date" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.meetupAt} />
          <TextField label="Meetup time" type="time" value={time} onChange={(e) => setTime(e.target.value)} hint="Lagos time (WAT)" />
        </div>
        <TextArea label="Note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} counter={300} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium">Who can join</span>
            <select value={joinMode} onChange={(e) => setJoinMode(e.target.value as CrewJoinMode)} className="h-11 w-full rounded-control border border-line bg-raised px-3 text-sm">
              <option value="approval">Ask to join</option>
              <option value="open">Open</option>
            </select>
          </label>
          <TextField label="Crew size" type="number" min={Math.max(2, crew.memberCount)} max={100} value={maxMembers} onChange={(e) => setMaxMembers(e.target.value)} error={errors.maxMembers} />
        </div>
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

/** The crew's own chat: simple, text only, refreshed every few seconds while you look at it. */
function CrewChat({ crewId }: { crewId: string }) {
  const toast = useToast();
  const { data, setData } = useApi(() => CrewService.messages(crewId), [crewId], { key: `crew-chat:${crewId}` });
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const messages = data ?? [];
  const lastId = messages[messages.length - 1]?.id;

  // new messages: instantly when realtime is on (a ping per message), and a slower check as a safety net
  const fetchNew = useCallback(async () => {
    try {
      const res = await CrewService.messages(crewId, lastId);
      if (res.data.length) setData((prev) => [...(prev ?? []), ...res.data.filter((m) => !(prev ?? []).some((p) => p.id === m.id))]);
    } catch {
      /* next time */
    }
  }, [crewId, lastId, setData]);
  const { connected } = useRealtime();
  useRealtimeEvent(() => void fetchNew(), { filter: (e) => e.type === "crew" && e.crewId === crewId && !!e.chat });
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && void fetchNew(), connected ? 30_000 : 4000);
    return () => clearInterval(t);
  }, [fetchNew, connected]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText("");
    try {
      const res = await CrewService.send(crewId, body);
      setData((prev) => [...(prev ?? []).filter((m) => m.id !== res.data.id), res.data]);
    } catch (e) {
      setText(body);
      toast(errorMessage(e), "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-label="Crew chat" className="flex min-h-0 flex-col rounded-card border border-line bg-surface">
      <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-semibold">
        <Icon name="message" size={15} /> Crew chat
      </h2>
      <div ref={listRef} className="h-80 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="pt-10 text-center text-sm text-ink-muted">Say hi and sort out the plan: who&apos;s bringing what, splitting a ride, running late.</p>
        ) : (
          messages.map((m: CrewMessageDTO) => (
            <div key={m.id} className={cx("flex gap-2.5", m.mine && "flex-row-reverse")}>
              <Avatar name={m.author.displayName} src={m.author.avatarUrl} size={28} />
              <div className={cx("max-w-[80%] rounded-2xl px-3 py-2", m.mine ? "bg-accent text-accent-ink" : "bg-raised")}>
                {!m.mine && <p className="text-[11px] font-semibold opacity-80">{m.author.displayName}</p>}
                <p className="text-sm break-words whitespace-pre-wrap">{m.body}</p>
                <p className="mt-0.5 text-right font-mono text-[10px] opacity-60">{formatTime(m.createdAt)}</p>
              </div>
            </div>
          ))
        )}
      </div>
      <form
        className="flex items-end gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label htmlFor="crew-msg" className="sr-only">
          Message the crew
        </label>
        <textarea
          id="crew-msg"
          rows={1}
          value={text}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Message the crew"
          style={{ fieldSizing: "content" } as React.CSSProperties}
          className="max-h-32 min-h-10 flex-1 resize-none rounded-[1.25rem] border border-line bg-raised px-4 py-2 text-sm focus:border-accent-text focus:outline-none"
        />
        <Button type="submit" variant="primary" size="sm" disabled={!text.trim()} aria-label="Send">
          <Icon name="send" size={15} />
        </Button>
      </form>
    </section>
  );
}
