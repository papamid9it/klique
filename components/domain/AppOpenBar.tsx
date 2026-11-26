"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { ANDROID_APP_URL, ANDROID_PACKAGE } from "@/lib/constants";

/** the pages the app can open (the same ones the app claims in its App Links) */
const IN_APP = /^\/(communities|events|kliques|p|messages)\//;
const KEY = "klique:app-bar-off";

/**
 * On an Android phone's browser, on a page the app has (a community, an event, a klique, a post): "Open in the Klique
 * app", like Reddit's. With the app it opens there; without it, the Play Store to get it (Android's intent link does
 * both). Closed once, it stays closed on this phone. Not in the desktop app, and never on iPhones (no app there yet).
 */
export function AppOpenBar() {
  const path = usePathname() ?? "/";
  const query = useSearchParams()?.toString() ?? "";
  const [show, setShow] = useState(false);
  useEffect(() => {
    let off = false;
    try {
      off = localStorage.getItem(KEY) === "1";
    } catch {
      // private browsing: just show it
    }
    setShow(!off && /Android/i.test(navigator.userAgent) && !/KliqueDesktop\//.test(navigator.userAgent) && IN_APP.test(path));
  }, [path]);
  if (!show) return null;
  const here = `${window.location.host}${path}${query ? `?${query}` : ""}`;
  const open = `intent://${here}#Intent;scheme=https;package=${ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(ANDROID_APP_URL)};end`;
  const close = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // nothing to remember it in: it just closes for now
    }
  };
  return (
    <div role="region" aria-label="Open in the Klique app" className="fixed inset-x-3 bottom-3 z-50 flex items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-xl" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-control bg-ink text-lg font-bold text-canvas">k</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Klique is better in the app</span>
        <span className="block text-[12.5px] text-ink-muted">Faster, with notifications</span>
      </span>
      <a href={open} className="inline-flex h-9 shrink-0 items-center rounded-full bg-ink px-4 text-sm font-semibold text-canvas">
        Open
      </a>
      <button type="button" onClick={close} aria-label="Not now" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-raised">
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
