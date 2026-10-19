"use client";

import { Fragment, useState, type ReactNode } from "react";
import { errorMessage } from "@/app/ApiCore";
import { useToast } from "@/components/providers/ToastProvider";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { compactCount } from "@/lib/format";

const URL_RX = /(https?:\/\/[^\s<]+)/g;

/** Plain text with clickable links. Never injects HTML. */
export function Linkified({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RX)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const url = m[1].replace(/[.,!?;:)\]]+$/, "");
    out.push(
      <a key={at} href={url} target="_blank" rel="noopener noreferrer nofollow ugc" className="break-all text-accent-text underline underline-offset-2 hover:opacity-80">
        {url}
      </a>,
    );
    out.push(m[1].slice(url.length));
    last = at + m[1].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out.map((n, i) => (typeof n === "string" ? <Fragment key={`t${i}`}>{n}</Fragment> : n))}</>;
}

/**
 * Heart + count. Flips at once, then takes the server's count (rolled back if it fails).
 * `onToggle` returns the server state; `onChange` lets the parent keep its copy in step.
 */
export function LikeButton({
  liked,
  count,
  canLike,
  onToggle,
  onChange,
  size = "md",
  label = "Like",
}: {
  liked: boolean;
  count: number;
  canLike: boolean;
  onToggle: () => Promise<{ liked: boolean; likeCount: number }>;
  onChange: (next: { liked: boolean; likeCount: number }) => void;
  size?: "sm" | "md";
  label?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function click() {
    if (busy) return;
    setBusy(true);
    const before = { liked, likeCount: count };
    onChange({ liked: !liked, likeCount: Math.max(0, count + (liked ? -1 : 1)) });
    try {
      onChange(await onToggle());
    } catch (e) {
      onChange(before);
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void click()}
      disabled={!canLike}
      aria-pressed={liked}
      aria-label={`${label}${count ? `, ${count} likes` : ""}`}
      title={canLike ? (liked ? "Unlike" : label) : "Join to like"}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full font-semibold transition disabled:cursor-default",
        size === "sm" ? "h-7 px-2 text-[12px]" : "h-8 px-2.5 text-[13px]",
        liked ? "bg-accent/15 text-accent-text" : "text-ink-muted hover:bg-raised hover:text-ink disabled:hover:bg-transparent disabled:hover:text-ink-muted",
      )}
    >
      <Icon name="heart" size={size === "sm" ? 14 : 16} className={cx(liked && "fill-current")} />
      <span className="font-mono tabular-nums">{count > 0 ? compactCount(count) : liked ? 1 : ""}</span>
      {count === 0 && !liked && <span className="sr-only">Like</span>}
    </button>
  );
}
