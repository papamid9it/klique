/**
 * What Klique notifies you about, grouped into categories you can switch on or off, separately for the in-app
 * inbox (the bell) and for push (phone and browser). The rule everywhere: only things meant for you, or that
 * need your decision. Ordinary chat never notifies; it shows as unread dots and counts instead.
 */
export const NOTIFY_CATEGORIES = [
  { id: "mentions", label: "Mentions and replies in chat", hint: "Someone @mentions you, or replies to one of your messages, in a community or group channel." },
  { id: "replies", label: "Topic comments", hint: "New comments on your topics, and replies to your comments. Several on one topic arrive as one notification." },
  { id: "crews", label: "Crews", hint: "Requests to join your crew, being let in, meetup changes, and a reminder an hour before you meet." },
  { id: "admin", label: "Communities you run", hint: "People asking to join your private communities (one notification per community, however many ask). Site admins: ads waiting for review." },
  { id: "community", label: "Your communities", hint: "Your request to join was approved, or you were added to a group." },
  { id: "events", label: "Events", hint: "New events in your communities and groups, changes to events you're going to, and \"starting soon\"." },
  { id: "ads", label: "Your ads", hint: "Your ad was approved, needs changes, started, ends tomorrow, or ended (with its results)." },
  { id: "points", label: "Points and styles", hint: "Points you bought or were given, and a frame or name style ending in 3 days, renewed, or ended." },
  { id: "friends", label: "Friends", hint: "Friend requests, and when someone accepts yours." },
  { id: "messages", label: "Direct messages", hint: "New DMs. These already show in Messages, so this is push only.", pushOnly: true },
] as const;

export type NotifyCategory = (typeof NOTIFY_CATEGORIES)[number]["id"];
export type NotifyChannelPrefs = { inApp: boolean; push: boolean };
export type NotifyPrefs = Record<NotifyCategory, NotifyChannelPrefs>;

export const NOTIFY_CATEGORY_IDS = NOTIFY_CATEGORIES.map((c) => c.id) as NotifyCategory[];

/** Everything on to start with: it's all addressed to you, and bundled so it never floods. */
export function notifyPrefsOf(stored: unknown): NotifyPrefs {
  const s = (stored && typeof stored === "object" ? stored : {}) as Partial<Record<string, Partial<NotifyChannelPrefs>>>;
  const out = {} as NotifyPrefs;
  for (const c of NOTIFY_CATEGORIES) {
    const v = s[c.id] ?? {};
    out[c.id] = { inApp: "pushOnly" in c ? false : v.inApp !== false, push: v.push !== false };
  }
  return out;
}
