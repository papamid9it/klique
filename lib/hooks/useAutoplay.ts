"use client";

import { useSyncExternalStore } from "react";
import { isAutoplay, subscribeAutoplay } from "@/lib/autoplay";

/** For components: whether feed videos may play by themselves (re-renders when the setting changes). */
export function useAutoplay(): boolean {
  return useSyncExternalStore(subscribeAutoplay, isAutoplay, () => true);
}
