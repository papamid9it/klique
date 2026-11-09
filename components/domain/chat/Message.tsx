"use client";

import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import { memo, useState, type ReactNode } from "react";
import { OverflowMenu, type OverflowItem } from "@/components/domain/OverflowMenu";
import { Icon } from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/Avatar";
import { cx } from "@/components/ui/cx";
import { formatTime } from "@/lib/format";
import type { ChannelMessageDTO, MentionDTO } from "@/lib/types";
import { REACTIONS, type ReactionKind } from "@/lib/reactions";
import { useQuickReactions } from "@/lib/hooks/useQuickReactions";
import { ChatImages } from "./ChatImages";
import { Cards } from "./Cards";
import { Embeds } from "./Embeds";
import { ReplyQuote } from "./ReplyQuote";
import { EditedTag, MessageEditor } from "./MessageEditor";
import { ReactButton, ReactionBar, StickerView } from "./Reactions";
import { MessageSheet, useMessageSheet } from "./MessageSheet";
import { PollCard } from "./Polls";
import { UserName } from "@/components/ui/UserName";
import { MASS_WORDS } from "@/lib/mentions";
import { BotTag } from "@/components/domain/space/WebhooksPanel";
import { PlanBadge } from "@/components/domain/account/PlanTab";
import { EmojiText } from "@/components/ui/CustomEmoji";
import { GiftButton } from "@/components/domain/gifts/Gifts";
import { isEmojiOnly } from "@/lib/emoji-tokens";
import { Formatted } from "@/components/ui/Formatted";

const TOKEN_RX = /(https?:\/\/[^\s<]+)|(?<![\w@])@([a-zA-Z0-9_]{3,20})(?![\w])/g;

/** Plain text with clickable links and @mention chips. Never injects HTML. */
function Body({ text, mentions, meId, mass }: { text: string; mentions: MentionDTO[]; meId: string | null; mass?: "everyone" | "here" | null }) {
  // only emoji (a few): all of them big, custom and normal, like Discord
  if (isEmojiOnly(text))
    return (
      <span className="inline-block py-0.5 text-[2.6rem] leading-[1.15]">
        <EmojiText text={text} jumbo />
      </span>
    );
  return <Formatted text={text} plain={(t) => <PlainBody text={t} mentions={mentions} meId={meId} mass={mass} />} />;
}

function PlainBody({ text, mentions, meId, mass }: { text: string; mentions: MentionDTO[]; meId: string | null; mass?: "everyone" | "here" | null }) {
  const byHandle = new Map(mentions.map((m) => [m.handle.toLowerCase(), m]));
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RX)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    if (m[1]) {
      const url = m[1].replace(/[.,!?;:)\]]+$/, "");
      out.push(
        <a key={at} href={url} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-accent-text underline underline-offset-2 hover:opacity-80">
          {url}
        </a>,
      );
      out.push(m[1].slice(url.length));
    } else {
      const who = byHandle.get(m[2].toLowerCase());
      const word = m[2].toLowerCase();
      // a mass mention that pinged (@everyone/@all, @here/@channel): highlighted like Discord's
      if (mass && (MASS_WORDS[word] === "everyone" || (MASS_WORDS[word] === "here" && mass === "here"))) {
        out.push(
          <span key={at} className="rounded-md bg-accent/15 px-1 py-px font-semibold text-accent-text">
            @{m[2]}
          </span>,
        );
      } else if (who) {
        out.push(
          <ProfileTrigger key={at} handle={who.handle} className={cx("rounded-md px-1 py-px font-semibold no-underline transition", who.id === meId ? "bg-accent text-accent-ink" : "bg-accent/15 text-accent-text hover:bg-accent/25")}>
            @{who.handle}
          </ProfileTrigger>,
        );
      } else out.push(m[0]);
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out.map((n, i) => (typeof n === "string" ? <EmojiText key={`t${i}`} text={n} /> : n))}</>;
}

/** Your three most-used reactions, one tap each (in the message's hover bar). */
function QuickReactions({ onPick }: { onPick: (k: ReactionKind) => void }) {
  const quick = useQuickReactions();
  return (
    <>
      {quick.map((k) => {
        const r = REACTIONS.find((x) => x.id === k)!;
        return (
          <button key={k} type="button" onClick={() => onPick(k)} aria-label={`React ${r.label}`} title={r.label} className="inline-flex size-8 items-center justify-center rounded-full text-[17px] leading-none transition hover:bg-raised">
            {r.emoji}
          </button>
        );
      })}
    </>
  );
}

