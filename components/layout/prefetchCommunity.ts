"use client";

import { ChannelService } from "@/app/services/ChannelService";
import { CommunityService } from "@/app/services/CommunityService";
import { EventService } from "@/app/services/EventService";
import { defaultChannel } from "@/components/domain/chat/order";
import { recallApi, rememberApi } from "@/lib/hooks/useApi";
import type { ChannelsDTO, MyCommunityDTO, SidebarDTO } from "@/lib/types";

/**
 * Has communities ready before they're opened, the way Discord does it: the cheap part (header, channel list,
 * boards) for the communities you're most likely to open, in ONE request; chat only when you show intent
 * (hovering or tapping a community) or when a community has mentions waiting for you. The cache keys match what
 * the community page reads (CommunityView, CommunityInfo, useChat), so opening it paints at once and then only
 * refreshes behind the scenes.
 */

/** communities whose sidebar is preloaded in the background, at most */
const BACKGROUND_MAX = 15;
/** of those, how many with unread mentions also get their chat preloaded */
const CHAT_MAX = 5;
/** don't fetch the same thing again within this long (opening it refreshes anyway) */
const FRESH_MS = 2 * 60_000;

const sidebarAt = new Map<string, number>();
const chatAt = new Map<string, number>();
const extrasAt = new Map<string, number>();
const fresh = (m: Map<string, number>, slug: string) => Date.now() - (m.get(slug) ?? 0) < FRESH_MS;

function storeSidebar(slug: string, s: SidebarDTO) {
  rememberApi(`community:${slug}`, s.community);
  if (s.channels) rememberApi(`channels:${slug}`, s.channels);
  if (s.boards) rememberApi(`boards:${slug}`, s.boards);
}

/** Sidebars for several communities, 20 per request; ones loaded in the last couple of minutes are skipped. */
export async function prefetchSidebars(slugs: string[]): Promise<void> {
  const todo = slugs.filter((s) => !fresh(sidebarAt, s));
  for (let i = 0; i < todo.length; i += 20) {
    const batch = todo.slice(i, i + 20);
    batch.forEach((s) => sidebarAt.set(s, Date.now()));
    try {
      const res = (await CommunityService.sidebars(batch)).data;
      for (const slug of batch) {
        const s = res[slug];
        if (s) storeSidebar(slug, s);
        else sidebarAt.delete(slug);
      }
    } catch {
      batch.forEach((s) => sidebarAt.delete(s)); // try again next time
    }
  }
}

/** The newest messages of the channel a community opens on (unless that chat is already in memory). */
async function prefetchChat(slug: string): Promise<void> {
  if (fresh(chatAt, slug)) return;
  const channels = recallApi<ChannelsDTO>(`channels:${slug}`);
  const ch = channels ? defaultChannel(channels) : null;
  if (!ch || ch.type === "voice") return;
  const key = `chat:${slug}::${ch.slug}`;
  if (recallApi(key)) return;
  chatAt.set(slug, Date.now());
  try {
    const page = (await ChannelService.messages({ slug, sub: null }, ch.slug)).data;
    rememberApi(key, { items: page.items, hasOlder: page.hasMore });
  } catch {
    chatAt.delete(slug);
  }
}

/** The info card on the right (admins, upcoming events). */
async function prefetchExtras(slug: string): Promise<void> {
  if (fresh(extrasAt, slug)) return;
  const c = recallApi<SidebarDTO["community"]>(`community:${slug}`);
  if (!c || c.locked) return;
  extrasAt.set(slug, Date.now());
  const [staff, events] = await Promise.allSettled([ChannelService.staff({ slug }), EventService.list({ community: slug, page: 1 })]);
  if (staff.status === "fulfilled") rememberApi(`staff:${slug}:${c.viewer.role}`, staff.value.data);
  if (events.status === "fulfilled") rememberApi(`info-events:${slug}`, events.value.data);
}

const intent = new Map<string, Promise<void>>();
/** Someone is about to open this community (hover, focus, tap): load all of it now. */
export function prefetchCommunity(slug: string): Promise<void> {
  const running = intent.get(slug);
  if (running) return running;
  const job = (async () => {
    await prefetchSidebars([slug]);
    await Promise.all([prefetchChat(slug), prefetchExtras(slug)]);
  })().finally(() => intent.delete(slug));
  intent.set(slug, job);
  return job;
}

/* ------------------------- recently opened ------------------------- */

const RECENT_KEY = "klique:recent-communities";

/** Remember that a community was opened (this browser only), so it's among the first preloaded next time. */
export function noteCommunityOpened(slug: string) {
  try {
    const list = [slug, ...recentCommunities().filter((s) => s !== slug)].slice(0, 30);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* storage blocked: preloading just falls back to activity order */
  }
}

function recentCommunities(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * The background pass, when the browser is idle: sidebars for the 15 communities you're likeliest to open
 * (mentions, then unread, then the ones you opened lately, then the busiest), in one request; then chat for the
 * few with mentions waiting. Everything else loads when you point at it.
 */
export function prefetchInBackground(mine: MyCommunityDTO[], skip: string | null, signal: { cancelled: boolean }) {
  const recent = recentCommunities();
  const rank = (c: MyCommunityDTO) => {
    const r = recent.indexOf(c.slug);
    return [c.mentions > 0 ? 0 : 1, c.unread ? 0 : 1, r < 0 ? 999 : r, -(c.lastActivityAt ? Date.parse(c.lastActivityAt) : 0)];
  };
  const cmp = (a: MyCommunityDTO, b: MyCommunityDTO) => {
    const x = rank(a), y = rank(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  };
  const picked = mine.filter((c) => c.slug !== skip).sort(cmp).slice(0, BACKGROUND_MAX);
  const idle = () => new Promise<void>((r) => (typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(() => r(), { timeout: 3000 }) : window.setTimeout(r, 300)));
  void (async () => {
    await idle();
    if (signal.cancelled || document.visibilityState !== "visible") return;
    await prefetchSidebars(picked.map((c) => c.slug));
    for (const c of picked.filter((x) => x.mentions > 0).slice(0, CHAT_MAX)) {
      await idle();
      if (signal.cancelled) return;
      await prefetchChat(c.slug);
    }
  })();
}
