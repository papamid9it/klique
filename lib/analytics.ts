"use client";

import posthog from "posthog-js";
import ApiClient from "@/app/ApiCore";

/**
 * Usage analytics (PostHog): how many people use Klique, where they come from, where they leave, whether they come
 * back. Off unless NEXT_PUBLIC_POSTHOG_KEY is set; then every call here quietly does nothing.
 *
 * Privacy: people are known by their id, handle and plan only (never email or date of birth); session replay masks
 * every input and all text, and stops on messages, community chats (18+ ones included) and admin pages; admin pages
 * send nothing at all.
 */
const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

let started = false;

const isAdminPage = (path: string) => path === "/admin" || path.startsWith("/admin/");
/** where replay never records: private conversations and community chats */
const isPrivatePage = (path: string) => isAdminPage(path) || path.startsWith("/messages") || path.startsWith("/communities/");

export function startAnalytics() {
  if (started || !KEY || typeof window === "undefined") return;
  started = true;
  posthog.init(KEY, {
    api_host: HOST,
    capture_pageview: "history_change",
    capture_pageleave: true,
    person_profiles: "identified_only",
    disable_session_recording: true,
    session_recording: { maskAllInputs: true, maskTextSelector: "*" },
    before_send: (e) => (e && isAdminPage(window.location.pathname) ? null : e),
  });
  const desktop = !!(window as unknown as { kliqueDesktop?: unknown }).kliqueDesktop;
  posthog.register({ platform: desktop ? "desktop" : "web" });
  ApiClient.configure({ onSuccess: trackApi });
}

export function track(event: string, props?: Record<string, unknown>) {
  if (started) posthog.capture(event, props);
}

export function identify(user: { id: string; handle: string; plan?: string | null }) {
  if (!started) return;
  posthog.identify(user.id, { handle: user.handle, plan: user.plan ?? "free" });
}

export function resetAnalytics() {
  if (started) posthog.reset();
}

/** Replay only where it's safe to watch: never on chats, messages or admin pages. */
export function replayFor(path: string) {
  if (!started) return;
  if (isPrivatePage(path)) posthog.stopSessionRecording();
  else posthog.startSessionRecording();
}

/** The handful of things worth counting, read off the API calls that do them (one place, no edits in every screen). */
function trackApi(method: string, path: string, body: unknown, json: unknown) {
  if (method !== "POST") return;
  const p = path.split("?")[0];
  const b = (body ?? {}) as Record<string, unknown>;
  const data = ((json ?? {}) as { data?: Record<string, unknown> }).data ?? {};
  if (p === "/api/auth/signup") track("sign_up");
  else if (p === "/api/auth/login") track("login");
  else if (/^\/api\/communities\/[^/]+\/feed$/.test(p)) track("post_created");
  else if (/^\/api\/communities\/[^/]+(\/groups\/[^/]+)?\/join$/.test(p)) track("community_joined");
  else if (/^\/api\/events\/[^/]+\/rsvp$/.test(p) && (b.status ?? "going") === "going") track("event_going");
  else if (/^\/api\/crews\/[^/]+\/join$/.test(p)) track("klique_joined");
  else if (p === "/api/gifts/send") track("award_sent");
  else if (p === "/api/me/subscription/verify" && data.paid) track("plan_purchased", { plan: (data.subscription as { plan?: string } | undefined)?.plan });
}
