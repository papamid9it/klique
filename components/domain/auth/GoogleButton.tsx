"use client";

import { AuthService } from "@/app/services/AuthService";

/**
 * "Continue with Google": a plain link, because the whole sign-in happens on Google's pages and comes back to
 * /api/auth/google/callback. Swap the round "G" for Google's official button artwork if you want their exact look.
 */
export function GoogleButton({ next, label = "Continue with Google" }: { next: string; label?: string }) {
  return (
    <a
      href={AuthService.googleUrl(next)}
      className="flex h-12 w-full items-center justify-center gap-3 rounded-[10px] border border-line bg-raised text-[15px] font-semibold text-ink transition hover:brightness-110 active:scale-[0.99]"
    >
      <span aria-hidden="true" className="inline-flex size-6 items-center justify-center rounded-full bg-white text-[13px] font-bold text-[#3c4043]">
        G
      </span>
      {label}
    </a>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-[11px] font-bold tracking-[0.12em] text-ink-muted uppercase" role="separator">
      <span className="h-px flex-1 bg-line" />
      or
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
