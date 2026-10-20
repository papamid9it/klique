"use client";

import { ChannelService } from "@/app/services/ChannelService";
import { CommunityService } from "@/app/services/CommunityService";
import { EventService } from "@/app/services/EventService";
import { TopicService } from "@/app/services/TopicService";
import { defaultChannel } from "@/components/domain/chat/order";
import { recallApi, rememberApi } from "@/lib/hooks/useApi";

/**
 * Loads a community into memory before you open it, the way Discord has every server ready: its header, channel
 * list, boards, info card and the channel it opens on. The cache keys match what the community page reads
 * (CommunityView, CommunityInfo, useChat), so opening it paints at once and only refreshes behind the scenes.
 */
const lastRun = new Map<string, number>();
const inFlight = new Map<string, Promise<void>>();
/** don't fetch the same community again within this long (opening it refreshes anyway) */
const FRESH_MS = 2 * 60_000;

export function prefetchCommunity(slug: string, { force = false }: { force?: boolean } = {}): Promise<void> {
  const running = inFlight.get(slug);
  if (running) return running;
  if (!force && Date.now() - (lastRun.get(slug) ?? 0) < FRESH_MS) return Promise.resolve();
  lastRun.set(slug, Date.now());
  const job = (async () => {
    try {
      const c = (await CommunityService.get(slug)).data;
      rememberApi(`community:${slug}`, c);
      if (c.locked) return;
      const [channels, boards, staff, events] = await Promise.allSettled([
        ChannelService.list({ slug }),
        TopicService.boards(slug),
        ChannelService.staff({ slug }),
        EventService.list({ community: slug, page: 1 }),
      ]);
      if (boards.status === "fulfilled") rememberApi(`boards:${slug}`, boards.value.data);
      if (staff.status === "fulfilled") rememberApi(`staff:${slug}:${c.viewer.role}`, staff.value.data);
      if (events.status === "fulfilled") rememberApi(`info-events:${slug}`, events.value.data);
      if (channels.status !== "fulfilled") return;
      rememberApi(`channels:${slug}`, channels.value.data);
      // the newest messages of the channel it opens on (unless that chat is already in memory)
      const ch = defaultChannel(channels.value.data);
      const chatKey = ch ? `chat:${slug}::${ch.slug}` : null;
      if (ch && chatKey && ch.type !== "voice" && !recallApi(chatKey)) {
        const page = (await ChannelService.messages({ slug, sub: null }, ch.slug)).data;
        rememberApi(chatKey, { items: page.items, hasOlder: page.hasMore });
      }
    } catch {
      lastRun.delete(slug); // try again next time
    } finally {
      inFlight.delete(slug);
    }
  })();
  inFlight.set(slug, job);
  return job;
}

/** Prefetch a list of communities one or two at a time, when the browser is idle, so it never competes with what you're doing. */
export function prefetchCommunities(slugs: string[], signal: { cancelled: boolean }) {
  const queue = [...slugs];
  const idle = (fn: () => void) => (typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(fn, { timeout: 3000 }) : window.setTimeout(fn, 200));
  const worker = async () => {
    while (queue.length && !signal.cancelled) {
      if (document.visibilityState !== "visible") {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      await new Promise<void>((r) => idle(() => r()));
      const slug = queue.shift();
      if (slug && !signal.cancelled) await prefetchCommunity(slug);
    }
  };
  void worker();
  void worker();
}
