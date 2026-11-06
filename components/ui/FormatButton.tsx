"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { applyFormat, FORMAT_TOOLS, type FormatKind } from "@/lib/textFormat";
import { cx } from "./cx";

const LOOK: Partial<Record<FormatKind, string>> = { bold: "font-bold", italic: "italic", underline: "underline", strike: "line-through", code: "font-mono text-[12px]" };
const KEYS: Record<string, FormatKind> = { b: "bold", i: "italic", u: "underline" };

/**
 * The Aa button beside a text box: bold, italic and the rest in a little bar above it. Also Ctrl/Cmd + B, I or U while
 * typing. Works on what's selected, or starts the style at the cursor.
 */
export function FormatButton({ area, value, onChange, className }: { area: RefObject<HTMLTextAreaElement | null>; value: string; onChange: (next: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };

  const apply = (kind: FormatKind) => {
    const el = area.current;
    if (!el) return;
    const next = applyFormat(latest.current.value, el.selectionStart ?? 0, el.selectionEnd ?? 0, kind);
    latest.current.onChange(next.value);
    // once the box has the new words
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.start, next.end);
    });
  };

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      const kind = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey ? KEYS[e.key.toLowerCase()] : undefined;
      if (!kind) return;
      e.preventDefault();
      apply(kind);
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply reads the latest words from a ref
  }, [area]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  return (
    <span ref={box} className={cx("relative inline-flex shrink-0", className)}>
      {open && (
        <span role="toolbar" aria-label="Text style" className="absolute bottom-full left-0 z-20 mb-2 flex items-center gap-0.5 rounded-control border border-line bg-surface p-1 shadow-lg">
          {FORMAT_TOOLS.map((t) => (
            // keeps the selection in the box: the press never takes the focus away from it
            <button key={t.id} type="button" aria-label={t.label} title={t.label} onPointerDown={(e) => e.preventDefault()} onClick={() => apply(t.id)} className={cx("inline-flex size-9 items-center justify-center rounded-control text-[15px] text-ink transition hover:bg-raised", LOOK[t.id])}>
              {t.hint}
            </button>
          ))}
        </span>
      )}
      <button type="button" aria-label="Text style" aria-expanded={open} title="Text style" onPointerDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)} className={cx("inline-flex size-10 items-center justify-center rounded-full text-[15px] font-semibold transition hover:bg-raised", open ? "bg-raised text-ink" : "text-ink-muted hover:text-ink")}>
        Aa
      </button>
    </span>
  );
}
