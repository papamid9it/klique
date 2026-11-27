import "server-only";
import { instagramToken, instagramUserId, metaGraphVersion } from "../../env";
import { EventSource, type IEventSource } from "../../models/EventDraft";
import { aiOn, readFlyerWithAi } from "./ai";
import type { Candidate } from "./parse";

/**
 * Instagram accounts to watch, read through Meta's official Graph API (Business Discovery): Klique's own business
 * account looks up another business or creator account's public posts by username. No logins, no scraping. Each
 * new post that looks like an event announcement goes to the AI (caption + picture), and what it finds becomes a
 * draft to review. Needs INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID, plus ANTHROPIC_API_KEY for the reading.
 */

export const instagramOn = () => !!instagramToken() && !!instagramUserId();

/** "@hardrocklagos", "hardrocklagos" or an instagram.com profile link → "hardrocklagos" (null: not one) */
export function instagramUsername(raw: string): string | null {
  const v = raw.trim();
  const at = /^@?([a-z0-9._]{1,30})$/i.exec(v);
  if (at && (v.startsWith("@") || !v.includes("."))) return at[1].toLowerCase();
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return null;
    const name = u.pathname.split("/").filter(Boolean)[0] ?? "";
    return /^[a-z0-9._]{1,30}$/i.test(name) && !["p", "reel", "reels", "stories", "explore", "tv"].includes(name.toLowerCase()) ? name.toLowerCase() : null;
  } catch {
    return null;
  }
}

export const instagramProfileUrl = (username: string) => `https://www.instagram.com/${username}/`;

interface Post {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
}

async function recentPosts(username: string): Promise<Post[]> {
  const fields = `business_discovery.username(${username}){media.limit(15){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp}}`;
  const url = `https://graph.facebook.com/${metaGraphVersion()}/${instagramUserId()}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(instagramToken() ?? "")}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const body = (await res.json().catch(() => null)) as { business_discovery?: { media?: { data?: Post[] } }; error?: { message?: string; code?: number } } | null;
  if (!res.ok || body?.error) {
    const msg = body?.error?.message ?? `Instagram answered ${res.status}`;
    // the usual one: a personal account (Business Discovery only sees business and creator accounts)
    throw new Error(/cannot be found|does not exist|not a business/i.test(msg) ? `@${username} isn't a business or creator account (or doesn't exist), so Instagram won't share its posts` : msg.slice(0, 240));
  }
  return body?.business_discovery?.media?.data ?? [];
}

/** Worth sending to the AI: says something about a date or time (most event posts do; memes and quotes don't). */
const MONTHS = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i;
const looksLikeEvent = (caption: string) => /\d/.test(caption) && (MONTHS.test(caption) || /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b|tonight|tomorrow|this weekend|\d{1,2}\s?(am|pm)|\d{1,2}[:.]\d{2}|tickets?|rsvp|venue|gate/i.test(caption));

const DAY = 86_400_000;
/** at most this many posts read per account per run (each is one AI read) */
const PER_RUN = 6;

/** New posts from one watched account since the last check (the first check looks back three weeks), read into events. */
export async function instagramEvents(source: IEventSource, fallbackCountry: string): Promise<Candidate[]> {
  const username = instagramUsername(source.url);
  if (!username) return [];
  const { events, newest } = await instagramAccountEvents(username, source.lastPostAt ?? null, fallbackCountry);
  // next time, only what's new after these
  if (newest) await EventSource.updateOne({ _id: source._id }, { $set: { lastPostAt: newest } });
  return events;
}

/**
 * One account's posts newer than `after` (the first check looks back three weeks), read into events, and the newest
 * post's time (keep it for next time). Used by the admin finder's watched accounts and by communities' Event finder.
 */
export async function instagramAccountEvents(username: string, after: Date | null, fallbackCountry: string): Promise<{ events: Candidate[]; newest: Date | null }> {
  if (!instagramOn()) throw new Error("Add INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID to read Instagram accounts");
  if (!aiOn()) throw new Error("Add ANTHROPIC_API_KEY so the AI can read the posts");
  const since = after ? +after : Date.now() - 21 * DAY;
  const posts = (await recentPosts(username)).filter((p) => +new Date(p.timestamp) > since).sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
  const newest = posts.length ? new Date(posts[posts.length - 1].timestamp) : null;
  const out: Candidate[] = [];
  for (const p of posts.filter((x) => looksLikeEvent(x.caption ?? "")).slice(-PER_RUN)) {
    const image = p.media_type === "VIDEO" ? p.thumbnail_url : p.media_url;
    if (!image) continue;
    const found = await readFlyerWithAi({ imageUrl: image, link: p.permalink, note: p.caption ?? "" }, fallbackCountry || "NG").catch((e) => {
      console.warn(`[finder ig] @${username}:`, (e as Error).message);
      return [] as Candidate[];
    });
    found.forEach((c, i) =>
      out.push({
        ...c,
        sourceUrl: i ? `${p.permalink}#${i + 1}` : p.permalink,
        sourceName: `@${username}`,
        organizerName: c.organizerName || `@${username}`,
        // Instagram's picture link expires in a few days and isn't ours to reuse: a reference for the reviewer
        image,
        imageReusable: false,
      }),
    );
  }
  return { events: out, newest };
}
