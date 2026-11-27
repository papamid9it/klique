"use client";

import { BrandButton, TWITCH, TwitchLogo, YOUTUBE, YouTubeLogo } from "./BrandButtons";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { errorMessage, isApiError } from "@/app/ApiCore";
import { CommunityService } from "@/app/services/CommunityService";
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

  // someone's live: connect to Twitch or YouTube now, so Watch starts faster
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
  useEffect(() => {
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
  }, [c.slug, live.id, user]);
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
            <LivePlayer live={live} />
          </div>
        </div>
        <div className="space-y-3 px-4 py-4">
          {live.title && <h2 className="text-[18px] font-bold leading-snug">{live.title}</h2>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Avatar name={live.host.displayName} src={live.host.avatarUrl} size={36} />
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{live.host.displayName}</span>
            {/* an award for the person streaming (shows in the live chat for everyone) */}
            {user && user.id !== live.host.id && live.status === "live" && <GiftButton target={{ type: "live", id: live.id }} authorId={live.host.id} variant="pill" />}
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
            <LiveRoomChat key={chat.data.channel.id} slug={c.slug} channel={chat.data.channel} isMember={chat.data.isMember} canModerate={chat.data.canModerate} communityName={c.name} />
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
        if (!(await confirm({ title: "End the stream?", body: "It stops showing as live in the community. Stop streaming in OBS or on Twitch too.", confirmLabel: "End", danger: true }))) return;
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

/** Go live: on Twitch (connected; streaming from OBS or the phone app) or by pasting a YouTube live link. */
function GoLiveModal({ c, live, onLive, onClose, onChanged, eventId, eventTitle }: { c: Pick<CommunityDTO, "slug" | "name">; live: LiveDTO | null; onLive: (l: LiveDTO | null) => void; onClose: () => void; onChanged: () => void; /** streaming an event: the people going are told */ eventId?: string; eventTitle?: string }) {
  const toast = useToast();
  const { user } = useAuth();
  const twitch = useApi(() => LiveService.twitch(), [], { key: "twitch-status" });
  const [provider, setProvider] = useState<"twitch" | "youtube">("twitch");
  const [others, setOthers] = useState(false);
  const [title, setTitle] = useState(eventTitle ?? "");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waiting = live?.status === "waiting" && live.host.id === user?.id;

  // waiting for Twitch to say the stream started: check every few seconds
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(async () => {
      try {
        const r = await CommunityService.get(c.slug);
        if (r.data.live?.status === "live") {
          onLive(r.data.live);
          toast("You're live", "success");
          onChanged();
          onClose();
        } else if (!r.data.live) onLive(null);
      } catch {
        /* try again next time */
      }
    }, 6000);
    return () => clearInterval(t);
  }, [waiting, c.slug, onLive, onChanged, onClose, toast]);

  async function connect() {
    try {
      const r = await LiveService.twitchConnectUrl(`/communities/${c.slug}?live=1`);
      window.location.href = r.data.url;
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const r = await LiveService.start(c.slug, { provider, title, ...(eventId ? { eventId } : {}), ...(provider === "youtube" ? { link } : {}) });
      onLive(r.data);
      if (r.data.status === "live") {
        toast("You're live", "success");
        onChanged();
        onClose();
      }
    } catch (e) {
      setError(isApiError(e) && e.code === "twitch_reconnect" ? "Twitch needs you to connect again." : errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Go live" description={`One stream at a time in ${c.name}. Members are told when you're on.`} size="md">
      {waiting ? (
        <div className="space-y-4">
          <p className="text-[14px] leading-relaxed">Start streaming now, in OBS or from the Klique app. Klique shows you as LIVE as soon as Twitch says you&apos;re on.</p>
          <StreamKey />
          <div className="flex items-center gap-2 text-[13px] text-ink-muted">
            <span className="inline-block size-2 animate-pulse rounded-full bg-danger" /> Waiting for Twitch…
          </div>
          <div className="flex justify-end">
            <EndButton slug={c.slug} onEnded={() => (onLive(null), onClose())} />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Friday night set" />
          {provider === "twitch" ? (
            twitch.loading && !twitch.data ? (
              <RowSkeleton rows={1} />
            ) : !twitch.data?.ready ? (
              <p className="text-[13.5px] text-ink-muted">Twitch isn&apos;t set up on Klique yet. Use a YouTube link for now.</p>
            ) : twitch.data.connected ? (
              <div className="flex items-center gap-2.5 rounded-control border border-line px-3 py-2.5">
                {twitch.data.avatarUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={twitch.data.avatarUrl} alt="" className="size-8 rounded-full" />
                )}
                <span className="min-w-0 flex-1 text-[14px]">
                  Streaming as <b>{twitch.data.displayName}</b>
                </span>
              </div>
            ) : (
              <div className="rounded-control border border-line p-3">
                <p className="text-[13.5px] text-ink-muted">Connect your Twitch account once. Then stream from OBS, or from your phone&apos;s camera in the Klique app.</p>
                <BrandButton brand="twitch" className="mt-3" onClick={() => void connect()}>
                  Connect Twitch
                </BrandButton>
              </div>
            )
          ) : (
            <div className="space-y-2">
              <TextField label="YouTube live link" value={link} onChange={(e) => setLink(e.target.value)} maxLength={300} placeholder="https://youtube.com/live/…" hint="Start the stream on YouTube first, then paste its link." />
              <button type="button" onClick={() => setProvider("twitch")} className="text-[13px] font-semibold text-ink-muted hover:text-ink">
                Use Twitch instead
              </button>
            </div>
          )}
          {/* Twitch is the main way; anything else sits behind "Other options" */}
          {provider === "twitch" &&
            (others ? (
              <div className="rounded-control border border-line p-1">
                <button type="button" onClick={() => setProvider("youtube")} className="flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2.5 text-left text-[14px] font-medium hover:bg-raised">
                  <span className="inline-flex size-7 items-center justify-center rounded-[6px] text-white" style={{ background: YOUTUBE }}><YouTubeLogo size={16} /></span> <span className="flex-1">YouTube live link</span> <Icon name="chevron-right" size={15} className="text-ink-muted" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setOthers(true)} className="w-full rounded-control border border-line py-2.5 text-[14px] font-semibold text-ink-muted transition hover:bg-raised hover:text-ink">
                Other options
              </button>
            ))}
          {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={provider === "twitch" ? !twitch.data?.connected : !link.trim()} onClick={() => void go()}>
              Go live
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** For OBS: Twitch's server and the stream key (hidden until shown; never kept on the page). */
function StreamKey() {
  const toast = useToast();
  const [key, setKey] = useState<{ server: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const copy = (t: string) => void navigator.clipboard.writeText(t).then(() => toast("Copied", "success"), () => toast("Couldn't copy it", "error"));
  if (!key) {
    return (
      <Button
        size="sm"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setKey((await LiveService.twitchKey()).data);
          } catch (e) {
            toast(errorMessage(e), "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        Show OBS settings
      </Button>
    );
  }
  return (
    <div className="space-y-2 rounded-control border border-line p-3 text-[13px]">
      {[
        ["Server", key.server],
        ["Stream key", key.key],
      ].map(([label, value]) => (
        <div key={label} className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-ink-muted">{label}</span>
          <code className="min-w-0 flex-1 truncate font-mono">{label === "Stream key" ? "•".repeat(16) : value}</code>
          <button type="button" onClick={() => copy(value)} className="shrink-0 font-semibold text-ink-muted hover:text-ink">
            Copy
          </button>
        </div>
      ))}
      <p className="text-ink-muted">Keep the key secret: anyone with it can stream on your channel.</p>
    </div>
  );
}

/** Settings → Connections: Twitch, for going live in communities. */
export function ConnectionsTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const sp = useSearchParams();
  const twitch = useApi(() => LiveService.twitch(), [], { key: "twitch-status" });
  useEffect(() => {
    const r = sp.get("twitch");
    if (r === "connected") toast("Twitch connected", "success");
    else if (r === "failed") toast("Couldn't connect Twitch. Try again.", "error");
  }, [sp, toast]);

  async function connect() {
    try {
      window.location.href = (await LiveService.twitchConnectUrl("/settings#connections")).data.url;
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }
  async function disconnect() {
    if (!(await confirm({ title: "Disconnect Twitch?", body: "You won't be able to go live from Twitch in communities until you connect again.", confirmLabel: "Disconnect", danger: true }))) return;
    try {
      await LiveService.twitchDisconnect();
      toast("Twitch disconnected", "success");
      void twitch.reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  const t = twitch.data;
  return (
    <section>
      <h3 className="eyebrow">Live streaming</h3>
      <p className="mt-1.5 text-sm text-ink-muted">Connect Twitch or YouTube to go live in communities. The Klique app streams your camera to your own channel; on a computer, stream to Twitch from OBS, or paste a YouTube live link.</p>
      <div className="mt-4 flex items-center gap-3 rounded-card border border-line bg-surface p-4">
        {t?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.avatarUrl} alt="" className="size-10 rounded-full" />
        ) : (
          <span className="inline-flex size-10 items-center justify-center rounded-full text-white" style={{ background: TWITCH }}>
            <TwitchLogo size={18} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">Twitch</span>
          <span className="block truncate text-[13px] text-ink-muted">{twitch.loading && !t ? "…" : !t?.ready ? "Not available yet" : t.connected ? `Connected as ${t.displayName}` : "Not connected"}</span>
        </span>
        {t?.ready &&
          (t.connected ? (
            <Button size="sm" onClick={() => void disconnect()}>
              Disconnect
            </Button>
          ) : (
            <BrandButton brand="twitch" size="sm" onClick={() => void connect()}>
              Connect
            </BrandButton>
          ))}
      </div>
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
      <span className="relative block aspect-video overflow-hidden rounded-[8px] bg-raised">
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
          <BrandButton brand="youtube" size="sm" onClick={() => void connect()}>
            Connect
          </BrandButton>
        ))}
    </div>
  );
}
