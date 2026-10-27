"use client";

import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { UploadService } from "@/app/services/UploadService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useMediaViewer } from "@/components/providers/MediaViewerProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { REACTIONS, STICKERS, reactionEmoji, stickerOf, type ReactionKind } from "@/lib/reactions";
import { stickerThumb, useStickers } from "@/lib/hooks/useStickers";
import { useUploadStatus } from "@/lib/hooks/useUploads";
import type { ReactionDTO } from "@/lib/types";
import { checkFile } from "@/lib/uploads";

export const MAX_STICKERS = 200;

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
          <span key={`${r.count}-${r.mine}`} className="emoji-pop text-[15px] leading-none">
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

/** What the sticker tray hands back: a built-in sticker, or one of your saved pictures. */
export type StickerChoice = { sticker?: string; stickerUrl?: string };

/** The sticker waiting in the composer, above the text box: sent with the message, or removed with the x. */
export function AttachedSticker({ choice, onRemove }: { choice: StickerChoice | null; onRemove: () => void }) {
  if (!choice) return null;
  const s = choice.sticker ? stickerOf(choice.sticker) : null;
  return (
    <div className="mb-2 flex">
      <span className="relative inline-flex size-16 items-center justify-center rounded-control border border-line bg-raised">
        {choice.stickerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={stickerThumb(choice.stickerUrl)} alt="Attached sticker" className="max-h-full max-w-full object-contain p-1" />
        ) : (
          <span role="img" aria-label={`${s?.label ?? "Attached"} sticker`} className="text-[34px] leading-none">
            {s?.emoji}
          </span>
        )}
        <button type="button" onClick={onRemove} aria-label="Remove sticker" className="absolute top-0.5 right-0.5 inline-flex size-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black">
          <Icon name="x" size={11} />
        </button>
      </span>
    </div>
  );
}

/**
 * A sticker as it appears in a conversation, without a bubble: a big, gently animated emoji, or a saved picture
 * (tap it to see it full size and save it to your own stickers).
 */
export function StickerView({ id, url, size = 72 }: { id?: string | null; url?: string | null; size?: number }) {
  const view = useMediaViewer();
  const [broken, setBroken] = useState(false);
  const quick = useQuickSave(url ?? "");
  if (url) {
    if (broken) return <span className="text-sm text-ink-muted italic">Sticker unavailable</span>;
    const box = Math.round(size * 2);
    return (
      <span className="group/stk relative inline-block" {...quick.handlers}>
        <button type="button" onClick={() => view([url])} aria-label="Sticker. Open it to save it" className="block cursor-zoom-in rounded-control transition active:scale-95">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={stickerThumb(url)} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setBroken(true)} style={{ maxWidth: box, maxHeight: box }} className="block h-auto w-auto object-contain drop-shadow-sm select-none [-webkit-touch-callout:none]" />
        </button>
        {quick.enabled && (
          <button
            type="button"
            onClick={quick.save}
            aria-label={quick.saved ? "Already saved to your stickers" : "Save sticker"}
            className={cx(
              "absolute -top-2 -right-2 inline-flex h-7 items-center gap-1 rounded-full border border-line bg-surface px-2 text-[11.5px] font-semibold shadow-md transition",
              "pointer-events-none opacity-0 group-hover/stk:pointer-events-auto group-hover/stk:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100",
              quick.saved ? "text-ink-muted" : "text-accent-text",
            )}
          >
            <Icon name={quick.saved ? "check" : "sticker"} size={13} /> {quick.saved ? "Saved" : "Save"}
          </button>
        )}
      </span>
    );
  }
  const s = stickerOf(id);
  if (!s) return <span className="text-sm text-ink-muted italic">Sticker</span>;
  const idx = STICKERS.findIndex((x) => x.id === id);
  return (
    <span role="img" aria-label={`${s.label} sticker`} className="emoji-live leading-none select-none" style={{ fontSize: size, animationDuration: `${2.2 + (idx % 5) * 0.35}s` }}>
      {s.emoji}
    </span>
  );
}

