"use client";

import { useEffect, useRef } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import type { UserBrief } from "@/lib/types";

/** How often a feed on screen looks for newer posts (and straight away on coming back to the tab after that). */
export const NEWER_EVERY_MS = 60_000;

type Shown = { id: string; createdAt: string; author: UserBrief };

/**
 * Newer posts than the newest one on screen? A look at the first page every minute while the tab is in view, and
 * again on coming back to it. Reports who posted (empty: nothing new), and clears when the list starts over.
 * `shown`: the posts on screen that count (Home leaves out trending posts from elsewhere).
 */
export function useNewerPosts(shown: Shown[] | null, firstPage: () => Promise<Shown[]>, onNewer: (authors: UserBrief[]) => void, enabled = true) {
  const shownRef = useRef(shown);
  const firstRef = useRef(firstPage);
  const onRef = useRef(onNewer);
  useEffect(() => {
    shownRef.current = shown;
    firstRef.current = firstPage;
    onRef.current = onNewer;
  });
  const topId = shown?.[0]?.id;
  useEffect(() => onRef.current([]), [topId]); // a fresh list: nothing new any more
  useEffect(() => {
    if (!enabled) return;
    let gone = false;
    let last = Date.now();
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const list = shownRef.current;
      if (!list?.length) return;
      last = Date.now();
      const ids = new Set(list.map((x) => x.id));
      const newest = Math.max(...list.map((x) => Date.parse(x.createdAt)));
      try {
        const page = await firstRef.current();
        if (gone) return;
        onRef.current(page.filter((x) => !ids.has(x.id) && Date.parse(x.createdAt) > newest).map((x) => x.author));
      } catch {
        /* offline for a moment: try again next time */
      }
    };
    const t = setInterval(() => void check(), NEWER_EVERY_MS);
    const back = () => document.visibilityState === "visible" && Date.now() - last > NEWER_EVERY_MS && void check();
    document.addEventListener("visibilitychange", back);
    return () => {
      gone = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", back);
    };
  }, [enabled]);
}

/** "↑ New posts" with the faces of up to three who posted, like X. */
export function NewPostsPill({ authors, onClick, className }: { authors: UserBrief[]; onClick: () => void; className?: string }) {
  if (!authors.length) return null;
  const faces = authors.filter((u, i) => authors.findIndex((x) => x.id === u.id) === i).slice(0, 3);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "inline-flex h-9 animate-rise items-center gap-2 rounded-full bg-accent pr-4 pl-2 text-[13px] font-semibold tracking-normal text-accent-ink normal-case shadow-[0_8px_24px_-10px_rgba(0,0,0,0.5)] transition hover:brightness-110",
        className,
      )}
    >
      <span className="flex -space-x-1.5">
        {faces.map((u) => (
          <Avatar key={u.id} name={u.displayName} src={u.avatarUrl} size={22} className="ring-2 ring-accent" />
        ))}
      </span>
      <Icon name="arrowdown" size={14} className="rotate-180" />
      New posts
    </button>
  );
}

/**
 * The usual ways to refresh a feed that's on screen: F5 / Ctrl+R (the desktop app, which has no menu to do it),
 * and clicking the link to the page you're already on (Home, the logo, a community's Posts), like X.
 * `isHere(a)`: whether that link is this page.
 */
export function useRefreshKeys(refresh: () => void, opts: { inApp: boolean; isHere: (a: HTMLAnchorElement) => boolean }) {
  const ref = useRef({ refresh, isHere: opts.isHere });
  useEffect(() => {
    ref.current = { refresh, isHere: opts.isHere };
  });
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.origin !== window.location.origin || !ref.current.isHere(a)) return;
      e.preventDefault();
      ref.current.refresh();
    };
    // capture phase: before the link's own handler, which would otherwise just "navigate" to the page we're on
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  useEffect(() => {
    if (!opts.inApp) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "r")) {
        e.preventDefault();
        ref.current.refresh();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opts.inApp]);
}
