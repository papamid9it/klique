"use client";

import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import { Fragment, memo, useState, type ReactNode } from "react";
import { OverflowMenu, type OverflowItem } from "@/components/domain/OverflowMenu";
import { Icon } from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/Avatar";
import { cx } from "@/components/ui/cx";
import { formatTime } from "@/lib/format";
import type { ChannelMessageDTO, MentionDTO } from "@/lib/types";
import type { ReactionKind } from "@/lib/reactions";
import { ChatImages } from "./ChatImages";
import { Embeds } from "./Embeds";
import { ReplyQuote } from "./ReplyQuote";
import { EditedTag, MessageEditor } from "./MessageEditor";
import { ReactButton, ReactionBar, StickerView } from "./Reactions";
import { PollCard } from "./Polls";
import { UserName } from "@/components/ui/UserName";

const TOKEN_RX = /(https?:\/\/[^\s<]+)|(?<![\w@])@([a-zA-Z0-9_]{3,20})(?![\w])/g;

/** Plain text with clickable links and @mention chips. Never injects HTML. */
function Body({ text, mentions, meId }: { text: string; mentions: MentionDTO[]; meId: string | null }) {
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
      if (who) {
        out.push(
          <ProfileTrigger key={at} handle={who.handle} title={who.displayName} className={cx("rounded-md px-1 py-px font-semibold no-underline transition", who.id === meId ? "bg-accent text-accent-ink" : "bg-accent/15 text-accent-text hover:bg-accent/25")}>
            @{who.handle}
          </ProfileTrigger>,
        );
      } else out.push(m[0]);
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out.map((n, i) => (typeof n === "string" ? <Fragment key={`t${i}`}>{n}</Fragment> : n))}</>;
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
}: {
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
}) {
  const [editing, setEditing] = useState(false);
  const saveable = !m.deleted && !m.pending ? (m.stickerUrl ?? (m.images.length === 1 ? m.images[0] : null)) : null;
  const items: OverflowItem[] = [
    ...(saveable && onSaveSticker ? [{ label: m.stickerUrl ? "Save sticker" : "Save as sticker", icon: "sticker" as const, onSelect: () => onSaveSticker(saveable) }] : []),
    ...(onReply && !m.deleted && !m.pending ? [{ label: "Reply", icon: "reply" as const, onSelect: () => onReply(m) }] : []),
    ...(m.canPin && onPin ? [{ label: m.pinned ? "Unpin message" : "Pin message", icon: "pushpin" as const, onSelect: () => onPin(m, !m.pinned) }] : []),
    ...(m.canEdit && onEdit ? [{ label: "Edit message", icon: "edit" as const, onSelect: () => setEditing(true) }] : []),
    ...(m.canDelete ? [{ label: "Delete message", icon: "trash" as const, danger: true, onSelect: () => onDelete(m) }] : []),
    ...(!mine && onReport && !m.deleted ? [{ label: "Report message", icon: "flag" as const, onSelect: () => onReport(m) }] : []),
  ];

  return (
    // tabIndex -1: tapping a message on a touch screen focuses it, which reveals its toolbar (focus-within below)
    <li id={`msg-${m.id}`} tabIndex={-1} className={cx("group relative flex gap-3 px-4 outline-none hover:bg-raised/40 focus-within:bg-raised/40 sm:px-6", showHead ? "mt-4 pt-0.5" : "", m.mentionsMe && "border-l-2 border-accent bg-accent/10 hover:bg-accent/15", m.pending && "opacity-60")}>
      <div className="w-10 shrink-0 pt-0.5">
        {showHead ? (
          <ProfileTrigger handle={m.author.handle} aria-label={`${m.author.displayName}'s profile`}>
            <Avatar name={m.author.displayName} src={m.author.avatarUrl} frame={m.author.avatarFrame} size={40} />
          </ProfileTrigger>
        ) : (
          <span className="invisible block pt-1 text-center font-mono text-[10px] text-ink-muted group-hover:visible" aria-hidden="true">
            {formatTime(m.createdAt).replace(/ (AM|PM)/, "")}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 pb-0.5">
        {showHead && (
          <p className="flex items-baseline gap-2">
            <ProfileTrigger handle={m.author.handle} className="truncate text-[15px] font-semibold text-ink hover:underline">
              <UserName name={m.author.displayName} effect={m.author.nameEffect} />
            </ProfileTrigger>
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
                {!m.body && !m.images.length && !m.sticker && !m.stickerUrl && !m.pollId ? (
                  // nothing to show: a sticker whose picture didn't save (sent while the app was updating)
                  <p className="text-sm text-ink-muted italic">Sticker unavailable</p>
                ) : (
                  m.body && <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap text-ink">
                    <Body text={m.body} mentions={m.mentions} meId={meId} />
                    <EditedTag at={m.editedAt} />
                  </p>
                )}
                <ChatImages images={m.images} />
                {!m.pending && <Embeds body={m.body} />}
              </>
            )}
            {!m.pending && <ReactionBar reactions={m.reactions} canReact={!!canReact && !!onReact} onToggle={(k) => onReact?.(m, k)} />}
          </>
        )}
      </div>
      {(items.length > 0 || (canReact && onReact)) && !m.pending && !m.deleted && !editing && (
        <div className="absolute -top-3 right-4 flex items-center rounded-full border border-line bg-surface pointer-events-none opacity-0 shadow-sm transition group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 sm:right-6">
          {canReact && onReact && <ReactButton onPick={(k) => onReact(m, k)} />}
          {items.length > 0 && <OverflowMenu items={items} label="Message actions" compact />}
        </div>
      )}
    </li>
  );
});
