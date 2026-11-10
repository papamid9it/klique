"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { isInstalledWebApp } from "@/lib/hooks/useInstalledWebApp";

const KEY = "klique.desktopPrompt.hiddenUntil";
const DAYS_30 = 30 * 24 * 60 * 60 * 1000;

/**
 * A small card on Home in a desktop browser: "Get Klique for Windows / Mac / Linux". Macs only once the release has Mac files. Never on phones or tablets,
 * never inside the desktop app itself; "Not now" hides it for 30 days.
 */
export function DesktopPrompt() {
  const [os, setOs] = useState<"Windows" | "Mac" | "Linux" | null>(null);
  useEffect(() => {
    try {
      // not in the desktop app, nor in Klique installed from the browser
      if ((window as unknown as { kliqueDesktop?: unknown }).kliqueDesktop || isInstalledWebApp()) return;
      if (Number(localStorage.getItem(KEY) ?? 0) > Date.now()) return;
    } catch {
      /* storage blocked: just show it */
    }
    const ua = navigator.userAgent;
    // iPads report themselves as a Mac: a touch screen gives them away
    if (/Android|iPhone|iPad|Mobile/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return;
    if (/Windows/i.test(ua)) setOs("Windows");
    else if (/Linux|X11/i.test(ua)) setOs("Linux");
    else if (/Macintosh|Mac OS X/i.test(ua)) {
      // Macs only once there's a Mac download
      let gone = false;
      fetch("/api/app/version")
        .then((r) => (r.ok ? r.json() : null))
        .then((v: { downloads?: { mac?: string | null; macIntel?: string | null } } | null) => !gone && (v?.downloads?.mac || v?.downloads?.macIntel) && setOs("Mac"))
        .catch(() => {});
      return () => {
        gone = true;
      };
    }
  }, []);
  if (!os) return null;
  return (
    <section aria-labelledby="desktop-app" className="relative overflow-hidden rounded-card border border-line bg-surface p-5">
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.setItem(KEY, String(Date.now() + DAYS_30));
          } catch {
            /* ignore */
          }
          setOs(null);
        }}
        aria-label="Not now"
        title="Not now"
        className="absolute top-3 right-3 inline-flex size-7 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink"
      >
        <Icon name="x" size={14} />
      </button>
      <p className="eyebrow">Desktop app</p>
      <h2 id="desktop-app" className="mt-2 pr-6 text-[15px] leading-snug font-semibold">
        Get Klique for {os}
      </h2>
      <p className="mt-1 text-[13px] text-ink-muted">Its own window, and notifications even with the browser closed.</p>
      <Link href="/download" className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-canvas transition hover:opacity-90">
        <Icon name="download" size={14} /> Download
      </Link>
    </section>
  );
}