export const Message = memo(function Message({
  m,
  showHead,
  mine,
  meId,
  onDelete,
  onEdit,
  onReport,
  onReact,
  onReply,
  onPin,
  onJump,
  canReact,
  onSaveSticker,
  onThread,
  onOpenThread,
  onCardPress,
  gifts,
}: {
  /** a board reply: show its gifts and the 🎁 button */
  gifts?: boolean;
  /** press a button on a bot's card; left out when you can't (not a member) */
  onCardPress?: (m: ChannelMessageDTO, buttonId: string) => Promise<void>;
  m: ChannelMessageDTO;
  /** first message of a run by the same person: show avatar, name and time */
  showHead: boolean;
  mine: boolean;
  meId: string | null;
  onDelete: (m: ChannelMessageDTO) => void;
  /** save new text; returns an error message on failure */
  onEdit?: (m: ChannelMessageDTO, body: string) => Promise<string | null>;
  onReport?: (m: ChannelMessageDTO) => void;
  onReact?: (m: ChannelMessageDTO, kind: ReactionKind) => void;
  onReply?: (m: ChannelMessageDTO) => void;
  /** owners and admins: pin or unpin */
  onPin?: (m: ChannelMessageDTO, pinned: boolean) => void;
  /** scroll to the message a reply answers */
  onJump?: (id: string) => void;
  canReact?: boolean;
  /** save a picture from this message to your stickers */
  onSaveSticker?: (url: string) => void;
  /** start a thread off this message (or open its thread) */
  onThread?: (m: ChannelMessageDTO) => void;
  /** open a thread by its slug */
  onOpenThread?: (slug: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const sheet = useMessageSheet();
  // a sticker someone sent can be saved (stickers are for sharing); a picture only becomes a sticker if it's yours
  const saveable = !m.deleted && !m.pending ? (m.stickerUrl ?? (mine && m.images.length === 1 ? m.images[0] : null)) : null;
  const items: OverflowItem[] = [
    ...(saveable && onSaveSticker ? [{ label: m.stickerUrl ? "Save sticker" : "Save as sticker", icon: "sticker" as const, onSelect: () => onSaveSticker(saveable) }] : []),
    ...(onReply && !m.deleted && !m.pending ? [{ label: "Reply", icon: "reply" as const, onSelect: () => onReply(m) }] : []),
    ...(onThread && !m.deleted && !m.pending ? [{ label: m.thread ? "Open thread" : "Start thread", icon: "message" as const, onSelect: () => onThread(m) }] : []),
    ...(m.canPin && onPin ? [{ label: m.pinned ? "Unpin message" : "Pin message", icon: "pushpin" as const, onSelect: () => onPin(m, !m.pinned) }] : []),
    ...(m.canEdit && onEdit ? [{ label: "Edit message", icon: "edit" as const, onSelect: () => setEditing(true) }] : []),
    ...(m.canDelete ? [{ label: "Delete message", icon: "trash" as const, danger: true, onSelect: () => onDelete(m) }] : []),
    ...(!mine && onReport && !m.deleted ? [{ label: "Report message", icon: "flag" as const, onSelect: () => onReport(m) }] : []),
  ];

  return (
    // on a touch screen, press and hold for the actions sheet (the hover toolbar is for mice)
    <li id={`msg-${m.id}`} tabIndex={-1} {...(!m.pending && !m.deleted && !editing ? sheet.press : {})} className={cx("group relative flex gap-3 px-4 outline-none hover:bg-raised/40 focus-within:bg-raised/40 sm:px-6", showHead ? "mt-4 pt-0.5" : "", m.mentionsMe && "border-l-2 border-accent bg-accent/10 hover:bg-accent/15", m.pending && "opacity-60")}>
      <div className="w-10 shrink-0 pt-0.5">
        {showHead ? (
          m.bot ? (
            <Avatar name={m.author.displayName} src={m.author.avatarUrl} size={40} />
          ) : (
            <ProfileTrigger handle={m.author.handle} aria-label={`${m.author.displayName}'s profile`}>
              <Avatar name={m.author.displayName} src={m.author.avatarUrl} frame={m.author.avatarFrame} size={40} badge={m.roleBadge ? { icon: m.roleBadge.icon, label: m.roleBadge.name } : null} />
            </ProfileTrigger>
          )
        ) : (
          <span className="invisible block pt-1 text-center font-mono text-[10px] text-ink-muted group-hover:visible" aria-hidden="true">
            {formatTime(m.createdAt).replace(/ (AM|PM)/, "")}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 pb-0.5">
        {showHead && (
          <p className="flex items-baseline gap-2">
            {m.bot ? (
              // a webhook (bot): its name and a BOT tag, no profile behind it
              <span className="inline-flex min-w-0 items-center gap-1.5 self-center">
                <span className="truncate text-[15px] font-semibold text-ink">{m.author.displayName}</span>
                <BotTag />
              </span>
            ) : (
              <ProfileTrigger handle={m.author.handle} className="truncate text-[15px] font-semibold text-ink hover:underline" style={m.color ? { color: m.color } : undefined}>
                <UserName name={m.author.displayName} effect={m.author.nameEffect} />
              </ProfileTrigger>
            )}
            {!m.bot && m.author.bot && <BotTag />}
            {!m.bot && <PlanBadge plan={m.author.badge} size={13} className="self-center" />}
            <time dateTime={m.createdAt} className="font-mono text-[11px] text-ink-muted">
              {formatTime(m.createdAt)}
            </time>
            {m.pinned && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-text" title="Pinned">
                <Icon name="pushpin" size={11} /> Pinned
              </span>
            )}
          </p>
        )}
        {m.replyTo && !m.deleted && <ReplyQuote reply={m.replyTo} onJump={onJump} />}
        {m.deleted ? (
          <p className="text-sm text-ink-muted italic">Message deleted</p>
        ) : (
          <>
            {(m.sticker || m.stickerUrl) && (
              <div className="py-1">
                <StickerView id={m.sticker} url={m.stickerUrl} />
              </div>
            )}
            {editing && onEdit ? (
              <MessageEditor
                initial={m.body}
                onCancel={() => setEditing(false)}
                onSave={async (body) => {
                  const err = await onEdit(m, body);
                  if (!err) setEditing(false);
                  return err;
                }}
              />
            ) : (
              <>
                {m.pollId && <PollCard id={m.pollId} />}
                {!m.body && !m.images.length && !m.sticker && !m.stickerUrl && !m.pollId && !m.cards?.length ? (
                  // nothing to show: a sticker whose picture didn't save (sent while the app was updating)
                  <p className="text-sm text-ink-muted italic">Sticker unavailable</p>
                ) : (
                  m.body && <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap text-ink">
                    <Body text={m.body} mentions={m.mentions} meId={meId} mass={m.massMention} />
                    <EditedTag at={m.editedAt} />
                  </p>
                )}
                <ChatImages images={m.images} mine={mine} />
                {!!m.cards?.length && <Cards cards={m.cards} onPress={onCardPress ? (id) => onCardPress(m, id) : undefined} />}
                {!m.pending && <Embeds body={m.body} />}
              </>
            )}
            {!m.pending && <ReactionBar reactions={m.reactions} canReact={!!canReact && !!onReact} onToggle={(k) => onReact?.(m, k)} />}
            {gifts && !m.pending && !m.deleted && !m.bot && <GiftButton onlyGiven size="sm" target={{ type: "reply", id: m.id }} authorId={m.author.id} className="mt-1" />}
            {m.thread && !m.deleted && (
              <button type="button" onClick={() => onOpenThread?.(m.thread!.slug)} className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-control border border-line bg-raised/60 px-2.5 py-1 text-[13px] text-ink-muted hover:border-ink-muted/50 hover:text-ink">
                <Icon name="message" size={13} />
                <span className="font-semibold text-accent-text">
                  {m.thread.count} {m.thread.count === 1 ? "reply" : "replies"}
                </span>
                <span className="truncate">{m.thread.name}</span>
                {m.thread.lastBy && <span className="hidden shrink-0 text-[12px] sm:inline">· last from {m.thread.lastBy.split(" ")[0]}</span>}
              </button>
            )}
          </>
        )}
      </div>
      {(items.length > 0 || (canReact && onReact)) && !m.pending && !m.deleted && !editing && (
        <div className="absolute -top-3 right-4 flex items-center rounded-full border border-line bg-surface pointer-events-none opacity-0 shadow-sm transition group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 sm:right-6 [@media(pointer:coarse)]:hidden">
          {/* Discord's idea, our look: your three most-used reactions, any reaction, Reply, Gift, then ⋯ for the rest */}
          {canReact && onReact && <QuickReactions onPick={(k) => onReact(m, k)} />}
          {canReact && onReact && <ReactButton onPick={(k) => onReact(m, k)} />}
          {onReply && (
            <button type="button" onClick={() => onReply(m)} aria-label="Reply" title="Reply" className="inline-flex size-8 items-center justify-center rounded-full text-ink-muted transition hover:bg-raised hover:text-ink">
              <Icon name="reply" size={16} />
            </button>
          )}
          {gifts && !m.bot && <GiftButton target={{ type: "reply", id: m.id }} authorId={m.author.id} />}
          {items.length > 0 && <OverflowMenu items={items.filter((it) => it.label !== "Reply")} label="Message actions" compact />}
        </div>
      )}
      {sheet.open && <MessageSheet open onClose={sheet.close} onReact={canReact && onReact ? (k) => onReact(m, k) : undefined} items={items} copyText={m.body || undefined} />}
    </li>
  );
});
