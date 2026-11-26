"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { ChannelService } from "@/app/services/ChannelService";
import { ReportDialog } from "@/components/domain/ReportDialog";
import { useRealtime, useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { LiveService } from "@/app/services/LiveService";
import { Avatar } from "@/components/ui/Avatar";
import { EmojiText } from "@/components/ui/CustomEmoji";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import type { ChannelDTO, ChannelMessageDTO } from "@/lib/types";

/** the most lines kept on screen (a busy stream keeps going; older lines drop off the top) */
const KEEP = 250;
const MAX_LEN = 300;

/**
 * A live stream's chat, like Twitch's and YouTube's: one small line per message (picture, name, words), new ones at
 * the bottom, scrolling by itself unless you've scrolled up to read (then "New messages" brings you back). Awards show
 * as gold lines. Plain text only: no pictures, threads or link previews, and links don't open (nobody gets taken off
 * the stream). Members write; everyone else who can see the community reads along.
 */
export function LiveRoomChat({ slug, channel, isMember, communityName, canModerate }: { slug: string; channel: ChannelDTO; isMember: boolean; communityName: string; /** the person streaming and the community's moderators: time out, remove from the stream */ canModerate?: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const { connected } = useRealtime();
  const space = { slug };
  const [msgs, setMsgs] = useState<ChannelMessageDTO[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [reporting, setReporting] = useState<ChannelMessageDTO | null>(null);
  const [behind, setBehind] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const lastId = useRef<string | null>(null);
  const busy = useRef(false);

  const add = useCallback((items: ChannelMessageDTO[]) => {
    if (!items.length) return;
    setMsgs((cur) => {
      const seen = new Set(cur.map((m) => m.id));
      const next = [...cur.filter((m) => !m.pending || !items.some((x) => x.author.id === m.author.id && x.body === m.body)), ...items.filter((m) => !seen.has(m.id))].slice(-KEEP);
      return next;
    });
    lastId.current = items[items.length - 1].id;
    if (!pinned.current) setBehind((n) => n + items.length);
  }, []);

  // the latest page first, then only what's newer
  useEffect(() => {
    let dead = false;
    void ChannelService.messages(space, channel.slug).then(
      (r) => {
        if (dead) return;
        const items = r.data.items.filter((m) => !m.deleted).slice(-KEEP);
        setMsgs(items);
        lastId.current = items[items.length - 1]?.id ?? null;
        setLoaded(true);
      },
      () => setLoaded(true),
    );
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, channel.slug]);

  const fetchNew = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await ChannelService.messages({ slug }, channel.slug, lastId.current ? { after: lastId.current } : {});
      add(r.data.items.filter((m) => !m.deleted));
    } catch {
      /* next time */
    } finally {
      busy.current = false;
    }
  }, [slug, channel.slug, add]);

  // something new here: fetch it now; without live updates, check every few seconds
  useRealtimeEvent(() => void fetchNew(), { filter: (e) => e.type === "channel" && e.channelId === channel.id, debounceMs: 250 });
  useEffect(() => {
    // live updates reach members only (and only while connected): everyone else checks every 3 seconds, members every 8
    const t = setInterval(() => document.visibilityState === "visible" && void fetchNew(), connected && isMember ? 8_000 : 3_000);
    return () => clearInterval(t);
  }, [connected, isMember, fetchNew]);

  // stay at the bottom while you're there
  useEffect(() => {
    const el = box.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [msgs]);
  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (pinned.current) setBehind(0);
  };
  const toBottom = () => {
    const el = box.current;
    if (!el) return;
    pinned.current = true;
    setBehind(0);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText("");
    pinned.current = true;
    try {
      const r = await ChannelService.send(space, channel.slug, { body });
      add([r.data]);
    } catch (e) {
      setText(body);
      toast(errorMessage(e), "error");
    } finally {
      setSending(false);
    }
  }

  async function moderate(m: ChannelMessageDTO, action: "remove" | "timeout") {
    const name = m.author.displayName;
    const ok = await confirm(
      action === "remove"
        ? { title: `Remove ${name} from the stream?`, body: "The stream and its chat disappear for them on Klique, and their messages here go.", confirmLabel: "Remove" }
        : { title: `Time out ${name} for 10 minutes?`, body: "They can't write anywhere in this community until it ends.", confirmLabel: "Time out" },
    );
    if (!ok) return;
    try {
      await LiveService.moderate(slug, m.author.id, action);
      if (action === "remove") setMsgs((cur) => cur.filter((x) => x.author.id !== m.author.id));
      toast(action === "remove" ? `${name} was removed from the stream` : `${name} is timed out for 10 minutes`, "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  async function remove(m: ChannelMessageDTO) {
    try {
      await ChannelService.deleteMessage(space, channel.slug, m.id);
      setMsgs((cur) => cur.filter((x) => x.id !== m.id));
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={box} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-2" aria-live="polite" aria-relevant="additions">
        {loaded && msgs.length === 0 && <p className="px-1 py-3 text-[13px] text-ink-muted">Welcome to the live chat. Say hi. Be kind; the community&apos;s rules apply.</p>}
        <ul className="space-y-0.5">
          {msgs.map((m) => {
            const gift = !!m.cards?.length && m.cards[0].color === "#F5B83D";
            return (
              <li key={m.id} className={cx("group relative flex items-start gap-2 rounded-[8px] px-1.5 py-1 text-[14px] leading-[20px]", gift ? "my-1 border border-[#F5B83D]/50 bg-[#F5B83D]/10" : "hover:bg-raised/60", m.pending && "opacity-60")}>
                {gift && m.cards?.[0].thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.cards[0].thumbnail} alt="" className="mt-px size-6 shrink-0 object-contain" />
                ) : (
                  <span className="mt-px shrink-0"><Avatar name={m.author.displayName} src={m.author.avatarUrl} size={20} /></span>
                )}
                <p className="min-w-0 flex-1 break-words">
                  {m.bot ? (
                    <span className="font-semibold">{m.author.displayName}</span>
                  ) : (
                    <ProfileTrigger handle={m.author.handle} className="font-semibold hover:underline" style={m.color ? { color: m.color } : undefined}>
                      {m.author.displayName}
                    </ProfileTrigger>
                  )}
                  <span className="text-ink-muted">{gift ? " " : ": "}</span>
                  <span className={gift ? "font-semibold" : undefined}><EmojiText text={m.body} /></span>
                </p>
                {!m.pending && !gift && (
                  <span className="absolute top-0.5 right-1 hidden gap-0.5 rounded-full bg-surface px-1 shadow-sm group-hover:flex">
                    {m.canDelete && (
                      <button type="button" aria-label="Delete message" title="Delete" onClick={() => void remove(m)} className="inline-flex size-6 items-center justify-center rounded-full text-ink-muted hover:text-danger">
                        <Icon name="trash" size={13} />
                      </button>
                    )}
                    {canModerate && !m.bot && m.author.id !== user?.id && (
                      <>
                        <button type="button" aria-label={`Time out ${m.author.displayName}`} title="Time out 10 minutes" onClick={() => void moderate(m, "timeout")} className="inline-flex size-6 items-center justify-center rounded-full text-ink-muted hover:text-ink">
                          <Icon name="clock" size={13} />
                        </button>
                        <button type="button" aria-label={`Remove ${m.author.displayName} from the stream`} title="Remove from the stream" onClick={() => void moderate(m, "remove")} className="inline-flex size-6 items-center justify-center rounded-full text-ink-muted hover:text-danger">
                          <Icon name="ban" size={13} />
                        </button>
                      </>
                    )}
                    {!m.canDelete && (
                      <button type="button" aria-label="Report message" title="Report" onClick={() => setReporting(m)} className="inline-flex size-6 items-center justify-center rounded-full text-ink-muted hover:text-ink">
                        <Icon name="flag" size={13} />
                      </button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {behind > 0 && (
        <button type="button" onClick={toBottom} className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full bg-ink px-3 py-1.5 text-[13px] font-semibold text-canvas shadow-md">
          {behind > 99 ? "99+" : behind} new · Jump down
        </button>
      )}
      <div className="border-t border-line p-2.5">
        {isMember ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex items-center gap-2"
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
              maxLength={MAX_LEN}
              placeholder="Say something…"
              aria-label="Message the live chat"
              className="h-10 min-w-0 flex-1 rounded-full border border-line bg-raised px-4 text-[14px] outline-none focus:border-ink-muted"
            />
            <button type="submit" disabled={!text.trim() || sending} aria-label="Send" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-canvas disabled:opacity-40">
              <Icon name="send" size={16} />
            </button>
          </form>
        ) : (
          <p className="py-1.5 text-center text-[13px] text-ink-muted">Join {communityName} to chat.</p>
        )}
      </div>
      {reporting && <ReportDialog open onClose={() => setReporting(null)} targetType="channelMessage" targetId={reporting.id} subject={`${reporting.author.displayName}'s message`} />}
    </div>
  );
}
