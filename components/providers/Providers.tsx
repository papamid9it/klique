"use client";

import { useDataSaver } from "@/lib/hooks/useDataSaver";
import { useEffect, type ReactNode } from "react";
import { CategoryService } from "@/app/services/CategoryService";
import { setCategories } from "@/lib/constants";
import { isReducedMotion } from "@/lib/motion";
import { AuthProvider } from "./AuthProvider";
import { LeaveProvider } from "./LeaveProvider";
import { PanelSlotProvider } from "@/components/layout/PagePanel";
import { MediaViewerProvider } from "./MediaViewerProvider";
import { PlaceProvider } from "./PlaceProvider";
import { RealtimeProvider } from "./RealtimeProvider";
import { ProfileCardProvider } from "./ProfileCardProvider";
import { ThemeProvider } from "./ThemeProvider";
import { ToastProvider } from "./ToastProvider";

/** The admin's category list: the built-in defaults show until it arrives (they're the usual answer anyway). */
function useLoadCategories() {
  useEffect(() => {
    CategoryService.list().then((r) => setCategories(r.data), () => {});
  }, []);
}

/** Marks whatever is being scrolled with data-scrolling for a moment, so its (otherwise hidden) scrollbar shows. */
function useScrollingMarker() {
  useEffect(() => {
    const timers = new Map<Element, ReturnType<typeof setTimeout>>();
    const onScroll = (e: Event) => {
      const el = e.target instanceof Element ? e.target : document.documentElement;
      el.setAttribute("data-scrolling", "");
      clearTimeout(timers.get(el));
      timers.set(el, setTimeout(() => (el.removeAttribute("data-scrolling"), timers.delete(el)), 900));
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);
}

/** The Animations setting, marked on <html data-motion> from the first load (the CSS motion rules read it). */
function useMotionMarker() {
  useEffect(() => void isReducedMotion(), []);
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
  useScrollingMarker();
  useDataSaverMarker();
  useMotionMarker();
  return (
    <ToastProvider>
      <AuthProvider>
        <RealtimeProvider>
          <ThemeProvider>
            <PlaceProvider>
              <ProfileCardProvider>
                <MediaViewerProvider>
                  <LeaveProvider>
                    <PanelSlotProvider>{children}</PanelSlotProvider>
                  </LeaveProvider>
                </MediaViewerProvider>
              </ProfileCardProvider>
            </PlaceProvider>
          </ThemeProvider>
        </RealtimeProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
