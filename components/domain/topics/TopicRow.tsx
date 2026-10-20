"use client";

import Link from "next/link";
import { SoftLink } from "@/components/ui/SoftLink";
import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import { TopicService } from "@/app/services/TopicService";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { compactCount, relativeStamp } from "@/lib/format";
import { useNow } from "@/lib/hooks/useApi";
import type { TopicDTO } from "@/lib/types";
import { LikeButton } from "./parts";
import { TopicMedia } from "./TopicMedia";
import { TopicMenu, topicHref } from "./TopicMenu";
import { seedTopic } from "./TopicThread";
import { UserName } from "@/components/ui/UserName";

/**
 * One topic in a list: likes, title, a taste of the text, who and when, comment count.
 * `showCommunity` is for the home feed, where topics from several communities mix with events.
 */
export function TopicRow({ topic: t, onChange, onRemoved, showCommunity, scroll, active }: { topic: TopicDTO; onChange: (t: TopicDTO) => void; onRemoved: () => void; showCommunity?: boolean; scroll?: boolean; active?: boolean }) {
  const now = useNow();
  const href = topicHref(t);
  const when = now ? relativeStamp(t.createdAt, now) : "";
  const excerpt = t.body.length > 280 ? `${t.body.slice(0, 280).trimEnd()}…` : t.body;

  return (
    <article aria-current={active || undefined} className={cx("rounded-card border bg-surface p-4 transition hover:border-ink-muted/40 sm:p-5", active ? "border-accent-text ring-2 ring-accent/20" : t.pinned ? "border-accent/40" : "border-line")} aria-label={t.title}>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-muted">
        {showCommunity && (
          <Link href={`/communities/${t.community.slug}`} className="inline-flex items-center gap-1.5 font-semibold text-ink hover:underline">
            {t.community.name}
          </Link>
        )}
        {showCommunity && <span aria-hidden="true">·</span>}
        {showCommunity && t.board.id && (
          <>
            <Link href={`/communities/${t.community.slug}?view=topics&b=${t.board.slug}`} className="font-semibold hover:text-ink hover:underline">
              {t.board.name}
            </Link>
            <span aria-hidden="true">·</span>
          </>
        )}
        <ProfileTrigger handle={t.author.handle} className="inline-flex items-center gap-1.5 hover:text-ink">
          <Avatar name={t.author.displayName} src={t.author.avatarUrl} frame={t.author.avatarFrame} size={18} />
          <span className="font-medium"><UserName name={t.author.displayName} effect={t.author.nameEffect} /></span>
        </ProfileTrigger>
        <span aria-hidden="true">·</span>
        <time dateTime={t.createdAt}>{when}</time>
        {t.editedAt && <span>(edited)</span>}
        {t.pinned && (
          <span className="inline-flex items-center gap-1 font-semibold text-accent-text">
            <Icon name="pushpin" size={12} /> Pinned
          </span>
        )}
        {t.locked && (
          <span className="inline-flex items-center gap-1 font-semibold">
            <Icon name="lock" size={12} /> Locked
          </span>
        )}
      </div>

      <div className="min-w-0">
        <h3 className="text-[17px] leading-snug font-semibold tracking-[-0.02em] break-words">
          <SoftLink href={href} scroll={scroll} onClick={() => seedTopic(t)} className="hover:underline">
            {t.title}
          </SoftLink>
        </h3>
        {excerpt && <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed break-words whitespace-pre-line text-ink-muted">{excerpt}</p>}
      </div>
      <TopicMedia media={t.media} className="mt-3" />

      <div className="mt-3 flex items-center gap-1">
        <LikeButton liked={t.liked} count={t.likeCount} canLike={t.canLike} onToggle={async () => (await TopicService.like(t.community.slug, t.id)).data} onChange={(n) => onChange({ ...t, liked: n.liked, likeCount: n.likeCount })} />
        <SoftLink href={href} scroll={scroll} onClick={() => seedTopic(t)} className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold text-ink-muted transition hover:bg-raised hover:text-ink" aria-label={`${t.commentCount} comments`}>
          <Icon name="message" size={16} />
          <span className="font-mono tabular-nums">{compactCount(t.commentCount)}</span>
        </SoftLink>
        <span className="ml-auto">
          <TopicMenu topic={t} onChange={onChange} onRemoved={onRemoved} />
        </span>
      </div>
    </article>
  );
}
