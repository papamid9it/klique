"use client";

import { useEffect, useRef } from "react";
import { FeedMedia } from "./FeedMedia";
import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { UserName } from "@/components/ui/UserName";
import { relativeStamp } from "@/lib/format";
import { useNow } from "@/lib/hooks/useApi";
import type { FeedPostDTO } from "@/lib/types";
import { ShareButton } from "@/components/domain/ShareButton";
import { compactCount } from "@/lib/format";
import { VoteControl, postHref, useVote } from "./PostCard";
import { PostComments } from "./PostComments";

/**
 * One post opened up, like Instagram on a computer: the pictures or video on the left, and on the right who
 * posted, the caption, the votes and the comments. Full screen on phones. Esc or a click outside closes it.
 */
export function PostDialog({ post, onChange, onClose }: { post: FeedPostDTO | null; onChange: (p: FeedPostDTO) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const now = useNow();
  const open = !!post;
  const vote = useVote(post as FeedPostDTO, onChange);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label="Post"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none overflow-hidden border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm sm:m-auto sm:h-[min(88dvh,46rem)] sm:w-[calc(100%-2rem)] sm:max-w-[1040px] sm:rounded-card sm:border"
    >
      {post && (
        <div className="relative flex h-full flex-col md:flex-row">
          <button type="button" onClick={onClose} aria-label="Close" className="absolute top-2.5 right-2.5 z-10 inline-flex size-9 items-center justify-center rounded-full bg-surface/80 text-ink-muted backdrop-blur hover:bg-raised hover:text-ink">
            <Icon name="x" size={18} />
          </button>
          <div className="flex shrink-0 items-center bg-black md:min-w-0 md:flex-[1.4]">
            <FeedMedia key={post.id} media={post.media} fill withSound onDoubleTap={() => post.myVote !== 1 && void vote(1)} />
          </div>
          <div className="flex min-h-0 flex-1 flex-col border-line md:max-w-[26rem] md:border-l">
            <header className="flex items-center gap-3 border-b border-line px-4 py-3 pr-14">
              <ProfileTrigger handle={post.author.handle} className="shrink-0 rounded-full">
                <Avatar name={post.author.displayName} src={post.author.avatarUrl} frame={post.author.avatarFrame} size={34} />
              </ProfileTrigger>
              <div className="min-w-0 leading-tight">
                <ProfileTrigger handle={post.author.handle} className="block truncate text-[14px] font-semibold hover:underline">
                  <UserName name={post.author.displayName} effect={post.author.nameEffect} />
                </ProfileTrigger>
                <p className="truncate text-[12px] text-ink-muted">
                  {post.community.name} · {now ? relativeStamp(post.createdAt, now) : ""}
                </p>
              </div>
            </header>
            <PostComments
              pinned
              post={post}
              onCount={(n) => onChange({ ...post, commentCount: n })}
              top={
                <div className="space-y-3 border-b border-line pb-4">
                  {post.caption && <p className="text-[15px] leading-snug font-semibold break-words whitespace-pre-wrap">{post.caption}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    <VoteControl post={post} onChange={onChange} />
                    <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-raised/70 px-3.5 text-[13px] font-semibold text-ink-muted" aria-label={`${post.commentCount} comments`}>
                      <Icon name="message" size={17} />
                      <span className="font-mono tabular-nums">{compactCount(post.commentCount)}</span>
                    </span>
                    <ShareButton path={postHref(post)} text={post.caption ? `${post.caption.slice(0, 80)} · ${post.community.name}` : `A post in ${post.community.name}`} variant="pill" size="sm" />
                  </div>
                </div>
              }
            />
          </div>
        </div>
      )}
    </dialog>
  );
}
