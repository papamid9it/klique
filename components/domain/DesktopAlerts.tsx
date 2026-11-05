"use client";

import { useRouter } from "next/navigation";
import { desktopAlertsOn, inDesktopApp } from "@/app/services/NotificationService";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";

/**
 * Notifications in the desktop app. It has no browser push, so while it's running (even hidden) it shows them itself
 * from the live connection. Not while you're looking at it: the app's own bell and badges already show those.
 */
export function DesktopAlerts() {
  const router = useRouter();
  useRealtimeEvent(
    (e) => {
      if (e.type !== "notify" || !e.alert || !desktopAlertsOn() || document.hasFocus()) return;
      const { title, body, href } = e.alert;
      // the same chat or event replaces its last one instead of piling up
      const n = new Notification(title, { body, icon: "/app-icon/192", ...(e.ref ? { tag: e.ref } : {}) });
      n.onclick = () => router.push(href);
    },
    { filter: (e) => e.type === "notify" && !!e.alert && inDesktopApp() },
  );
  return null;
}
