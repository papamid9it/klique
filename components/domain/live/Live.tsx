"use client";

import { BrandButton, YOUTUBE, YouTubeLogo } from "./BrandButtons";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { errorMessage } from "@/app/ApiCore";
import { LiveService } from "@/app/services/LiveService";
import { ReportDialog } from "@/components/domain/ReportDialog";
import { LiveRoomChat } from "./LiveRoomChat";
import { LivePlayer, warmLivePlayer } from "./LivePlayer";
import { GiftButton } from "@/components/domain/gifts/Gifts";
import { useAuth } from "@/components/providers/AuthProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { cx } from "@/components/ui/cx";
import { useApi, useNow } from "@/lib/hooks/useApi";
import type { CommunityDTO, EventDTO, LiveDTO, LiveNowDTO } from "@/lib/types";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";

/**
 * Live in a community's left panel: a red LIVE row while someone streams (opens the player), "Go live" for the people
 * allowed to, and nothing for everyone else while nobody's live. Notifications link here with ?live=1.
 */
export function LiveRow({ c, onChanged }: { c: CommunityDTO; onChanged: () => void }) {
  const sp = useSearchParams();
  const [live, setLive] = useState<LiveDTO | null>(c.live ?? null);
  const [open, setOpen] = useState<"watch" | "go" | null>(null);
  useEffect(() => setLive(c.live ?? null), [c.live]);
  // from a "… is live" notification
  useEffect(() => {
    if (sp.get("live") === "1") setOpen(c.live?.status === "live" ? "watch" : c.canGoLive ? "go" : null);
  }, [sp, c.live?.status, c.canGoLive]);

  // someone's live: connect to the player now, so Watch starts faster
  useEffect(() => {
    if (live?.status === "live") warmLivePlayer(live.provider);
  }, [live?.status, live?.provider]);
  if (!live && !c.canGoLive) return null;
  const on = live?.status === "live";
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen(on ? "watch" : "go")}
        className={cx("flex h-10 w-full items-center gap-2.5 rounded-control px-2.5 text-[15px] font-medium transition hover:bg-raised/60", on ? "text-ink" : "text-ink-muted hover:text-ink")}
      >
        <Icon name="live" size={16} />
        <span className="min-w-0 flex-1 truncate text-left">{on ? live!.host.displayName : live ? "Starting…" : "Go live"}</span>
        {on && <span className="rounded-[5px] bg-danger px-1.5 py-px font-mono text-[11px] font-bold text-white">LIVE</span>}
      </button>
      {open === "watch" && live && <WatchModal c={c} live={live} onClose={() => setOpen(null)} onEnded={() => (setLive(null), setOpen(null), onChanged())} />}
      {open === "go" && <GoLiveModal c={c} live={live} onLive={setLive} onClose={() => setOpen(null)} onChanged={onChanged} />}
    </li>
  );
}

/**
 * Watching, like YouTube: the player with who's on under it, and the live chat beside it (under it on a narrow
 * screen). Full screen over the page; Escape or the arrow closes it.
 */
