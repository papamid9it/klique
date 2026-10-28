"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { FeedService } from "@/app/services/FeedService";
import { PostView } from "@/components/domain/feed/PostDialog";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { cx } from "@/components/ui/cx";
import { textStyleOf } from "@/lib/feedText";
import { useApi } from "@/lib/hooks/useApi";
import { useAuth } from "@/components/providers/AuthProvider";

const loginLinks = (next: string) => (
  <div className="flex shrink-0 gap-2">
    <Link href={`/login?next=${encodeURIComponent(next)}`} className="inline-flex h-9 items-center rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink">
      Log in
    </Link>
    <Link href={`/signup?next=${encodeURIComponent(next)}`} className="inline-flex h-9 items-center rounded-full border border-line px-4 text-sm font-semibold hover:bg-raised">
      Sign up
    </Link>
  </div>
);

function PostContent() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const { status: auth, requireAuth } = useAuth();
  const { data: post, loading, error, status, setData } = useApi(() => FeedService.byId(id), [id], { key: `post:${id}` });
  const here = `/p/${id}`;

  if (loading) return <Skeleton className="h-[min(calc(100dvh-10rem),46rem)] rounded-card" />;
  // signed out and it isn't public (or it's gone): say nothing about which, and offer to log in
  if (!post && auth === "anon") {
    return (
      <div className="mx-auto max-w-md rounded-card border border-line bg-surface p-8 text-center">
        <h1 className="text-lg font-semibold">Log in to see this post</h1>
        <p className="mt-1.5 text-sm text-ink-muted">It may be in a private community, or for members only.</p>
        <div className="mt-5 flex justify-center">{loginLinks(here)}</div>
      </div>
    );
  }
  if (!post) {
    return (
      <div className="mx-auto max-w-md rounded-card border border-line bg-surface p-8 text-center">
        <h1 className="text-lg font-semibold">{status === 404 ? "This post is gone" : "You can't see this post"}</h1>
        <p className="mt-1.5 text-sm text-ink-muted">{status === 404 ? "It was deleted, or the link is wrong." : error}</p>
        <Link href="/" className="mt-5 inline-flex h-9 items-center rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink">
          Back home
        </Link>
      </div>
    );
  }
  const long = textStyleOf(post) === "long";
  return (
    <div className={cx("mx-auto space-y-3", long ? "max-w-[680px]" : "max-w-[1040px]")}>
      {auth === "anon" && (
        // Instagram's invitation, for visitors without an account
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3">
          <p className="text-sm">
            <span className="font-semibold">See more from {post.community.name} on Klique.</span> <span className="text-ink-muted">Log in or sign up to vote, comment and join.</span>
          </p>
          {loginLinks(here)}
        </div>
      )}
      <Link
        href={`/communities/${post.community.slug}?view=posts`}
        onClick={(e) => {
          if (auth === "anon") {
            e.preventDefault();
            requireAuth();
          }
        }}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
      >
        <Icon name="arrow-left" size={15} /> {post.community.name}
      </Link>
      {/* the same layout as the pop-up over a feed, as the page itself */}
      <div className="h-[calc(100dvh-13rem)] min-h-[560px] overflow-hidden rounded-card border border-line bg-surface lg:h-[min(calc(100dvh-9rem),46rem)]">
        <PostView post={post} onChange={(p) => setData(p)} focusComment={sp.get("c")} />
      </div>
    </div>
  );
}

/** A post on its own page (/p/[id]): a shared link, a notification, or a refresh while it was open over a feed. */
export function PostPageView() {
  return (
    <Suspense fallback={null}>
      <PostContent />
    </Suspense>
  );
}
