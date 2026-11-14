"use client";

import { BrokenImages } from "./BrokenImages";
import { useDataSaver } from "@/lib/hooks/useDataSaver";
import { Suspense, useEffect, type ReactNode } from "react";
import { CategoryService } from "@/app/services/CategoryService";
import { setCategories } from "@/lib/constants";
import { isReducedMotion } from "@/lib/motion";
import { AuthProvider } from "./AuthProvider";
import { AnalyticsProvider } from "./AnalyticsProvider";
import { DesktopAlerts } from "@/components/domain/DesktopAlerts";
import { SignOutHost } from "@/components/domain/account/SignOutDialog";
import { LeaveProvider } from "./LeaveProvider";
import { PanelSlotProvider } from "@/components/layout/PagePanel";
import { MediaViewerProvider } from "./MediaViewerProvider";
import { PlaceProvider } from "./PlaceProvider";
import { RealtimeProvider } from "./RealtimeProvider";
import { ProfileCardProvider } from "./ProfileCardProvider";
import { ThemeProvider } from "./ThemeProvider";
import { ToastProvider } from "./ToastProvider";
import { ConfirmProvider } from "./ConfirmProvider";

/** The admin's category list: the built-in defaults show until it arrives (they're the usual answer anyway). */
function useLoadCategories() {
  useEffect(() => {
    CategoryService.list().then((r) => setCategories(r.data), () => {});
  }, []);
}

const scrollsAlong = (value: string) => value === "auto" || value === "scroll";



/** The Animations setting, marked on <html data-motion> from the first load (the CSS motion rules read it). */
function useMotionMarker() {
  useEffect(() => void isReducedMotion(), []);
}

/** The innermost thing under this element that can really scroll; the page itself when nothing closer can. */
function scrollerOf(start: Element | null): Element | null {
  const root = document.documentElement;
  for (let el = start; el && el !== root && el !== document.body; el = el.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(el);
    if ((scrollsAlong(overflowY) && el.scrollHeight > el.clientHeight) || (scrollsAlong(overflowX) && el.scrollWidth > el.clientWidth)) return el;
  }
  const locked = getComputedStyle(root).overflowY === "hidden" || getComputedStyle(document.body).overflowY === "hidden";
  return !locked && root.scrollHeight > root.clientHeight ? root : null;
}

/**
 * Only one scrollbar ever shows: data-bar sits on the one thing you're over, or on what's scrolling right now for a
 * moment. CSS can't do this alone, because :hover also matches every parent, the page included, so hovering a panel
 * would light up the panel's bar and the page's together.
 */
function useScrollbarMarker() {
  useEffect(() => {
    let current: Element | null = null;
    let hovered: Element | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = (el: Element | null) => {
      if (el === current) return;
      current?.removeAttribute("data-bar");
      el?.setAttribute("data-bar", "");
      current = el;
    };
    const onOver = (e: PointerEvent) => {
      // dragging a scrollbar keeps that one showing, wherever the pointer wanders
      if (e.pointerType === "touch" || e.buttons) return;
      hovered = scrollerOf(e.target instanceof Element ? e.target : null);
      clearTimeout(timer);
      show(hovered);
    };
    const onScroll = (e: Event) => {
      show(e.target instanceof Element ? e.target : document.documentElement);
      clearTimeout(timer);
      timer = setTimeout(() => show(hovered), 900);
    };
    const onLeave = () => {
      hovered = null;
      clearTimeout(timer);
      show(null);
    };
    const root = document.documentElement;
    document.addEventListener("pointerover", onOver, { passive: true });
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    root.addEventListener("pointerleave", onLeave);
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("scroll", onScroll, true);
      root.removeEventListener("pointerleave", onLeave);
      clearTimeout(timer);
      show(null);
    };
  }, []);
}

/** Data saver on: say so on <html> (data-saver="on"). */
function useDataSaverMarker() {
  const { on } = useDataSaver();
  useEffect(() => {
    if (on) document.documentElement.dataset.saver = "on";
    else delete document.documentElement.dataset.saver;
  }, [on]);
}

export function Providers({ children }: { children: ReactNode }) {
  useLoadCategories();
  useScrollbarMarker();
  useDataSaverMarker();
  useMotionMarker();
  return (
    <ToastProvider>
      <AuthProvider>
        <RealtimeProvider>
          <ThemeProvider>
            <PlaceProvider>
              {/* the media viewer goes outside the profile card: the card's own pop-ups (gallery photos) open it too */}
              <ConfirmProvider>
              <MediaViewerProvider>
                <ProfileCardProvider>
                  <LeaveProvider>
                    <DesktopAlerts />
                    {/* reads the URL (usePathname), so it sits in its own Suspense under Cache Components */}
                    <Suspense fallback={null}>
                      <AnalyticsProvider />
                    </Suspense>
                    <BrokenImages />
                    <SignOutHost />
                    <PanelSlotProvider>{children}</PanelSlotProvider>
                  </LeaveProvider>
                </ProfileCardProvider>
              </MediaViewerProvider>
              </ConfirmProvider>
            </PlaceProvider>
          </ThemeProvider>
        </RealtimeProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