function WatchModal({ c, live, onClose, onEnded }: { c: Pick<CommunityDTO, "slug" | "name">; live: LiveDTO; onClose: () => void; onEnded: () => void }) {
  const { user } = useAuth();
  const [reporting, setReporting] = useState(false);
  const chat = useApi(() => LiveService.chat(c.slug), [c.slug, live.id], { key: `live-chat:${live.id}` });
  // "still watching" every 30 seconds: counts you, and shows how many are watching
  const [viewers, setViewers] = useState(live.viewers ?? 0);
  // counted (and "X joined" for everyone) only once the video really plays here, never while it's still loading
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (!started) return;
    let key: string | undefined;
    if (!user) {
      try {
        key = localStorage.getItem("klique-watch-key") ?? undefined;
        if (!key) localStorage.setItem("klique-watch-key", (key = crypto.randomUUID().replace(/-/g, "")));
      } catch {
        key = undefined;
      }
    }
    // the first check-in (opening it, or coming back to the tab) says so: "Amara joined" for everyone watching
    const ping = (first = false) => void LiveService.watching(c.slug, live.id, key, first).then((r) => setViewers(r.data.viewers), () => {});
    ping(true);
    const t = window.setInterval(() => document.visibilityState === "visible" && ping(), 20_000);
    // closing the player, or the tab going away: off the count at once
    const leave = () => void LiveService.left(c.slug, live.id, key).catch(() => {});
    const onHide = () => (document.visibilityState === "hidden" ? leave() : ping(true));
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", leave);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [c.slug, live.id, user, started]);
  // the page underneath stays put; Escape closes (unless a dialog on top of this is open)
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector("dialog[open]") && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = before;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={live.title || `${live.host.displayName} is live`} className="fixed inset-0 z-[60] flex flex-col bg-canvas lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-col overflow-y-auto lg:flex-1">
        <div className="flex h-14 shrink-0 items-center gap-2 px-2 sm:px-4">
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex size-10 items-center justify-center rounded-full hover:bg-raised">
            <Icon name="arrow-left" size={20} />
          </button>
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{c.name}</span>
          {viewers > 0 && (
            <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-muted" title={`${viewers} watching`}>
              <Icon name="eye" size={15} /> {viewers.toLocaleString()}
            </span>
          )}
          <span className="rounded-[5px] bg-danger px-1.5 py-px font-mono text-[11px] font-bold text-white">LIVE</span>
        </div>
        <div className="px-0 sm:px-4">
          <div className="aspect-video w-full overflow-hidden bg-black sm:rounded-card">
            <LivePlayer live={live} onStarted={() => setStarted(true)} />
          </div>
        </div>
        <div className="space-y-3 px-4 py-4">
          {live.title && <h2 className="text-[18px] font-bold leading-snug">{live.title}</h2>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Avatar name={live.host.displayName} src={live.host.avatarUrl} size={36} />
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{live.host.displayName}</span>
            {/* an award for the person streaming (shows in the live chat for everyone) */}
            {/* gifting, like chatting, waits until the stream is playing here */}
            {user && user.id !== live.host.id && live.status === "live" && started && <GiftButton target={{ type: "live", id: live.id }} authorId={live.host.id} variant="pill" />}
            {/* anyone watching can report it (Klique's admins can end it from the reports queue) */}
            {user && user.id !== live.host.id && (
              <button type="button" onClick={() => setReporting(true)} className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-muted hover:text-ink">
                <Icon name="flag" size={14} /> Report
              </button>
            )}
            {live.canEnd && <EndButton slug={c.slug} onEnded={onEnded} />}
          </div>
        </div>
      </div>
      {/* the live chat: beside the player on a big screen, under it on a phone */}
      <aside aria-label="Live chat" className="flex min-h-0 flex-1 flex-col border-t border-line lg:w-[380px] lg:flex-none lg:border-t-0 lg:border-l">
        <div className="flex h-12 shrink-0 items-center border-b border-line px-4 text-[15px] font-semibold">Live chat</div>
        <div className="flex min-h-0 flex-1 flex-col">
          {chat.data ? (
            <LiveRoomChat key={chat.data.channel.id} slug={c.slug} channel={chat.data.channel} isMember={chat.data.isMember} canModerate={chat.data.canModerate} communityName={c.name} loading={!started} />
          ) : chat.error ? (
            <p className="p-4 text-sm text-ink-muted">{chat.error}</p>
          ) : (
            <RowSkeleton rows={4} />
          )}
        </div>
      </aside>
      {reporting && <ReportDialog open onClose={() => setReporting(false)} targetType="live" targetId={live.id} subject="this live stream" />}
    </div>
  );
}

