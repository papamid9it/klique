"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { MobileNav } from "./MobileNav";
import { MobileTopBar } from "./MobileTopBar";
import { RightRail } from "./RightRail";
import { VerifyBanner } from "./VerifyBanner";
import { CommunityPreloader } from "./CommunityPreloader";
import { Sidebar } from "./Sidebar";
import { HomePanel } from "./HomePanel";
import { usePagePath } from "@/lib/nav";

/** /communities/<slug> (not /communities/new) is the chat workspace and owns its own panes; so does a crew (its chat). */
const isWorkspace = (p: string) => /^\/communities\/(?!new$)[^/]+\/?$/.test(p) || /^\/crews\/[^/]+\/?$/.test(p) || p === "/messages" || p.startsWith("/messages/");

const SKIP =
  "sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[200] focus:rounded-control focus:bg-ink focus:px-4 focus:py-2 focus:text-canvas";

/**
 * Home and other top-level pages: home panel (main nav) · content; the home feed also gets a suggestions rail.
 * Mobile: top bar + bottom tabs. Community pages: slim nav · [channels · chat · community info] — the right side is the page's own
 * content, not a fixed rail, so it can show whatever that page needs.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, status } = useAuth();
  // Not finished joining (new, or an older account that never did it): /welcome first, once.
  const mustOnboard = status === "authed" && !!user && !user.onboarded && pathname !== "/welcome";
  useEffect(() => {
    // ?why=finish: the welcome page says why they're back there instead of silently bouncing them
    if (mustOnboard) router.replace("/welcome?why=finish");
  }, [mustOnboard, router]);
  if (mustOnboard) return null;
  // /welcome is a full-screen flow of its own
  if (pathname === "/welcome") return <>{children}</>;
  return (
    <>
      <CommunityPreloader />
      <Shell>{children}</Shell>
    </>
  );
}

function Shell({ children }: { children: ReactNode }) {
  // the page on screen (under an open post's /p/[id] link, the feed it was opened from)
  const pathname = usePagePath();

  // Settings is a full-screen surface of its own (categories · page), like Discord's.
  if (pathname === "/settings" || pathname === "/settings/") return <>{children}</>;
  // So is the admin console, with its own menu.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return <>{children}</>;

  if (isWorkspace(pathname)) {
    return (
      <div className="min-h-dvh lg:grid lg:grid-cols-[76px_minmax(0,1fr)]">
        <a href="#main" className={SKIP}>
          Skip to content
        </a>
        <Sidebar />
        <main id="main" className="h-dvh min-w-0">
          {children}
        </main>
        {/* phones: the Messages list is a page of its own, so it keeps the bottom tabs */}
        {(pathname === "/messages" || pathname === "/messages/") && <MobileNav />}
      </div>
    );
  }

  // Ads Manager brings its own left panel: icon rail · its panel · page.
  if (/^\/ads(\/|$)/.test(pathname)) {
    return (
      <div className="min-h-dvh lg:grid lg:grid-cols-[76px_minmax(0,1fr)]">
        <a href="#main" className={SKIP}>
          Skip to content
        </a>
        <Sidebar />
        <div className="min-w-0">
          <MobileTopBar />
          <VerifyBanner />
          <main id="main" className="min-w-0">
            {children}
          </main>
        </div>
        <MobileNav />
      </div>
    );
  }

  // Everything else (Home, Events, Notifications, Communities, Saved, search…): the home panel · page,
  // and the suggestions rail beside the home feed on wide screens.
  const home = pathname === "/";
  const wide = ["/events", "/saved", "/communities", "/search", "/notifications"].includes(pathname.replace(/\/$/, ""));

  return (
    <div className={home ? "min-h-dvh lg:grid lg:grid-cols-[272px_minmax(0,1fr)] xl:grid-cols-[272px_minmax(0,1fr)_320px]" : "min-h-dvh lg:grid lg:grid-cols-[272px_minmax(0,1fr)]"}>
      <a href="#main" className={SKIP}>
        Skip to content
      </a>
      <HomePanel />
      <div className="min-w-0">
        <MobileTopBar />
        <VerifyBanner />
        <main id="main" className={`mx-auto w-full ${home ? "max-w-[1120px]" : wide ? "max-w-[1560px]" : "max-w-[1040px]"} px-4 pt-6 pb-32 sm:px-8 lg:px-10 lg:pt-9 lg:pb-20`}>
          {children}
        </main>
      </div>
      {home && <RightRail />}
      <MobileNav />
    </div>
  );
}