/**
 * "Save sticker" right on a picture sticker: a button on hover (desktop), right-click, or a long press (phones).
 * Says "Saved" once it's in your tray. Nothing when signed out.
 */
function useQuickSave(url: string) {
  const { user } = useAuth();
  const stickers = useStickers();
  const toast = useToast();
  const timer = useRef<number | undefined>(undefined);
  const saved = stickers.has(url);
  const save = () => {
    if (saved) return toast("Already in your stickers.");
    void stickers.save(url).then((err) => toast(err ?? "Saved to your stickers.", err ? "error" : "success"));
  };
  const cancel = () => window.clearTimeout(timer.current);
  return {
    enabled: !!user,
    saved,
    save,
    handlers: user
      ? {
          onContextMenu: (e: React.MouseEvent) => (e.preventDefault(), save()),
          onTouchStart: () => (cancel(), (timer.current = window.setTimeout(save, 550))),
          onTouchEnd: cancel,
          onTouchMove: cancel,
          onTouchCancel: cancel,
        }
      : {},
  };
}

/**
 * The sticker tray: your saved stickers (on your account, so the same on every device) and the built-in animated
 * ones. Picking one attaches it to the message being written (Send sends it). Upload your own with +, and use
 * Edit to reorder or remove.
 */
export function StickerPicker({ onPick, onClose, className }: { onPick: (s: StickerChoice) => void; onClose: () => void; className?: string }) {
  const ref = useDismiss(onClose);
  const saved = useStickers();
  const toast = useToast();
  const uploads = useUploadStatus();
  const [tab, setTab] = useState<"saved" | "emoji">(() => (saved.list.length ? "saved" : "emoji"));
  const [editing, setEditing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const file = useRef<HTMLInputElement>(null);

  async function upload(f: File | undefined) {
    if (!f) return;
    const problem = checkFile("photo", f);
    if (problem) return toast(problem, "error");
    setProgress(0);
    try {
      const up = await UploadService.upload("photo", f, { onProgress: setProgress });
      const err = await saved.save(up.url);
      if (err) toast(err, "error");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setProgress(null);
      if (file.current) file.current.value = "";
    }
  }

  // the tray may be stale on this device (counts change as you send): refresh when it opens
  useEffect(() => void saved.refresh(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const top = editing ? [] : saved.mostUsed;
  function attach(url: string) {
    saved.bump(url);
    onPick({ stickerUrl: url });
    onClose();
  }

  function move(id: string, by: number) {
    const ids = saved.list.map((x) => x.id);
    const at = ids.indexOf(id);
    const to = at + by;
    if (at < 0 || to < 0 || to >= ids.length) return;
    [ids[at], ids[to]] = [ids[to], ids[at]];
    void saved.reorder(ids).then((err) => err && toast(err, "error"));
  }

  const tabBtn = (id: "saved" | "emoji", label: string) => (
    <button type="button" role="tab" aria-selected={tab === id} onClick={() => (setTab(id), setEditing(false))} className={cx("rounded-full px-3 py-1 text-[13px] font-semibold transition", tab === id ? "bg-ink text-canvas" : "text-ink-muted hover:bg-raised hover:text-ink")}>
      {label}
    </button>
  );

  return (
    <div ref={ref} role="dialog" aria-label="Stickers" className={cx("z-30 w-[20rem] max-w-[calc(100vw-2rem)] rounded-card border border-line bg-surface p-2.5 shadow-2xl animate-pop", className)}>
      <div className="mb-2 flex items-center gap-1" role="tablist">
        {tabBtn("saved", "Saved")}
        {tabBtn("emoji", "Animated")}
        <span className="flex-1" />
        {tab === "saved" && saved.list.length > 0 && (
          <button type="button" onClick={() => setEditing((e) => !e)} aria-pressed={editing} className="rounded-full px-2.5 py-1 text-[12px] font-semibold text-accent-text hover:bg-raised">
            {editing ? "Done" : "Edit"}
          </button>
        )}
      </div>

      {tab === "emoji" ? (
        <div className="grid grid-cols-5 gap-1">
          {STICKERS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              title={s.label}
              aria-label={`Add ${s.label} sticker`}
              onClick={() => {
                onPick({ sticker: s.id });
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
      ) : (
        <>
          <div className="max-h-[19rem] overflow-y-auto overscroll-contain">
          {top.length > 0 && (
            <>
              <p className="eyebrow mb-1.5 px-1">Most used</p>
              <ul className="mb-3 grid grid-cols-4 gap-1.5">
                {top.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => attach(s.url)} aria-label="Add this sticker (one of your most used)" className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-control p-1 transition hover:bg-raised">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={stickerThumb(s.url)} alt="" loading="lazy" decoding="async" className="max-h-full max-w-full object-contain" />
                    </button>
                  </li>
                ))}
              </ul>
              {saved.list.length > top.length && <p className="eyebrow mb-1.5 px-1">More stickers</p>}
            </>
          )}
          <ul className="grid grid-cols-4 gap-1.5">
            {uploads?.photo && !editing && (
              <li>
                <input ref={file} type="file" hidden accept=".jpg,.jpeg,.png,.webp,.gif,.avif,.heic,.heif" onChange={(e) => void upload(e.target.files?.[0])} aria-label="Upload a sticker" />
                <button type="button" onClick={() => file.current?.click()} disabled={progress !== null} aria-label="Upload your own sticker" title="Upload your own" className="flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-control border border-dashed border-line text-ink-muted transition hover:border-ink-muted hover:text-ink">
                  {progress !== null ? <span className="font-mono text-xs">{Math.round(progress * 100)}%</span> : <Icon name="plus" size={20} />}
                </button>
              </li>
            )}
            {saved.list.map((s, i) => (
              <li key={s.id} className={cx("relative", top.some((x) => x.id === s.id) && "hidden")}>
                <button
                  type="button"
                  disabled={editing}
                  aria-label={editing ? `Sticker ${i + 1}` : `Add sticker ${i + 1}`}
                  onClick={() => attach(s.url)}
                  className={cx("flex aspect-square w-full items-center justify-center overflow-hidden rounded-control p-1 transition hover:bg-raised", editing && "bg-raised/60")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={stickerThumb(s.url)} alt="" loading="lazy" decoding="async" className="max-h-full max-w-full object-contain" />
                </button>
                {editing && (
                  <>
                    <button type="button" onClick={() => void saved.remove(s.id).then((err) => err && toast(err, "error"))} aria-label={`Remove sticker ${i + 1}`} className="absolute -top-1 -right-1 inline-flex size-6 items-center justify-center rounded-full bg-danger text-white shadow">
                      <Icon name="x" size={12} />
                    </button>
                    <span className="absolute inset-x-0 bottom-0 flex justify-between">
                      <button type="button" onClick={() => move(s.id, -1)} disabled={i === 0} aria-label="Move earlier" className="inline-flex size-6 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-0">
                        <Icon name="chevron-left" size={13} />
                      </button>
                      <button type="button" onClick={() => move(s.id, 1)} disabled={i === saved.list.length - 1} aria-label="Move later" className="inline-flex size-6 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-0">
                        <Icon name="chevron-right" size={13} />
                      </button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
          </div>
          {saved.list.length === 0 ? (
            <p className="px-1 pt-2 text-[12.5px] leading-snug text-ink-muted">Open any picture or GIF in a chat and tap Save as sticker{uploads?.photo ? ", or upload your own with +" : ""}. They&apos;re saved to your account, so they show on all your devices.</p>
          ) : (
            <p className="px-1 pt-2 font-mono text-[11px] text-ink-muted">
              {saved.list.length}/{MAX_STICKERS}
            </p>
          )}
        </>
      )}
    </div>
  );
}
