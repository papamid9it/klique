"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { LIMITS } from "@/lib/constants";

/**
 * Inline editor for one of your own messages, Discord-style: the text turns into a box in place,
 * Enter saves, Shift+Enter adds a line, Esc cancels. `onSave` returns an error message on failure
 * (the editor stays open and keeps your text).
 */
export function MessageEditor({ initial, onSave, onCancel, className, max = LIMITS.messageBody }: { initial: string; onSave: (body: string) => Promise<string | null>; onCancel: () => void; className?: string; max?: number }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const trimmed = text.trim();
  const unchanged = trimmed === initial.trim();

  async function save() {
    if (busy) return;
    if (!trimmed) {
      setErr("A message can't be empty. Cancel and delete it instead.");
      return;
    }
    if (unchanged) return onCancel();
    setBusy(true);
    setErr(null);
    const problem = await onSave(trimmed);
    setBusy(false);
    if (problem) setErr(problem);
  }

  return (
    <div className={className}>
      <label htmlFor="edit-message" className="sr-only">
        Edit message
      </label>
      <textarea
        id="edit-message"
        ref={ref}
        value={text}
        rows={2}
        maxLength={max}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void save();
          }
        }}
        style={{ fieldSizing: "content" } as React.CSSProperties}
        className="max-h-60 min-h-11 w-full resize-none rounded-control border border-accent-text bg-raised px-3.5 py-2.5 text-[15px] leading-relaxed text-ink"
      />
      {err && (
        <p role="alert" className="mt-1 text-xs font-medium text-danger">
          {err}
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <p className="mr-auto text-[11px] text-ink-muted">
          escape to <button type="button" onClick={onCancel} className="text-accent-text hover:underline">cancel</button> · enter to <button type="button" onClick={() => void save()} className="text-accent-text hover:underline">save</button>
        </p>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" onClick={() => void save()} loading={busy} disabled={!trimmed}>
          Save
        </Button>
      </div>
    </div>
  );
}

/** The small "(edited)" tag after a message's text. */
export function EditedTag({ at }: { at: string | null }) {
  if (!at) return null;
  return (
    <span title={`Edited ${new Date(at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" })}`} className="ml-1.5 text-[11px] text-ink-muted select-none">
      (edited)
    </span>
  );
}
