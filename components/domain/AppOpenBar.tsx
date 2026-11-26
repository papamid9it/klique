"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/layout/Logo";
import { ANDROID_APP_URL, ANDROID_PACKAGE } from "@/lib/constants";

/** the pages the app opens at the same place (the ones it claims in its App Links); Home opens the app's Home */
const IN_APP = /^\/(communities|events|kliques|p|messages)\//;
const KEY = "klique:app-sheet-seen";

/**
 * On an Android phone's browser (got here by typing the address, a search, or a link inside the site, where Android
 * doesn't hand the link to the app by itself): "See Klique in…  Klique app [Open] · Browser [Continue]", a sheet from
 * the bottom like Reddit's and Facebook's. Open goes to the same page in the app, or the Play Store without it (Android's
 * intent link does both). Once per visit: Continue keeps you in the browser until the browser is closed. Not in the
 * desktop app, and never on iPhones (no app there yet).
 */
export function AppOpenBar() {
  const path = usePathname() ?? "/";
  const query = useSearchParams()?.toString() ?? "";
  const [show, setShow] = useState(false);
  // Android: no Chrome "Install Klique" pop-up for the website (the sheet below offers the real app instead)
  useEffect(() => {
    if (!/Android/i.test(navigator.userAgent)) return;
    const stop = (e: Event) => e.preventDefault();
    window.addEventListener("beforeinstallprompt", stop);
    return () => window.removeEventListener("beforeinstallprompt", stop);
  }, []);
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(KEY) === "1";
    } catch {
      // private browsing: just show it
    }
    const android = /Android/i.test(navigator.userAgent) && !/KliqueDesktop\//.test(navigator.userAgent);
    setShow(!seen && android && (IN_APP.test(path) || path === "/"));
  }, [path]);
  if (!show) return null;

  const here = `${window.location.host}${path}${query ? `?${query}` : ""}`;
  const fallback = `S.browser_fallback_url=${encodeURIComponent(ANDROID_APP_URL)}`;
  // a page the app has: that page (https, like a tapped link); Home: just open the app (its own klique:// address)
  const open = IN_APP.test(path) ? `intent://${here}#Intent;scheme=https;package=${ANDROID_PACKAGE};${fallback};end` : `intent:///#Intent;scheme=klique;package=${ANDROID_PACKAGE};${fallback};end`;
  const done = () => {
    setShow(false);
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      // nothing to remember it in: it just closes for now
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/55" onClick={done}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="See Klique in the app or the browser"
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-[16px] border-t border-line bg-surface px-5 pt-3 pb-5 animate-rise"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" aria-hidden="true" />
        <p className="pb-3 text-[17px] font-bold text-ink">See Klique in…</p>
        <div className="flex items-center gap-3 py-2.5">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-control bg-ink text-canvas">
            <LogoMark size={26} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-semibold text-ink">Klique app</span>
            <span className="block text-[13px] text-ink-muted">Faster, with notifications</span>
          </span>
          <a href={open} onClick={done} className="inline-flex h-10 w-28 shrink-0 items-center justify-center rounded-control bg-ink text-[15px] font-semibold text-canvas">
            Open
          </a>
        </div>
        <div className="flex items-center gap-3 py-2.5">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-control bg-raised text-ink-muted" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.4 3.7 5.2 3.7 8.5s-1.2 6.1-3.7 8.5c-2.5-2.4-3.7-5.2-3.7-8.5S9.5 5.9 12 3.5z" /></svg>
          </span>
          <span className="min-w-0 flex-1 text-[16px] font-semibold text-ink">Browser</span>
          <button type="button" onClick={done} className="inline-flex h-10 w-28 shrink-0 items-center justify-center rounded-control border border-line text-[15px] font-semibold text-ink hover:bg-raised">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
