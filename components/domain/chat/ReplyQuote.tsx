"use client";

import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import type { ReplyRefDTO } from "@/lib/types";

/** The small quote above a reply: who, and the first words of what they said. Click to jump back to it. */
export function ReplyQuote({ reply, onJump, className }: { reply: ReplyRefDTO; onJump?: (id: string) => void; className?: string }) {
  return (
    <button type="button" onClick={() => onJump?.(reply.id)} className={cx("mb-0.5 flex max-w-full items-center gap-1.5 text-left text-[13px] text-ink-muted hover:text-ink", className)} aria-label={`In reply to ${reply.authorName}: ${reply.snippet}`}>
      <Icon name="reply" size={13} className="shrink-0 scale-x-[-1]" />
      <span className="shrink-0 font-semibold text-ink">{reply.authorName}</span>
      <span className={cx("truncate", reply.deleted && "italic")}>{reply.snippet}</span>
    </button>
  );
}

/** "Replying to Dami" strip shown over the composer. */
export function ReplyingTo({ name, snippet, onCancel }: { name: string; snippet: string; onCancel: () => void }) {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-control border border-line bg-surface px-3 py-1.5 text-[13px]">
      <Icon name="reply" size={14} className="shrink-0 text-accent-text" />
      <span className="min-w-0 flex-1 truncate">
        Replying to <b className="font-semibold">{name}</b> <span className="text-ink-muted">· {snippet}</span>
      </span>
      <button type="button" onClick={onCancel} aria-label="Cancel reply" className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink">
        <Icon name="x" size={13} />
      </button>
    </div>
  );
}
