"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { whatsappShareUrl } from "@/lib/format";

/** Absolute URL for a path, using the page's own origin (works on any deployment). */
export function absoluteUrl(path: string) {
  const base = typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL ?? "");
  return base.replace(/\/$/, "") + path;
}

/**
 * Share menu: WhatsApp (the primary route in Nigeria), copy link, and the device share sheet where available.
 */
export function ShareButton({
  path,
  text,
  label = "Share",
  variant = "secondary",
  size = "md",
  iconOnly,
}: {
  path: string;
  /** the message sent before the link, e.g. "Push Lagos: Open skate — Sun 18 Oct" */
  text: string;
  label?: string;
  /** "pill": the round grey pill in a post's action row */
  variant?: "secondary" | "ghost" | "ink" | "primary" | "pill";
  size?: "sm" | "md";
  iconOnly?: boolean;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function copy() {
    const url = absoluteUrl(path);
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied", "success");
    } catch {
      window.prompt("Copy this link", url);
    }
    setOpen(false);
  }

  const item = "flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-raised";

  return (
    <div ref={wrap} className="relative inline-block">
      {variant === "pill" ? (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={iconOnly ? label : undefined} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-raised/70 px-3.5 text-[13px] font-semibold text-ink-muted transition hover:bg-raised hover:text-ink">
          <Icon name="share" size={16} />
          {!iconOnly && label}
        </button>
      ) : (
        <Button variant={variant} size={size} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={iconOnly ? label : undefined} className={iconOnly ? "px-0 aspect-square" : ""}>
          <Icon name="share" size={size === "sm" ? 14 : 16} />
          {!iconOnly && label}
        </Button>
      )}
      {open && (
        <div role="menu" className={cx("absolute z-50", variant === "pill" ? "left-0" : "right-0", " mt-2 w-60 animate-pop rounded-card border border-line bg-surface p-1.5 shadow-2xl")}>
          <a role="menuitem" href={whatsappShareUrl(text, absoluteUrl(path))} target="_blank" rel="noopener noreferrer" data-leave-ok onClick={() => setOpen(false)} className={item}>
            <span className="inline-flex size-7 items-center justify-center rounded-full bg-[#25D366] text-[#06260f]">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                <path d="M12.04 2a9.9 9.9 0 0 0-8.5 14.9L2 22l5.25-1.38A9.9 9.9 0 1 0 12.04 2zm5.8 14.1c-.25.7-1.45 1.33-2 1.4-.52.07-1.17.1-1.9-.12a17 17 0 0 1-1.7-.63c-3-1.3-4.94-4.3-5.1-4.5-.14-.2-1.2-1.6-1.2-3.05 0-1.45.76-2.16 1.03-2.46.27-.3.6-.37.8-.37h.57c.18 0 .43-.07.67.52.25.6.85 2.07.92 2.22.08.15.13.33.03.52-.1.2-.15.32-.3.5l-.45.5c-.15.15-.3.31-.13.6.17.3.77 1.27 1.65 2.06 1.13 1 2.08 1.32 2.38 1.47.3.15.47.12.65-.07.17-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.28.1 1.75.83 2.05.98.3.15.5.22.57.35.08.12.08.72-.17 1.42z" />
              </svg>
            </span>
            Share on WhatsApp
          </a>
          <button type="button" role="menuitem" onClick={copy} className={item}>
            <span className="inline-flex size-7 items-center justify-center rounded-full bg-raised">
              <Icon name="copy" size={14} />
            </span>
            Copy link
          </button>
          {canNativeShare && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void navigator.share({ title: text, text, url: absoluteUrl(path) }).catch(() => {});
              }}
              className={item}
            >
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-raised">
                <Icon name="share" size={14} />
              </span>
              More options…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
