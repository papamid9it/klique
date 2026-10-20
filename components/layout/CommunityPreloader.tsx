"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { CommunityService } from "@/app/services/CommunityService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useApi } from "@/lib/hooks/useApi";
import { prefetchInBackground } from "./prefetchCommunity";

/**
 * Renders nothing. On every page of the app (not just inside a community), quietly gets the communities you're
 * likeliest to open ready in the background; see prefetchInBackground. Shares the "my communities" list with the
 * rail, so it costs no extra request.
 */
export function CommunityPreloader() {
  const { status, user } = useAuth();
  const authed = status === "authed";
  const { data } = useApi(authed ? () => CommunityService.mine() : null, [authed, user?.id], { key: "my-communities" });
  const pathname = usePathname();
  const activeSlug = /^\/communities\/([^/]+)/.exec(pathname)?.[1] ?? null;

  useEffect(() => {
    if (!data?.length) return;
    const signal = { cancelled: false };
    prefetchInBackground(data, activeSlug, signal);
    return () => {
      signal.cancelled = true;
    };
  }, [data, activeSlug]);
  return null;
}