function EndButton({ slug, onEnded }: { slug: string; onEnded: () => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="danger"
      loading={busy}
      onClick={async () => {
        if (!(await confirm({ title: "End the stream?", body: "It stops showing as live in the community. Stop streaming on YouTube too.", confirmLabel: "End", danger: true }))) return;
        setBusy(true);
        try {
          await LiveService.end(slug);
          toast("Stream ended", "success");
          onEnded();
        } catch (e) {
          toast(errorMessage(e), "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      End
    </Button>
  );
}

/**
 * Go live on the website: start the stream on YouTube (YouTube Studio, OBS…), then paste its live link. From a phone,
 * the Klique app streams the camera to YouTube by itself.
 */
function GoLiveModal({ c, onLive, onClose, onChanged, eventId, eventTitle }: { c: Pick<CommunityDTO, "slug" | "name">; live: LiveDTO | null; onLive: (l: LiveDTO | null) => void; onClose: () => void; onChanged: () => void; /** streaming an event: the people going are told */ eventId?: string; eventTitle?: string }) {
  const toast = useToast();
  const [title, setTitle] = useState(eventTitle ?? "");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const r = await LiveService.start(c.slug, { provider: "youtube", title, link, ...(eventId ? { eventId } : {}) });
      onLive(r.data);
      toast("You're live", "success");
      onChanged();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Go live" description={`One stream at a time in ${c.name}. Members are told when you're on.`} size="md">
      <div className="space-y-4">
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Friday night set" />
        <TextField label="YouTube live link" value={link} onChange={(e) => setLink(e.target.value)} maxLength={300} placeholder="https://youtube.com/live/…" hint="Start the stream on YouTube first, then paste its link. On your phone, the Klique app streams your camera straight to YouTube." />
        {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <BrandButton brand="youtube" disabled={!link.trim() || busy} onClick={() => void go()}>
            {busy ? "Going live…" : "Go live"}
          </BrandButton>
        </div>
      </div>
    </Modal>
  );
}

/** Settings → Connections: YouTube, for going live in communities. */
export function ConnectionsTab() {
  return (
    <section>
      <h3 className="eyebrow">Live streaming</h3>
      <p className="mt-1.5 text-sm text-ink-muted">Connect YouTube to go live in communities. The Klique app streams your camera to your own channel; on a computer, start the stream on YouTube and paste its link.</p>
      <YouTubeConnection />
    </section>
  );
}

/** Streams on right now in your communities, busiest first: live updates, and a check every two minutes in case those are off. */
function useLiveNow() {
  const { status } = useAuth();
  const authed = status === "authed";
  const now = useApi(authed ? () => LiveService.now() : null, [authed], { key: "live-now" });
  const { reload } = now;
  useRealtimeEvent(() => void reload(), { filter: (e) => e.type === "live", debounceMs: 800 });
  useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => document.visibilityState === "visible" && void reload(), 120_000);
    return () => clearInterval(t);
  }, [authed, reload]);
  const items = (now.data ?? []).slice(0, 20);
  const firstProvider = items[0]?.live.provider;
  useEffect(() => {
    if (firstProvider) warmLivePlayer(firstProvider);
  }, [firstProvider]);
  return { items };
}

/** One live stream, like Twitch's cards: its picture with LIVE and how many are watching, then the title and community. */
function LiveCard({ x, onWatch }: { x: LiveNowDTO; onWatch: () => void }) {
  return (
    <button type="button" onClick={onWatch} aria-label={`Live in ${x.community.name}. Watch`} className="group block w-full text-left">
      <span className="relative block aspect-video overflow-hidden rounded-[8px] border border-line bg-raised transition group-hover:border-ink-muted/60">
        <LivePreview live={x.live} cover={x.community.coverImage} />
        <span className="absolute top-2 left-2 rounded-[4px] bg-danger px-1.5 text-[11px] leading-[18px] font-extrabold tracking-[.03em] text-white">LIVE</span>
        {x.live.viewers ? <span className="absolute bottom-2 left-2 rounded-[4px] bg-black/70 px-1.5 text-[12px] leading-[18px] font-semibold text-white">{x.live.viewers.toLocaleString()} watching</span> : null}
      </span>
      <span className="mt-2 flex items-start gap-2.5">
        <span className="size-8 shrink-0 overflow-hidden rounded-full bg-raised">
          {x.community.coverImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={x.community.coverImage} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-[14px] font-bold">{x.community.name.slice(0, 1).toUpperCase()}</span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-ink group-hover:underline">{x.live.title || "Live now"}</span>
          <span className="block truncate text-[13px] text-ink-muted">{x.community.name}</span>
        </span>
      </span>
    </button>
  );
}

// only what fits Home's width, on one line: 1 on a phone, then 2, 3 and 4 as there's room (a container query, so it
// suits both Home styles)
const SHOWN = ["", "hidden @md:block", "hidden @lg:block", "hidden @2xl:block"];

/**
 * Live on Home, as cards like Twitch's: the busiest streams in your communities, 1 to 4 across, only what fits on one line
 * (no sideways scrolling, no list of the rest). Nothing at all while nobody's live.
 */
export function LiveNowRow() {
  const { items } = useLiveNow();
  const [watching, setWatching] = useState<LiveNowDTO | null>(null);
  if (!items.length) return null;
  return (
    <section aria-label="Live now" className="@container">
      <ul className="grid grid-cols-1 gap-3 pt-1 pb-3 @md:grid-cols-2 @lg:grid-cols-3 @2xl:grid-cols-4">
        {items.slice(0, 4).map((x, i) => (
          <li key={x.live.id} className={cx("min-w-0", SHOWN[i])}>
            <LiveCard x={x} onWatch={() => setWatching(x)} />
          </li>
        ))}
      </ul>
      {watching && <WatchModal c={{ slug: watching.community.slug, name: watching.community.name }} live={watching.live} onClose={() => setWatching(null)} onEnded={() => setWatching(null)} />}
    </section>
  );
}

/** A live stream's own picture (YouTube's or Twitch's preview); the community's picture if there's none. */
function LivePreview({ live, cover }: { live: LiveDTO; cover: string | null }) {
  const own = live.provider === "youtube" ? `https://i.ytimg.com/vi/${encodeURIComponent(live.channel)}/hqdefault_live.jpg` : live.provider === "twitch" ? `https://static-cdn.jtvnw.net/previews-ttv/live_user_${encodeURIComponent(live.channel.toLowerCase())}-440x248.jpg` : null;
  const [failed, setFailed] = useState(false);
  const src = own && !failed ? own : cover;
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="size-full object-cover transition group-hover:scale-[1.02]" />;
}

/** Across the top of a community while someone's live: who, what, and Watch (dismissable for this stream). */
export function LiveBar({ c, onChanged }: { c: CommunityDTO; onChanged: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<string | null>(null);
  const live = c.live?.status === "live" ? c.live : null;
  // your own stream isn't announced to you (you're the one streaming)
  if (!live || hidden === live.id || live.host.id === user?.id) return null;
  return (
    <div role="status" className="flex items-center gap-3 border-b border-line bg-surface px-3 py-2 sm:px-5">
      <span className="rounded-[5px] bg-danger px-1.5 py-px font-mono text-[11px] font-bold text-white">LIVE</span>
      <p className="min-w-0 flex-1 truncate text-[13.5px]">
        <b>{live.host.displayName}</b> is live{live.title ? `: ${live.title}` : ""}
      </p>
      <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
        Watch
      </Button>
      <button type="button" aria-label="Hide" onClick={() => setHidden(live.id)} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink">
        <Icon name="x" size={15} />
      </button>
      {open && <WatchModal c={c} live={live} onClose={() => setOpen(false)} onEnded={() => (setOpen(false), onChanged())} />}
    </div>
  );
}

/**
 * A streamed event's page: Watch live while it's on, and for its host Go live (from an hour before it starts until it
 * ends). Before that, a line saying it streams here and everyone going is told when it starts.
 */
export function EventLive({ event, onChanged }: { event: EventDTO; onChanged: () => void }) {
  const sp = useSearchParams();
  const [open, setOpen] = useState<"watch" | "go" | null>(null);
  const [live, setLive] = useState<LiveDTO | null>(event.live ?? null);
  const now = useNow(30_000);
  useEffect(() => setLive(event.live ?? null), [event.live]);
  useEffect(() => {
    if (sp.get("live") === "1" && event.live) setOpen("watch");
  }, [sp, event.live]);
  // it went live (or ended) while the page is open
  useRealtimeEvent(() => onChanged(), { filter: (e) => e.type === "live", debounceMs: 800 });
  const c = event.community;
  if (!event.streamed || !c || (event as EventDTO & { cancelled?: boolean }).cancelled) return null;
  const soon = now !== null && Date.parse(event.startsAt) - +now < 60 * 60 * 1000;
  const on = live?.status === "live";
  return (
    <div className="space-y-2">
      {on ? (
        <Button variant="primary" className="w-full" onClick={() => setOpen("watch")}>
          <span className="rounded-[4px] bg-danger px-1.5 font-mono text-[11px] font-bold text-white">LIVE</span> Watch live
        </Button>
      ) : event.canStream && soon && !event.isPast ? (
        <Button variant="primary" className="w-full" onClick={() => setOpen("go")}>
          <Icon name="live" size={16} /> Go live
        </Button>
      ) : null}
      {!on && !event.isPast && <p className="flex items-center justify-center gap-1.5 text-center text-[13px] text-ink-muted"><Icon name="live" size={14} /> Streams live on Klique. Everyone going is told when it starts.</p>}
      {open === "watch" && live && <WatchModal c={c} live={live} onClose={() => setOpen(null)} onEnded={() => (setOpen(null), setLive(null), onChanged())} />}
      {open === "go" && <GoLiveModal c={c} live={live} eventId={event.id} eventTitle={event.title} onLive={setLive} onClose={() => setOpen(null)} onChanged={onChanged} />}
    </div>
  );
}

/** Settings → Connections: YouTube, for streaming the app's camera to your own channel. */
function YouTubeConnection() {
  const toast = useToast();
  const confirm = useConfirm();
  const sp = useSearchParams();
  const yt = useApi(() => LiveService.youtube(), [], { key: "youtube-status" });
  const [rules, setRules] = useState(false);
  useEffect(() => {
    const r = sp.get("youtube");
    if (r === "connected") toast("YouTube connected", "success");
    else if (r === "failed") toast("Couldn't connect YouTube. Try again.", "error");
  }, [sp, toast]);
  async function connect() {
    try {
      window.location.href = (await LiveService.youtubeConnectUrl("/settings#connections")).data.url;
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }
  async function disconnect() {
    if (!(await confirm({ title: "Disconnect YouTube?", body: "You won't be able to stream your camera to YouTube until you connect again. Pasting a live link still works.", confirmLabel: "Disconnect", danger: true }))) return;
    try {
      await LiveService.youtubeDisconnect();
      toast("YouTube disconnected", "success");
      void yt.reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }
  const y = yt.data;
  return (
    <div className="mt-3 flex items-center gap-3 rounded-card border border-line bg-surface p-4">
      {y?.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={y.avatarUrl} alt="" className="size-10 rounded-full" />
      ) : (
        <span className="inline-flex size-10 items-center justify-center rounded-full text-white" style={{ background: YOUTUBE }}>
          <YouTubeLogo size={18} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">YouTube</span>
        <span className="block truncate text-[13px] text-ink-muted">{yt.loading && !y ? "…" : !y?.ready ? "Not available yet" : y.connected ? `Connected as ${y.title ?? "your channel"}` : "Not connected"}</span>
      </span>
      {y?.ready &&
        (y.connected ? (
          <Button size="sm" onClick={() => void disconnect()}>
            Disconnect
          </Button>
        ) : (
          <BrandButton brand="youtube" size="sm" onClick={() => setRules(true)}>
            Connect
          </BrandButton>
        ))}
      {/* what YouTube needs, before Google's sign-in */}
      <Modal open={rules} onClose={() => setRules(false)} title="Before you connect YouTube" size="sm">
        <ol className="space-y-3">
          {YOUTUBE_RULES.map((r, i) => (
            <li key={r.title} className="flex gap-3">
              <span className="w-5 shrink-0 text-[14px] font-bold text-ink-muted">{i + 1}.</span>
              <span>
                <span className="block text-[14px] font-semibold">{r.title}</span>
                <span className="block text-[13px] text-ink-muted">{r.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setRules(false)}>Not now</Button>
          <BrandButton brand="youtube" onClick={() => (setRules(false), void connect())}>
            Continue to YouTube
          </BrandButton>
        </div>
      </Modal>
    </div>
  );
}

/** What YouTube needs before someone can stream through it (shown before they connect). */
const YOUTUBE_RULES = [
  { title: "A YouTube channel", body: "A Google account isn't enough. Make a channel on YouTube first." },
  { title: "Live streaming switched on", body: "In YouTube Studio, verify your phone number and turn on live streaming. The first time, YouTube can take up to 24 hours." },
  { title: "No live restrictions", body: "Channels with a live-streaming strike or restriction in the last 90 days can't go live." },
  { title: "Public on your channel", body: "Your streams go out as public videos on your own channel, and everyone in the community watches them here." },
  { title: "YouTube's rules and Klique's", body: "Streams follow YouTube's Community Guidelines and the community's rules. Breaking either can end a stream." },
];
