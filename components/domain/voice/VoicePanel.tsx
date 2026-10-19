"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Participant, Room } from "livekit-client";
import { errorMessage } from "@/app/ApiCore";
import { ChannelService, type SpaceRef } from "@/app/services/ChannelService";
import { useAuth } from "@/components/providers/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { useNow } from "@/lib/hooks/useApi";
import type { ChannelDTO } from "@/lib/types";

type Phase = "idle" | "connecting" | "live" | "error";

/** What the right-hand panel needs to know about the call. */
export interface VoiceSnapshot {
  phase: Phase;
  people: Person[];
  startedAt: number | null;
  reconnecting: boolean;
}

export interface Person {
  id: string;
  name: string;
  avatarUrl: string | null;
  speaking: boolean;
  muted: boolean;
  me: boolean;
}

const avatarOf = (p: Participant): string | null => {
  try {
    return (JSON.parse(p.metadata ?? "{}") as { avatarUrl?: string | null }).avatarUrl ?? null;
  } catch {
    return null;
  }
};

/**
 * A voice channel: join, talk, mute, leave. Audio goes through LiveKit (the page loads its client only when
 * you press Join). Leaving the page, or switching channel, hangs up.
 */
export function VoicePanel({ space, channel, isMember, gate, onState }: { space: SpaceRef; channel: ChannelDTO; isMember: boolean; gate: ReactNode; onState?: (s: VoiceSnapshot | null) => void }) {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [muted, setMuted] = useState(false);
  const [deaf, setDeaf] = useState(false);
  const [listenOnly, setListenOnly] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const room = useRef<Room | null>(null);
  const sink = useRef<HTMLDivElement>(null);
  const deafRef = useRef(false);

  const refresh = useCallback(() => {
    const r = room.current;
    if (!r) return;
    const toPerson = (p: Participant, me: boolean): Person => ({ id: p.identity, name: p.name || "Someone", avatarUrl: avatarOf(p), speaking: p.isSpeaking, muted: !p.isMicrophoneEnabled, me });
    setPeople([toPerson(r.localParticipant, true), ...Array.from(r.remoteParticipants.values()).map((p) => toPerson(p, false))]);
  }, []);

  const hangUp = useCallback(async () => {
    const r = room.current;
    room.current = null;
    if (r) await r.disconnect();
    if (sink.current) sink.current.replaceChildren();
    setPeople([]);
    setPhase("idle");
    setStartedAt(null);
    setReconnecting(false);
    setMuted(false);
    setDeaf(false);
    deafRef.current = false;
  }, []);

  // hang up when leaving this channel or page
  useEffect(
    () => () => {
      const r = room.current;
      room.current = null;
      void r?.disconnect();
    },
    [],
  );

  async function join() {
    setPhase("connecting");
    setError(null);
    setListenOnly(false);
    try {
      const { data } = await ChannelService.joinVoice(space, channel.slug);
      const lk = await import("livekit-client");
      const r = new lk.Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      room.current = r;
      r.on(lk.RoomEvent.ParticipantConnected, refresh)
        .on(lk.RoomEvent.ParticipantDisconnected, refresh)
        .on(lk.RoomEvent.ActiveSpeakersChanged, refresh)
        .on(lk.RoomEvent.TrackMuted, refresh)
        .on(lk.RoomEvent.TrackUnmuted, refresh)
        .on(lk.RoomEvent.LocalTrackPublished, refresh)
        .on(lk.RoomEvent.TrackSubscribed, (track) => {
          if (track.kind !== lk.Track.Kind.Audio) return;
          const el = track.attach();
          el.muted = deafRef.current;
          sink.current?.appendChild(el);
          refresh();
        })
        .on(lk.RoomEvent.TrackUnsubscribed, (track) => {
          track.detach().forEach((el) => el.remove());
          refresh();
        })
        .on(lk.RoomEvent.Reconnecting, () => setReconnecting(true))
        .on(lk.RoomEvent.Reconnected, () => setReconnecting(false))
        .on(lk.RoomEvent.Disconnected, () => {
          if (room.current === r) void hangUp();
        });
      await r.connect(data.url, data.token);
      try {
        await r.localParticipant.setMicrophoneEnabled(true);
      } catch {
        setListenOnly(true); // microphone blocked or missing: you can still listen
      }
      // browsers may block audio until a click: this join was one, but be explicit
      await r.startAudio().catch(() => undefined);
      setPhase("live");
      setStartedAt(Date.now());
      refresh();
    } catch (e) {
      const r = room.current;
      room.current = null;
      void r?.disconnect();
      setError(errorMessage(e, "Couldn't join the voice channel."));
      setPhase("error");
    }
  }

  async function toggleMute() {
    const r = room.current;
    if (!r) return;
    const next = !muted;
    try {
      await r.localParticipant.setMicrophoneEnabled(!next);
      setMuted(next);
      setListenOnly(false);
      refresh();
    } catch {
      setListenOnly(true);
    }
  }

  function toggleDeaf() {
    const next = !deaf;
    deafRef.current = next;
    setDeaf(next);
    sink.current?.querySelectorAll("audio").forEach((a) => (a.muted = next));
  }

  // keep the right-hand panel in step with the call
  useEffect(() => {
    onState?.({ phase, people, startedAt, reconnecting });
  }, [onState, phase, people, startedAt, reconnecting]);
  useEffect(() => () => onState?.(null), [onState]);

  const live = phase === "live";
  const bar = "border-t border-line bg-canvas px-4 py-3 sm:px-6";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={sink} className="hidden" aria-hidden="true" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <span className="mb-4 inline-flex size-14 items-center justify-center rounded-full bg-raised text-accent-text">
            <Icon name="mic" size={26} />
          </span>
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">{channel.name}</h2>
          <p className="mt-1 text-sm text-ink-muted">{channel.topic || "A voice channel. Join to talk with everyone who's here."}</p>

          {live ? (
            <>
              <p className="eyebrow mt-8 mb-3" role="status">
                {people.length} in voice{reconnecting ? " · reconnecting…" : ""}
              </p>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {people.map((p) => (
                  <li key={p.id} className={cx("flex flex-col items-center gap-2 rounded-card border bg-surface px-3 py-5 text-center transition", p.speaking ? "border-accent shadow-[0_0_0_2px_var(--accent)]" : "border-line")}>
                    <span className="relative">
                      <Avatar name={p.name} src={p.avatarUrl} size={64} />
                      {p.muted && (
                        <span className="absolute -right-1 -bottom-1 inline-flex size-6 items-center justify-center rounded-full border-2 border-surface bg-danger text-white" title="Muted">
                          <Icon name="micoff" size={12} />
                        </span>
                      )}
                    </span>
                    <span className="max-w-full truncate text-sm font-semibold">
                      {p.name}
                      {p.me ? " (you)" : ""}
                    </span>
                  </li>
                ))}
              </ul>
              {listenOnly && <p className="mt-4 text-sm text-ink-muted">Your microphone isn&apos;t available, so you can listen but not speak. Allow microphone access in your browser and press the mic button.</p>}
            </>
          ) : (
            <div className="mt-8 rounded-card border border-dashed border-line px-6 py-10 text-center">
              {phase === "error" ? (
                <p role="alert" className="mx-auto mb-5 max-w-md text-sm text-danger">
                  {error}
                </p>
              ) : (
                <p className="mx-auto mb-5 max-w-md text-sm text-ink-muted">You&apos;ll hear everyone in the channel, and they&apos;ll hear you. Your browser will ask to use the microphone.</p>
              )}
              {user && isMember ? (
                <Button variant="primary" size="lg" onClick={() => void join()} loading={phase === "connecting"}>
                  <Icon name="mic" size={17} /> {phase === "error" ? "Try again" : "Join voice"}
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className={cx(bar, "flex items-center justify-center gap-3")}>
        {!user || !isMember ? (
          <div className="flex w-full items-center justify-between gap-3">{user ? gate : <p className="text-sm text-ink-muted">Sign in to join voice.</p>}</div>
        ) : live ? (
          <>
            <button type="button" onClick={() => void toggleMute()} aria-pressed={muted} aria-label={muted ? "Unmute microphone" : "Mute microphone"} className={cx("inline-flex size-12 items-center justify-center rounded-full border transition", muted ? "border-danger bg-danger/15 text-danger" : "border-line bg-surface text-ink hover:bg-raised")}>
              <Icon name={muted ? "micoff" : "mic"} size={20} />
            </button>
            <button type="button" onClick={toggleDeaf} aria-pressed={deaf} aria-label={deaf ? "Hear everyone again" : "Stop hearing everyone"} className={cx("inline-flex h-12 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition", deaf ? "border-danger bg-danger/15 text-danger" : "border-line bg-surface text-ink hover:bg-raised")}>
              {deaf ? "Deafened" : "Deafen"}
            </button>
            <button type="button" onClick={() => void hangUp()} aria-label="Leave voice channel" className="inline-flex h-12 items-center gap-2 rounded-full bg-danger px-5 text-sm font-semibold text-white transition hover:opacity-90">
              <Icon name="phoneoff" size={18} /> Leave
            </button>
          </>
        ) : (
          <p className="text-sm text-ink-muted">Not connected</p>
        )}
      </div>
    </div>
  );
}

const clock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = String(Math.floor((total % 3600) / 60)).padStart(h ? 2 : 1, "0");
  const sec = String(total % 60).padStart(2, "0");
  return h ? `${h}:${m}:${sec}` : `${m}:${sec}`;
};

/** The voice channel's right-hand panel, like Discord's: call info on top, then who is in the call. */
export function VoiceSide({ channel, communityName, snapshot }: { channel: ChannelDTO; communityName: string; snapshot: VoiceSnapshot | null }) {
  const now = useNow(1000);
  const live = snapshot?.phase === "live";
  const people = live ? snapshot.people : [];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-line px-4">
        <Icon name="mic" size={17} className="text-ink-muted" />
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Voice info</h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <dl className="space-y-3 rounded-card border border-line bg-surface p-4 text-sm">
          <div>
            <dt className="eyebrow">Channel</dt>
            <dd className="mt-0.5 font-semibold">{channel.name}</dd>
          </div>
          {channel.topic && (
            <div>
              <dt className="eyebrow">About</dt>
              <dd className="mt-0.5 text-ink-muted">{channel.topic}</dd>
            </div>
          )}
          <div>
            <dt className="eyebrow">Community</dt>
            <dd className="mt-0.5">{communityName}</dd>
          </div>
          <div>
            <dt className="eyebrow">Status</dt>
            <dd className="mt-0.5 flex items-center gap-2">
              <span className={cx("size-2 rounded-full", live ? "bg-accent" : snapshot?.phase === "connecting" ? "bg-ink-muted" : "bg-line")} aria-hidden="true" />
              {live ? (snapshot.reconnecting ? "Reconnecting…" : "Connected") : snapshot?.phase === "connecting" ? "Connecting…" : "Not connected"}
              {live && snapshot.startedAt && now && <span className="ml-auto font-mono text-xs text-ink-muted">{clock(+now - snapshot.startedAt)}</span>}
            </dd>
          </div>
        </dl>

        <h3 className="eyebrow mt-6 mb-2" role="status">
          In voice — {people.length}
        </h3>
        {people.length === 0 ? (
          <p className="text-sm text-ink-muted">{live ? "Just you so far." : "Join the channel to see who is here."}</p>
        ) : (
          <ul className="space-y-1">
            {people.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5 rounded-control px-2 py-1.5">
                <span className={cx("rounded-full", p.speaking && "shadow-[0_0_0_2px_var(--accent)]")}>
                  <Avatar name={p.name} src={p.avatarUrl} size={32} />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {p.name}
                  {p.me ? " (you)" : ""}
                </span>
                {p.muted && <Icon name="micoff" size={15} className="shrink-0 text-danger" aria-label="Muted" />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
