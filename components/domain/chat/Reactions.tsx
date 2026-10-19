"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { REACTIONS, STICKERS, reactionEmoji, stickerOf, type ReactionKind } from "@/lib/reactions";
import type { ReactionDTO } from "@/lib/types";

/** Closes a popover on outside press or Escape. */
function useDismiss(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [onClose]);
  return ref;
}

/** The row of reactions you can pick from. */
export function ReactionPicker({ onPick, onClose, className }: { onPick: (k: ReactionKind) => void; onClose: () => void; className?: string }) {
  const ref = useDismiss(onClose);
  return (
    <div ref={ref} role="menu" aria-label="Pick a reaction" className={cx("z-30 flex gap-0.5 rounded-full border border-line bg-surface p-1 shadow-2xl animate-pop", className)}>
      {REACTIONS.map((r) => (
        <button
          key={r.id}
          type="button"
          role="menuitem"
          title={r.label}
          aria-label={r.label}
          onClick={() => {
            onPick(r.id);
            onClose();
          }}
          className="inline-flex size-9 items-center justify-center rounded-full text-[21px] transition hover:bg-raised"
        >
          <span className="emoji-hover">{r.emoji}</span>
        </button>
      ))}
    </div>
  );
}

/** Reaction chips under a message plus an add button. `canReact` false hides the add button and makes chips read-only. */
export function ReactionBar({ reactions, onToggle, canReact, mine, className }: { reactions: ReactionDTO[]; onToggle: (k: ReactionKind) => void; canReact: boolean; mine?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!reactions.length) return null;
  return (
    <div className={cx("relative mt-1 flex flex-wrap items-center gap-1", mine && "justify-end", className)}>
      {reactions.map((r) => (
        <button
          key={r.kind}
          type="button"
          disabled={!canReact}
          onClick={() => onToggle(r.kind)}
          aria-pressed={r.mine}
          aria-label={`${r.kind}, ${r.count}${r.mine ? ", you reacted" : ""}`}
          className={cx("inline-flex h-7 items-center gap-1 rounded-full border px-2 text-[13px] transition", r.mine ? "border-accent-text bg-accent/15 text-ink" : "border-line bg-surface text-ink-muted hover:border-ink-muted", !canReact && "cursor-default")}
        >
          <span key={r.count} className="emoji-pop text-[15px] leading-none">
            {reactionEmoji(r.kind)}
          </span>
          <span className="font-mono text-[12px]">{r.count}</span>
        </button>
      ))}
      {canReact && (
        <span className="relative">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Add reaction" aria-expanded={open} className="inline-flex size-7 items-center justify-center rounded-full border border-line text-ink-muted transition hover:border-ink-muted hover:text-ink">
            <Icon name="smile" size={14} />
          </button>
          {open && <ReactionPicker onPick={onToggle} onClose={() => setOpen(false)} className={cx("absolute bottom-full mb-1", mine ? "right-0" : "left-0")} />}
        </span>
      )}
    </div>
  );
}

/** A small button that opens the reaction picker (used in a message's hover toolbar). */
export function ReactButton({ onPick, className, align = "right" }: { onPick: (k: ReactionKind) => void; className?: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={cx("relative inline-flex", className)}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Add reaction" aria-expanded={open} className="inline-flex size-8 items-center justify-center rounded-full text-ink-muted transition hover:bg-raised hover:text-ink">
        <Icon name="smile" size={16} />
      </button>
      {open && <ReactionPicker onPick={onPick} onClose={() => setOpen(false)} className={cx("absolute bottom-full mb-1", align === "right" ? "right-0" : "left-0")} />}
    </span>
  );
}

/** A sticker as it appears in a conversation: big, gently animated emoji. */
export function StickerView({ id, size = 72 }: { id: string; size?: number }) {
  const s = stickerOf(id);
  if (!s) return <span className="text-sm text-ink-muted italic">Sticker</span>;
  const idx = STICKERS.findIndex((x) => x.id === id);
  return (
    <span role="img" aria-label={`${s.label} sticker`} className="emoji-live leading-none select-none" style={{ fontSize: size, animationDuration: `${2.2 + (idx % 5) * 0.35}s` }}>
      {s.emoji}
    </span>
  );
}

/** Grid of stickers; picking one sends it straight away. */
export function StickerPicker({ onPick, onClose, className }: { onPick: (id: string) => void; onClose: () => void; className?: string }) {
  const ref = useDismiss(onClose);
  return (
    <div ref={ref} role="dialog" aria-label="Stickers" className={cx("z-30 w-[19rem] max-w-[calc(100vw-2rem)] rounded-card border border-line bg-surface p-2.5 shadow-2xl animate-pop", className)}>
      <p className="eyebrow mb-2 px-1">Stickers</p>
      <div className="grid grid-cols-5 gap-1">
        {STICKERS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            title={s.label}
            aria-label={`Send ${s.label} sticker`}
            onClick={() => {
              onPick(s.id);
              onClose();
            }}
            className="inline-flex aspect-square items-center justify-center rounded-control text-[30px] transition hover:bg-raised"
          >
            <span className="emoji-live" style={{ animationDuration: `${2.2 + (i % 5) * 0.35}s`, animationDelay: `${(i % 7) * -0.3}s` }}>
              {s.emoji}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
