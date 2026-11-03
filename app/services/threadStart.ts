import type { SpaceRef } from "./ChannelService";

/**
 * "Start thread" opens a draft at once and makes nothing: the thread is created with its first reply, so no empty
 * thread is ever left behind (and nobody sees a "replies" button until there's a reply). A draft lives here, by
 * the thread's slug (`t-<message id>`), until it's sent or the panel closes.
 */
export interface ThreadDraft {
  space: SpaceRef;
  channelSlug: string;
  messageId: string;
  /** the message it hangs off, to show above the reply box */
  author: string;
  body: string;
}

const drafts = new Map<string, ThreadDraft>();

export function draftThread(d: ThreadDraft): string {
  const slug = `t-${d.messageId}`;
  drafts.set(slug, d);
  return slug;
}

export const threadDraft = (slug: string) => drafts.get(slug) ?? null;
export const dropThreadDraft = (slug: string) => void drafts.delete(slug);
