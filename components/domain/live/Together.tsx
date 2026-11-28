"use client";

import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { LiveService } from "@/app/services/LiveService";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { cx } from "@/components/ui/cx";
import type { CommunityDTO, LiveDTO, UserBrief } from "@/lib/types";

/**
 * Live together on the website: the host's stream and their guests' side by side in the player box, one chat. Each
 * box is Klique's own player page (same site), so one box has sound at a time: click another to hear it.
 */
export interface TogetherPerson {
  id: string;
  user: UserBrief;
  provider: "twitch" | "youtube";
  channel: string;
  status: "live" | "waiting";
  host: boolean;
}

/** The host and the guests streaming with them, the big box first (the one the host picked, else the host). */
export function togetherPeople(live: LiveDTO): TogetherPerson[] {
  const host: TogetherPerson = { id: live.host.id, user: live.host, provider: live.provider, channel: live.channel, status: "live", host: true };
  const guests: TogetherPerson[] = (live.guests ?? []).flatMap((g) => ((g.status === "live" || g.status === "waiting") && g.provider && g.channel ? [{ id: g.user.id, user: g.user, provider: g.provider, channel: g.channel, status: g.status, host: false }] : []));
  const all = [host, ...guests];
  const main = all.find((p) => p.id === live.mainId) ?? host;
  return [main, ...all.filter((p) => p !== main)];
}

type PlayerWindow = Window & { __mute?: () => void; __unmute?: () => void };

