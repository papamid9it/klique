"use client";

import Link from "next/link";
import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { FeedService } from "@/app/services/FeedService";
import { SpaceService } from "@/app/services/SpaceService";
import { OverflowMenu } from "@/components/domain/OverflowMenu";
import { ShareButton, absoluteUrl } from "@/components/domain/ShareButton";
import { FeedMedia } from "./FeedMedia";
import { LongPost, TextCard } from "./TextPost";
import { ExplicitCover } from "./ExplicitCover";
import { ReportDialog } from "@/components/domain/ReportDialog";
import { ConfirmModal } from "@/components/domain/space/parts";
import { useAuth } from "@/components/providers/AuthProvider";
import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Cover } from "@/components/ui/Cover";
import { Icon } from "@/components/ui/Icon";
import { UserName } from "@/components/ui/UserName";
import { cx } from "@/components/ui/cx";
import { compactCount, relativeStamp } from "@/lib/format";
import { useNow } from "@/lib/hooks/useApi";
import { textStyleOf } from "@/lib/feedText";
import type { FeedPostDTO } from "@/lib/types";

/** A post's own link: it opens over the feed you're on, and on its own page when opened directly. */
export const postHref = (p: Pick<FeedPostDTO, "id">) => `/p/${p.id}`;

/** Up · score · down, Reddit style. Flips at once; the server's counts follow (rolled back if it fails). */
/** Voting on a post: up, down, or the same again to take it back. Shows at once, then settles on the server's counts. */
export function useVote(p: FeedPostDTO, onChange: (p: FeedPostDTO) => void) {
  const toast = useToast();
  const { requireAuth } = useAuth();
  const [busy, setBusy] = useState(false);
  return async function vote(dir: 1 | -1) {
    if (busy || !requireAuth()) return;
    // a public community's posts take anyone's vote (suggested posts on the home feed); a private one needs you in
    if (!p.isMember && p.community.privacy !== "public") return toast(`Join ${p.community.name} to vote.`);
    const value = p.myVote === dir ? 0 : dir;
    const before = p;
    const up = p.upCount - (p.myVote === 1 ? 1 : 0) + (value === 1 ? 1 : 0);
    const down = p.downCount - (p.myVote === -1 ? 1 : 0) + (value === -1 ? 1 : 0);
    onChange({ ...p, myVote: value, upCount: up, downCount: down });
    setBusy(true);
    try {
      const res = await FeedService.vote(p.community.slug, p.id, value);
      onChange({ ...p, ...res.data });
    } catch (e) {
      onChange(before);
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };
}

export function VoteControl({ post: p, onChange }: { post: FeedPostDTO; onChange: (p: FeedPostDTO) => void }) {
  const vote = useVote(p, onChange);
  const score = p.upCount - p.downCount;
  // your vote shows at a glance, the same in every mood: the whole pill turns green (up) or red (down)
  return (
    <div className={cx("inline-flex items-center rounded-full transition-colors", p.myVote === 1 ? "bg-vote-up/15" : p.myVote === -1 ? "bg-vote-down/15" : "bg-raised/70")} role="group" aria-label="Vote" data-vote={p.myVote}>
      <button type="button" onClick={() => void vote(1)} aria-pressed={p.myVote === 1} aria-label="Upvote" title="Upvote" className={cx("inline-flex size-9 items-center justify-center rounded-full transition", p.myVote === 1 ? "text-vote-up hover:bg-vote-up/15" : "text-ink-muted hover:bg-raised hover:text-vote-up")}>
        <Icon name="arrowdown" size={18} className="rotate-180" />
      </button>
      <span className={cx("min-w-6 text-center font-mono text-[13.5px] font-semibold tabular-nums", p.myVote === 1 ? "text-vote-up" : p.myVote === -1 ? "text-vote-down" : "text-ink")} aria-label={`Score ${score}`}>
        {compactCount(score)}
      </span>
      <button type="button" onClick={() => void vote(-1)} aria-pressed={p.myVote === -1} aria-label="Downvote" title="Downvote" className={cx("inline-flex size-9 items-center justify-center rounded-full transition", p.myVote === -1 ? "text-vote-down hover:bg-vote-down/15" : "text-ink-muted hover:bg-raised hover:text-vote-down")}>
        <Icon name="arrowdown" size={18} />
      </button>
    </div>
  );
}

/**
 * A post as a card, Instagram style: who posted (and where, on the home feed), the pictures or video, votes and
 * comments, then the caption. `trending` marks a post from a public community you're not in, with a Join button.
 */
export function PostCard({ post: p, onChange, onRemoved, onOpenComments, showCommunity, trending }: { post: FeedPostDTO; onChange: (p: FeedPostDTO) => void; onRemoved: () => void; onOpenComments: () => void; showCommunity?: boolean; trending?: boolean }) {
  const now = useNow();
  const toast = useToast();
  const { requireAuth } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [more, setMore] = useState(false);
  const [joining, setJoining] = useState(false);
  const long = p.caption.length > 180;
  const vote = useVote(p, onChange);
  // no pictures or video: a coloured card (short text) or a title and text (long), lib/feedText
  const style = textStyleOf(p);

  async function join() {
    if (!requireAuth()) return;
    setJoining(true);
    try {
      const res = await SpaceService.join(p.community.slug);
      toast(res.data.message, "success");
      if (res.data.status === "joined" || res.data.status === "already_member") onChange({ ...p, isMember: true });
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setJoining(false);
    }
  }

  const menu = [
    { label: "Copy link", icon: "link" as const, onSelect: () => void navigator.clipboard?.writeText(absoluteUrl(postHref(p))).then(() => toast("Link copied", "success")) },
    { label: "Report post", icon: "flag" as const, danger: true, onSelect: () => setReporting(true) },
    // in a community that allows explicit content: the poster and its owner and admins mark posts explicit (blurred)
    ...(p.community.explicit && p.canDelete
      ? [{ label: p.explicit ? "Not explicit" : "Mark as explicit", icon: "eye" as const, onSelect: () => void FeedService.setExplicit(p.community.slug, p.id, !p.explicit).then((r) => onChange(r.data), (e) => toast(errorMessage(e), "error")) }]
      : []),
    ...(p.canDelete ? [{ label: "Delete post", icon: "trash" as const, danger: true, onSelect: () => setDeleting(true) }] : []),
  ];

  return (
    <article className="rounded-card border border-line bg-surface p-4" aria-label={`Post by ${p.author.displayName}`}>
      {trending && (
        <p className="mb-2.5 flex items-center gap-1.5 text-[12px] font-medium text-ink-muted">
          <Icon name="asterisk" size={12} className="text-accent-text" /> Suggested · from {p.community.name}
        </p>
      )}
      <header className="flex items-center gap-2.5">
        {showCommunity ? (
          <Link href={`/communities/${p.community.slug}?view=posts`} className="relative block size-8 shrink-0 overflow-hidden rounded-[10px]" aria-label={p.community.name}>
            <Cover src={p.community.coverImage} seed={p.community.id} interest={p.community.interest} className="size-full" />
          </Link>
        ) : (
          <ProfileTrigger handle={p.author.handle} className="shrink-0 rounded-full">
            <Avatar name={p.author.displayName} src={p.author.avatarUrl} frame={p.author.avatarFrame} size={32} />
          </ProfileTrigger>
        )}
        <div className="min-w-0 flex-1 leading-tight">
          {showCommunity && (
            <Link href={`/communities/${p.community.slug}?view=posts`} className="block truncate text-[13.5px] font-semibold hover:underline">
              {p.community.name}
            </Link>
          )}
          <p className={cx("flex min-w-0 items-center gap-1.5 text-ink-muted", showCommunity ? "text-[12px]" : "text-[13.5px]")}>
            <ProfileTrigger handle={p.author.handle} className={cx("truncate hover:underline", !showCommunity && "font-semibold text-ink")}>
              <UserName name={p.author.displayName} effect={p.author.nameEffect} />
            </ProfileTrigger>
            <span aria-hidden="true">·</span>
            <time dateTime={p.createdAt} className="shrink-0 text-[12px]">
              {now ? relativeStamp(p.createdAt, now) : ""}
            </time>
          </p>
        </div>
        {trending && !p.isMember && (
          <Button size="sm" variant="primary" loading={joining} onClick={() => void join()}>
            Join
          </Button>
        )}
        <OverflowMenu items={menu} label="Post options" />
      </header>

      {/* the caption leads, like a Reddit title */}
      {!style && p.caption && (
        <>
          <p className={cx("mt-2.5 text-[16px] leading-snug font-semibold break-words whitespace-pre-wrap text-ink", !more && long && "line-clamp-3")}>{p.caption}</p>
          {long && !more && (
            <button type="button" onClick={() => setMore(true)} className="mt-0.5 text-[13px] font-medium text-ink-muted hover:text-ink">
              more
            </button>
          )}
        </>
      )}

      {/* a tap opens the post; a double tap upvotes (a downvote turns up; an upvote is never taken back) */}
      {(p.media.length > 0 || style === "card") && (
        <div className="mt-3">
          <ExplicitCover explicit={p.explicit}>
            {p.media.length > 0 ? <FeedMedia media={p.media} onOpen={onOpenComments} onDoubleTap={() => p.myVote !== 1 && void vote(1)} /> : <TextCard post={p} onOpen={onOpenComments} onDoubleTap={() => p.myVote !== 1 && void vote(1)} />}
          </ExplicitCover>
        </div>
      )}
      {style === "long" && (
        <div className="mt-2.5">
          <ExplicitCover explicit={p.explicit}>
            <LongPost post={p} clamp onOpen={onOpenComments} />
          </ExplicitCover>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <VoteControl post={p} onChange={onChange} />
        <button type="button" onClick={onOpenComments} aria-label={`${p.commentCount} comments`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-raised/70 px-3.5 text-[13px] font-semibold text-ink-muted transition hover:bg-raised hover:text-ink">
          <Icon name="message" size={17} />
          <span className="font-mono tabular-nums">{compactCount(p.commentCount)}</span>
        </button>
        <ShareButton path={postHref(p)} text={p.title || p.caption ? `${(p.title || p.caption).slice(0, 80)} · ${p.community.name}` : `A post in ${p.community.name}`} variant="pill" size="sm" />
      </div>

      <ConfirmModal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this post?"
        description="The post, its votes and its comments are removed for everyone. This can't be undone."
        confirmLabel="Delete post"
        onConfirm={async () => {
          await FeedService.remove(p.community.slug, p.id);
          toast("Post deleted", "success");
          setDeleting(false);
          onRemoved();
        }}
      />
      <ReportDialog open={reporting} onClose={() => setReporting(false)} targetType="feedPost" targetId={p.id} subject="this post" />
    </article>
  );
}
