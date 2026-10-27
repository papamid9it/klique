/**
 * Points: earned reputation, like Reddit karma. Never bought, never spent, and they never go down because of
 * someone's bad reaction. You earn them from other people only: hosting events people come to, showing up,
 * going with a crew that met, upvotes on your posts and board posts, and good reactions to your messages in
 * community, group and crew chats (not DMs). Each kind has its own daily cap so it can't be farmed. A site admin
 * sets what each is worth and the caps. Communities can ask for a minimum to join or to post.
 * (Hype is the currency you buy: see lib/wallet.ts.)
 */

export type PointAction = "attend" | "hostAttendee" | "crew" | "postUpvote" | "boardUpvote" | "reaction";

export interface PointsConfig {
  /** points per action */
  actions: Record<PointAction, number>;
  /** most points anyone can earn from each kind of action in one day (Lagos time) */
  caps: Record<PointAction, number>;
}

export const POINT_ACTIONS: { id: PointAction; label: string; hint: string }[] = [
  { id: "attend", label: "Came to an event", hint: "The host confirms you were there." },
  { id: "hostAttendee", label: "Someone came to your event", hint: "Per person the host confirms (up to 50 per event)." },
  { id: "crew", label: "Went with a crew", hint: "You were in a crew of 2 or more for an event you were confirmed at." },
  { id: "postUpvote", label: "Upvote on your post", hint: "Someone else upvoted a post of yours (once per person per post)." },
  { id: "boardUpvote", label: "Upvote on your board post", hint: "Someone else upvoted a board post of yours (once per person per post)." },
  { id: "reaction", label: "Good reaction to your message", hint: "Someone else reacted 👍 ❤️ 😂 😮 🥳 🔥 to your message in a community, group or crew chat. Not DMs." },
];

export const DEFAULT_POINTS_CONFIG: PointsConfig = {
  actions: { attend: 30, hostAttendee: 5, crew: 15, postUpvote: 2, boardUpvote: 2, reaction: 1 },
  caps: { attend: 90, hostAttendee: 150, crew: 45, postUpvote: 50, boardUpvote: 50, reaction: 25 },
};

const int = (v: unknown, min: number, max: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback);

/** Stored settings over the defaults, tidied. */
export function pointsConfigOf(stored: unknown): PointsConfig {
  const s = (stored && typeof stored === "object" ? stored : {}) as Partial<PointsConfig>;
  const a = (s.actions ?? {}) as Partial<Record<PointAction, number>>;
  const c = (s.caps ?? {}) as Partial<Record<PointAction, number>>;
  const actions = {} as Record<PointAction, number>;
  const caps = {} as Record<PointAction, number>;
  for (const { id } of POINT_ACTIONS) {
    actions[id] = int(a[id], 0, 10_000, DEFAULT_POINTS_CONFIG.actions[id]);
    caps[id] = int(c[id], 0, 1_000_000, DEFAULT_POINTS_CONFIG.caps[id]);
  }
  return { actions, caps };
}

/** Reactions that earn the author points; the rest (👎 😡 😢) earn nothing and never take any away. */
export const GOOD_REACTIONS = new Set(["like", "love", "laugh", "wow", "party", "fire", "clap", "hundred"]);

/** For a member without the points a space asks for to post in its Posts section (undefined when that's not why). */
export function pointsNote(need: number | undefined, have: number): string | undefined {
  if (!need) return undefined;
  return `New posts here need ${need.toLocaleString("en-NG")} points. You have ${have.toLocaleString("en-NG")}: upvotes and good reactions from others earn them. You can still chat, use boards, comment, vote and react.`;
}
