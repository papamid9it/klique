"use client";

import { WhoReacted } from "@/components/domain/feed/WhoReacted";
import { useState } from "react";
import { SoftLink } from "@/components/ui/SoftLink";
import { TopicService } from "@/app/services/TopicService";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { cdn } from "@/lib/cdn";
import { compactCount, relativeStamp } from "@/lib/format";
import { useNow } from "@/lib/hooks/useApi";
import type { TopicDTO } from "@/lib/types";
import { LikeButton } from "./parts";
import { TopicMenu, topicHref } from "./TopicMenu";
import { prefetchTopic, seedTopic } from "./TopicThread";
import { UserName } from "@/components/ui/UserName";
import { GiftButton } from "@/components/domain/gifts/Gifts";
import { PostTag } from "@/components/domain/feed/PostTag";

/**
 * One post in a board, like a Discord forum post card: tags, title, who wrote it and the start of the text, a
 * thumbnail of its picture, and upvotes, replies and when it was last active. The whole card opens the post
 * beside the list; `onTag` filters the board by a tag.
 */
export function TopicRow({ topic: t, onChange, onRemoved, onTag, active }: { topic: TopicDTO; onChange: (t: TopicDTO) => void; onRemoved: () => void; onTag?: (tag: string) => void; active?: boolean }) {
  const now = useNow();
  const [who, setWho] = useState(false);
  const href = topicHref(t);
  const pic = t.media[0];
  const thumb = pic ? (pic.kind === "video" ? pic.poster : pic.url) : null;
  const preview = t.body.replace(/\s+/g, " ").trim();

  return (
    <article
      aria-current={active || undefined}
      aria-label={t.title}
      className={cx("group relative flex gap-4 rounded-card border bg-surface p-4 transition hover:border-ink-muted/40 hover:bg-raised/40", active ? "border-accent-text ring-2 ring-accent/20" : t.pinned ? "border-accent/40" : "border-line")}
    >
      {/* the whole card opens the post; buttons and tags sit above this link */}
      <SoftLink href={href} scroll={false} onClick={() => seedTopic(t)} onPointerEnter={() => prefetchTopic(t.community.slug, t.id)} onFocus={() => prefetchTopic(t.community.slug, t.id)} aria-label={`Open ${t.title}`} className="absolute inset-0 rounded-card" />
      <div className="min-w-0 flex-1">
        {/* its community tag (coloured, as on posts); older posts' typed tags in grey */}
        {(t.postTag || t.tags.length > 0) && (
          <ul className="relative mb-1.5 flex flex-wrap gap-1.5" aria-label="Tags">
            {t.postTag && (
              <li>
                <button type="button" onClick={() => onTag?.(t.postTag!.id)} title={`Show posts tagged ${t.postTag.name}`} className="flex hover:opacity-85">
                  <PostTag tag={t.postTag} />
                </button>
              </li>
            )}
            {t.tags.map((tag) => (
              <li key={tag}>
                <button type="button" onClick={() => onTag?.(tag)} title={`Show posts tagged ${tag}`} className="inline-flex h-6 items-center rounded-[6px] bg-raised px-2 text-[12px] font-medium text-ink-muted transition hover:bg-line hover:text-ink">
                  {tag}
                </button>
              </li>
            ))}
          </ul>
        )}
        <h3 className="flex items-start gap-1.5 text-[16px] leading-snug font-semibold tracking-[-0.01em] break-words">
          {t.pinned && <Icon name="pushpin" size={14} className="mt-1 shrink-0 text-accent-text" aria-label="Pinned" />}
          {t.locked && <Icon name="lock" size={14} className="mt-1 shrink-0 text-ink-muted" aria-label="Locked" />}
          <span className="min-w-0">{t.title}</span>
        </h3>
        <p className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-ink-muted">
          <span className="font-semibold text-ink">
            <UserName name={t.author.displayName} effect={t.author.nameEffect} />
          </span>
          {preview ? `: ${preview}` : ""}
        </p>
        <div className="relative mt-2.5 flex flex-wrap items-center gap-x-1 gap-y-1 text-[12.5px] text-ink-muted">
          <LikeButton upvote size="sm" liked={t.liked} count={t.likeCount} canLike={t.canLike} onToggle={async () => (await TopicService.like(t.community.slug, t.id)).data} onChange={(n) => onChange({ ...t, liked: n.liked, likeCount: n.likeCount })} onWho={() => setWho(true)} />
          {who && <WhoReacted title="Upvoted by" load={() => TopicService.likers(t.community.slug, t.id)} onClose={() => setWho(false)} />}
          <span className="inline-flex h-7 items-center gap-1.5 px-2 font-semibold" aria-label={`${t.commentCount} replies`}>
            <Icon name="message" size={14} />
            <span className="font-mono tabular-nums">{compactCount(t.commentCount)}</span>
          </span>
          {/* the gift button right after the replies, then any gifts it has */}
          <span className="relative">
            <GiftButton target={{ type: "topic", id: t.id }} authorId={t.author.id} size="sm" />
          </span>
          <span aria-hidden="true">·</span>
          <time dateTime={t.lastActivityAt} className="px-1">
            {now ? `Active ${relativeStamp(t.lastActivityAt, now)}` : ""}
          </time>
          {t.following && (
            <span className="inline-flex items-center gap-1 px-1 text-accent-text" title="You follow this post">
              <Icon name="bell" size={12} /> Following
            </span>
          )}
          <span className="ml-auto">
            <TopicMenu topic={t} onChange={onChange} onRemoved={onRemoved} />
          </span>
        </div>
      </div>
      {thumb && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cdn(thumb, { w: 192, h: 192, fit: "fill" })} alt="" loading="lazy" decoding="async" className="size-20 shrink-0 self-center rounded-control border border-line object-cover sm:size-24" />
      )}
    </article>
  );
}
