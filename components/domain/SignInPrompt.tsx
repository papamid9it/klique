"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { LogoArt, TAGLINE } from "@/lib/brand-logo";
import { Icon } from "@/components/ui/Icon";

const MOOD = { ink: "var(--ink)", accent: "var(--accent)", accent2: "var(--accent2)" };

/**
 * "Log in or sign up to Klique", Instagram style: what a signed-out visitor sees when they try something that needs
 * an account (vote, comment, react, join…). Both buttons come back to `next` (where they were) afterwards.
 */
export function SignInPrompt({ next, onClose }: { next: string | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = next !== null;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const q = `?next=${encodeURIComponent(next ?? "/")}`;
  return (
    <dialog
      ref={ref}
      aria-label="Log in or sign up to Klique"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-card border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      {open && (
        <div className="relative flex flex-col items-center px-6 pt-9 pb-6 text-center">
          <button type="button" onClick={onClose} aria-label="Close" className="absolute top-2.5 right-2.5 inline-flex size-9 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink">
            <Icon name="x" size={18} />
          </button>
          <LogoArt height={46} colors={MOOD} title="Klique" />
          <p className="mt-2 font-mono text-[10.5px] font-medium tracking-[0.3em] text-ink-muted">{TAGLINE}</p>
          <h2 className="mt-6 text-lg font-semibold tracking-tight">Log in or sign up to Klique</h2>
          <p className="mt-1.5 text-sm text-ink-muted">See what your city&apos;s scenes are up to, vote, comment and join communities.</p>
          <div className="mt-6 grid w-full gap-2">
            <Link href={`/login${q}`} onClick={onClose} className="inline-flex h-11 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-ink transition hover:opacity-90">
              Log in
            </Link>
            <Link href={`/signup${q}`} onClick={onClose} className="inline-flex h-11 items-center justify-center rounded-full border border-line text-sm font-semibold transition hover:bg-raised">
              Sign up
            </Link>
          </div>
        </div>
      )}
    </dialog>
  );
}