/** The boxes: 2 side by side; 3 or 4 as the big one on the left and the rest down the right. */
export function TogetherPlayers({ people, onStarted, onRemove }: { people: TogetherPerson[]; onStarted?: () => void; /** the host and moderators: take a guest off */ onRemove?: (p: TogetherPerson) => void }) {
  // browsers start video by itself only without sound: nobody's heard until a click
  const [hear, setHear] = useState<string | null>(null);
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  useEffect(() => {
    for (const [id, f] of frames.current) {
      try {
        const w = f.contentWindow as PlayerWindow | null;
        if (id === hear) w?.__unmute?.();
        else w?.__mute?.();
      } catch {
        /* not loaded yet */
      }
    }
  }, [hear]);
  const started = useRef(false);
  const n = people.length;
  return (
    <div className={cx("grid size-full gap-0.5 bg-black", n === 2 ? "grid-cols-2" : "grid-cols-[2fr_1fr]", n === 3 && "grid-rows-2", n === 4 && "grid-rows-3")}>
      {people.map((p, i) => (
        <div key={p.id} className={cx("group relative min-h-0 overflow-hidden bg-black", i === 0 && n === 3 && "row-span-2", i === 0 && n === 4 && "row-span-3")}>
          {p.status === "live" ? (
            <iframe
              ref={(el) => {
                if (el) frames.current.set(p.id, el);
                else frames.current.delete(p.id);
              }}
              src={`/embed/live?p=${p.provider}&c=${encodeURIComponent(p.channel)}&m=1`}
              title={`${p.user.displayName}’s stream`}
              allow="autoplay; encrypted-media; picture-in-picture"
              className="size-full border-0 bg-black"
              onLoad={(e) => {
                // an upright phone stream covers its box
                try {
                  e.currentTarget.contentDocument?.body.classList.add("fill");
                } catch {
                  /* fine */
                }
                if (!started.current) window.setTimeout(() => ((started.current = true), onStarted?.()), 1500);
              }}
            />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-2 text-[13px] text-white/70">
              <span className="inline-block size-6 animate-spin rounded-full border-2 border-white/25 border-t-white" />
              {p.user.displayName} is reconnecting…
            </div>
          )}
          {/* not the one you hear: a click here switches the sound to it (the one you hear takes clicks itself) */}
          {hear !== p.id && <button type="button" aria-label={`Hear ${p.user.displayName}`} onClick={() => setHear(p.id)} className="absolute inset-0" />}
          {hear === p.id && <span aria-hidden className="pointer-events-none absolute inset-0 border-2 border-white" />}
          <span className="pointer-events-none absolute bottom-2 left-2 inline-flex max-w-[80%] items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[12px] font-semibold text-white">
            <span className="truncate">{p.user.displayName}</span>
            {p.host && <span className="text-[10px] font-extrabold text-[#F5B83D]">HOST</span>}
          </span>
          <span className="pointer-events-none absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-full bg-black/60 text-white">
            <Icon name={hear === p.id ? "volume" : "volumeoff"} size={14} />
          </span>
          {i === 0 && hear === null && <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-black/70 px-3 py-1 text-[12px] font-semibold text-white">Click a box for sound</span>}
          {onRemove && !p.host && (
            <button type="button" onClick={() => onRemove(p)} className="absolute top-2 right-11 hidden rounded-full bg-black/70 px-2.5 py-1 text-[12px] font-semibold text-white group-hover:block focus:block">
              Remove
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** The host's "Go live together": who's in it (and asked), and members to ask. */
export function InviteDialog({ c, live, onClose, onChange }: { c: Pick<CommunityDTO, "slug" | "name">; live: LiveDTO; onClose: () => void; onChange: (l: LiveDTO) => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<{ user: UserBrief; can: boolean; note: string }[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const guests = live.guests ?? [];
  useEffect(() => {
    let dead = false;
    const t = window.setTimeout(() => void LiveService.togetherPeople(c.slug, q).then((r) => !dead && setRows(r.data), () => !dead && setRows([])), q ? 300 : 0);
    return () => {
      dead = true;
      window.clearTimeout(t);
    };
  }, [c.slug, q, guests.length]);
  const act = async (action: "invite" | "cancel" | "remove", userId: string) => {
    setBusy(userId);
    try {
      onChange((await LiveService.together(c.slug, { action, userId })).data);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };
  const full = guests.length >= 3;
  return (
    <Modal open onClose={onClose} title="Go live together" description={`Up to 3 people from ${c.name} can join you. Gifts still come to you.`} size="md">
      <div className="space-y-4">
        {/* you, the guests, and the places left */}
        <ul className="flex gap-4">
          {[{ id: "me", user: live.host, label: "You", on: true }, ...guests.map((g) => ({ id: g.user.id, user: g.user, label: g.user.displayName, on: g.status === "live" })), ...Array.from({ length: Math.max(0, 3 - guests.length) }, (_, i) => ({ id: `empty-${i}`, user: null as UserBrief | null, label: "Empty", on: false }))].map((x) => (
            <li key={x.id} className="flex w-14 flex-col items-center gap-1">
              <span className={cx("flex size-12 items-center justify-center rounded-full border-2", x.user && x.on ? "border-danger" : "border-dashed border-line")}>
                {x.user ? <span className={x.on ? "" : "opacity-50"}><Avatar name={x.user.displayName} src={x.user.avatarUrl} size={40} /></span> : <Icon name="plus" size={16} className="text-ink-muted" />}
              </span>
              <span className={cx("w-full truncate text-center text-[12px]", x.user ? "text-ink" : "text-ink-muted")}>{x.label}</span>
            </li>
          ))}
        </ul>
        <TextField label="Search members" value={q} onChange={(e) => setQ(e.target.value)} maxLength={40} placeholder="Name or @handle" />
        {guests.length > 0 && (
          <ul className="space-y-1">
            {guests.map((g) => (
              <li key={g.user.id} className="flex items-center gap-3 py-1.5">
                <Avatar name={g.user.displayName} src={g.user.avatarUrl} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{g.user.displayName}</span>
                  <span className="block text-[13px] text-ink-muted">{g.status === "invited" ? "Asked · waiting for them" : g.status === "waiting" ? "Starting their camera…" : "Live with you"}</span>
                </span>
                <Button size="sm" loading={busy === g.user.id} onClick={() => void act(g.status === "invited" ? "cancel" : "remove", g.user.id)}>
                  {g.status === "invited" ? "Cancel" : "Remove"}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {/* scrolls, without a scrollbar */}
        <ul className="max-h-[340px] space-y-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {rows === null ? (
            <li className="py-3 text-center text-[13px] text-ink-muted">Loading…</li>
          ) : rows.length === 0 ? (
            <li className="py-3 text-center text-[13px] text-ink-muted">{q ? "Nobody by that name here." : "No members to ask yet."}</li>
          ) : (
            rows.map((r) => (
              <li key={r.user.id} className={cx("flex items-center gap-3 py-1.5", !r.can && "opacity-55")}>
                <Avatar name={r.user.displayName} src={r.user.avatarUrl} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{r.user.displayName}</span>
                  <span className="block truncate text-[13px] text-ink-muted">{r.note}</span>
                </span>
                {r.can && (
                  <Button size="sm" variant="primary" disabled={full} loading={busy === r.user.id} onClick={() => void act("invite", r.user.id)}>
                    Invite
                  </Button>
                )}
              </li>
            ))
          )}
        </ul>
      </div>
    </Modal>
  );
}

/**
 * "Tobi asked you to go live with them", on the website: join with a YouTube live link you started yourself (the Klique
 * app streams your camera by itself), or Not now. An invite lasts 2 minutes.
 */
export function InviteBanner({ c, live, onChanged }: { c: Pick<CommunityDTO, "slug" | "name">; live: LiveDTO; onChanged: () => void }) {
  const toast = useToast();
  const [now, setNow] = useState(() => Date.now());
  const [joining, setJoining] = useState(false);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const left = live.invitedMe ? Math.max(0, Math.round((Date.parse(live.invitedMe) - now) / 1000)) : 0;
  if (gone || (!left && !joining)) return null;
  const no = async () => {
    setGone(true);
    await LiveService.together(c.slug, { action: "decline" }).catch(() => {});
    onChanged();
  };
  const join = async () => {
    setBusy(true);
    try {
      await LiveService.together(c.slug, { action: "join", provider: "youtube", link });
      toast(`You're live with ${live.host.displayName}`, "success");
      setGone(true);
      onChanged();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-3 py-2.5 sm:px-5">
      <Avatar name={live.host.displayName} src={live.host.avatarUrl} size={32} />
      <p className="min-w-0 flex-1 text-[13.5px]">
        <b>{live.host.displayName}</b> asked you to go live with them <span className="text-ink-muted">· {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} left</span>
      </p>
      <Button
        size="sm"
        variant="primary"
        loading={busy && !joining}
        onClick={async () => {
          // saying yes holds your place for a few minutes while you start the stream
          setBusy(true);
          try {
            await LiveService.together(c.slug, { action: "accept" });
            setJoining(true);
          } catch (e) {
            toast(errorMessage(e), "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        Join
      </Button>
      <Button size="sm" onClick={() => void no()}>
        Not now
      </Button>
      {joining && (
        <Modal open onClose={() => setJoining(false)} title={`Go live with ${live.host.displayName}`} description="Start the stream on YouTube first, then paste its link. On your phone, the Klique app streams your camera by itself." size="md">
          <div className="space-y-4">
            <TextField label="YouTube live link" value={link} onChange={(e) => setLink(e.target.value)} maxLength={300} placeholder="https://youtube.com/live/…" />
            <div className="flex justify-end gap-2">
              <Button onClick={() => setJoining(false)}>Cancel</Button>
              <Button variant="primary" disabled={!link.trim()} loading={busy} onClick={() => void join()}>
                <Icon name="live" size={15} /> Join the live
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
