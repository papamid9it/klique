"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { identify, replayFor, resetAnalytics, startAnalytics } from "@/lib/analytics";
import { useAuth } from "./AuthProvider";

/** Starts usage analytics (lib/analytics), tells it who's signed in, and switches replay off on private pages. */
export function AnalyticsProvider() {
  const { user } = useAuth();
  const path = usePathname();
  const known = useRef<string | null>(null);

  useEffect(() => startAnalytics(), []);

  useEffect(() => {
    if (user && known.current !== user.id) {
      known.current = user.id;
      identify({ id: user.id, handle: user.handle, plan: user.badge === "lite" || user.badge === "pro" ? user.badge : "free" });
    } else if (!user && known.current) {
      known.current = null;
      resetAnalytics();
    }
  }, [user]);

  useEffect(() => replayFor(path ?? "/"), [path]);

  return null;
}
