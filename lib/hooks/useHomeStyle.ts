"use client";

import { useSyncExternalStore } from "react";
import ApiClient from "@/app/ApiCore";
import type { HomeStyle } from "@/lib/constants";

/** Home style is kept in this browser (or this desktop app), whoever signs in: each device can have its own. */
const KEY = "klique:home-style";
const listeners = new Set<() => void>();

function read(): HomeStyle {
  try {
    // Communities until this device picks: an old saved "casual" stays
    return localStorage.getItem(KEY) === "casual" ? "casual" : "communities";
  } catch {
    return "communities";
  }
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => e.key === KEY && fn();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
};

/** null until the page is running in the browser, so neither style flashes before the right one. */
export const useHomeStyle = () => useSyncExternalStore<HomeStyle | null>(subscribe, read, () => null);

export function setHomeStyle(style: HomeStyle) {
  try {
    localStorage.setItem(KEY, style);
  } catch {
    /* private mode: for this visit only */
  }
  listeners.forEach((fn) => fn());
  reportHomeStyle(style);
}

const api = new ApiClient();
let told: string | null = null;
/** Counted for the admin overview, once per visit and on each change (the choice itself never leaves the device). */
export function reportHomeStyle(style: HomeStyle = read()) {
  const platform = typeof window !== "undefined" && "kliqueDesktop" in window ? "desktop" : "site";
  if (told === `${platform}:${style}`) return;
  told = `${platform}:${style}`;
  void api.post("/api/me/home-style", { style, platform }).catch(() => {
    told = null;
  });
}
