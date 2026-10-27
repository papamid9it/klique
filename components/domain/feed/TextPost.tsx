"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { textBackground } from "@/lib/feedText";
import type { FeedPostDTO } from "@/lib/types";

/** Shorter text sets bigger, so a one-liner fills the card and the longest still fits. */
const sizeFor = (n: number) => (n <= 40 ? "text-[30px]" : n <= 90 ? "text-[24px]" : n <= 160 ? "text-[20px]" : "text-[17px]");

/**
 * A short text post as a card: its text on the colour the poster picked (4:3, at most 440px tall), in the picture's place.
 * In the feed (`onOpen`) one tap opens the post; two quick taps upvote with a heart where you tapped, like a picture.
 */
export function TextCard({ post, onOpen, onDoubleTap, className }: { post: Pick<FeedPostDTO, "caption" | "textBg">; onOpen?: () => void; onDoubleTap?: () => void; className?: string }) {
  const bg = textBackground(post.textBg);
  const box = useRef<HTMLDivElement>(null);
  const lastTap = useRef(0);
  const single = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number }[]>([]);
  const burstId = useRef(0);
  useEffect(() => () => void (single.current && clearTimeout(single.current)), []);

  const tap = (e: React.MouseEvent) => {
    if (!onDoubleTap) return onOpen?.();
    const now = e.timeStamp;
    if (now - lastTap.current < 250) {
      lastTap.current = now;
      if (single.current) clearTimeout(single.current);
      single.current = null;
      onDoubleTap();
      const r = box.current?.getBoundingClientRect();
      const id = ++burstId.current;
      setBursts((b) => [...b, { id, x: r ? e.clientX - r.left : 0, y: r ? e.clientY - r.top : 0 }]);
      setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 800);
      return;
    }
    lastTap.current = now;
    single.current = setTimeout(() => {
      single.current = null;
      onOpen?.();
    }, 250);
  };

  return (
    <div ref={box} onClick={tap} role={onOpen ? "button" : undefined} tabIndex={onOpen ? 0 : undefined} onKeyDown={(e) => onOpen && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())} aria-label={onOpen ? "Open the post" : undefined} className={cx("relative flex aspect-[4/3] max-h-[440px] w-full max-w-full items-center justify-center overflow-hidden rounded-control px-7 text-center select-none", onOpen && "cursor-pointer", className)} style={{ background: bg.css, color: bg.ink }}>
      <p className={cx("max-w-full leading-[1.18] font-bold tracking-[-0.02em] [overflow-wrap:anywhere] whitespace-pre-wrap", sizeFor(post.caption.length))}>{post.caption}</p>
      {bursts.map((b) => (
        // Instagram's heart (it counts as an upvote)
        <span key={b.id} className="vote-burst pointer-events-none absolute inline-flex size-24 items-center justify-center text-[#ff3040] drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]" style={{ left: b.x - 48, top: b.y - 48 }} aria-hidden="true">
          <Icon name="heart" size={88} className="fill-current" />
        </span>
      ))}
    </div>
  );
}

/** A long text post, Reddit style: its title, then the text (`clamp`: the first lines, with Read more to open it). */
export function LongPost({ post, clamp, onOpen }: { post: Pick<FeedPostDTO, "title" | "caption">; clamp?: boolean; onOpen?: () => void }) {
  return (
    <div className="space-y-1.5">
      {post.title && <h3 className={cx("text-[18px] leading-snug font-semibold tracking-[-0.01em] [overflow-wrap:anywhere] text-ink", clamp && onOpen && "cursor-pointer hover:underline")} onClick={clamp ? onOpen : undefined}>{post.title}</h3>}
      <p className={cx("text-[14.5px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-ink/85", clamp && "line-clamp-4")}>{post.caption}</p>
      {clamp && onOpen && post.caption.length > 180 && (
        <button type="button" onClick={onOpen} className="text-[13px] font-semibold text-ink-muted hover:text-ink">
          Read more
        </button>
      )}
    </div>
  );
}
