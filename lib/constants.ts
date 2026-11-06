export const APP_NAME = "klique";

/**
 * The one default community, "Klique": everyone is in it from signup and can't leave. Only site admins post its
 * events, and those are the only events everyone sees; every other event is for its own community's (or group's)
 * members. Announcements are made there.
 */
export const KLIQUE_SLUG = "klique";

/**
 * Profile designs (animated name effects, picture frames, profile themes, profile effects, animated pictures and
 * banners) are switched off for now: names and pictures show plainly everywhere, and the Profile style page and
 * the admin's design prices and effects are hidden. Nothing is deleted: turn this back on to bring them back.
 * A plain profile picture and banner, and moods, are unaffected.
 */
export const PROFILE_DESIGNS_ENABLED = false;

/** Where people can reach you about their data or the rules (shown on /terms and /privacy). Set NEXT_PUBLIC_SUPPORT_EMAIL. */
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "";
/**
 * Where to report abuse and safety problems (anything involving a minor, content shared without consent, law
 * enforcement requests): on /terms, /privacy and the Report dialog. Set NEXT_PUBLIC_REPORT_EMAIL (e.g.
 * report@getklique.app); without it, the support address.
 */
export const REPORT_EMAIL = process.env.NEXT_PUBLIC_REPORT_EMAIL?.trim() || SUPPORT_EMAIL;

/** City slugs are open now (see lib/places.ts); kept as an alias so signatures read well. */
export type CityId = string;

/* ------------------------------------------------------------------ */
/* Interests                                                           */
/* ------------------------------------------------------------------ */

/**
 * Categories ("interests" in the code: what a community, event or person is into). A site admin edits the list in
 * Admin → Categories; these are the defaults until they do. A hidden category stays on everything that already
 * uses it but isn't offered any more. The list lives in one registry here, filled from the server (`/api/categories`)
 * in the browser and from the database on the server (see server/services/categories.service.ts), so the helpers
 * below stay synchronous.
 */
export interface Category {
  /** the slug stored on communities, events and people; never changes once created */
  id: string;
  name: string;
  /** a short label for chips and tight spaces */
  short: string;
  /** an emoji or symbol shown next to the name */
  glyph: string;
  hidden?: boolean;
}

/**
 * A symbol glyph drawn as text, never as a colour emoji (some phones turn ✳ or ▶ into emoji): adds the text
 * presentation mark to a lone symbol. Emoji people chose on purpose (with their own mark, or real emoji) are left.
 */
export function textGlyph(g: string): string {
  const t = g.trim();
  if (!t || /[\uFE0E\uFE0F]/.test(t) || [...t].length !== 1) return t;
  const cp = t.codePointAt(0)!;
  return cp >= 0x2190 && cp <= 0x2bff ? `${t}\uFE0E` : t;
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "skate", name: "Skateboarding", short: "Skate", glyph: "✳\uFE0E" },
  { id: "music", name: "Alté & indie music", short: "Music", glyph: "♫\uFE0E" },
  { id: "streetwear", name: "Streetwear", short: "Streetwear", glyph: "✦\uFE0E" },
  { id: "photography", name: "Photography", short: "Photo", glyph: "◉\uFE0E" },
  { id: "running", name: "Running", short: "Running", glyph: "↗\uFE0E" },
  { id: "art", name: "Art", short: "Art", glyph: "✎\uFE0E" },
  { id: "film", name: "Film", short: "Film", glyph: "▶\uFE0E" },
  { id: "dance", name: "Dance", short: "Dance", glyph: "❋\uFE0E" },
];

export type InterestId = string;
export const CATEGORY_SLUG = /^[a-z0-9][a-z0-9-]{1,29}$/;

let registry: Category[] = DEFAULT_CATEGORIES;
let visible: Category[] = DEFAULT_CATEGORIES;
const listeners = new Set<() => void>();

/** Replace the list (from the server). Everyone using `useCategories` re-renders. */
export function setCategories(list: Category[]) {
  if (!list.length) return;
  registry = list;
  visible = list.filter((c) => !c.hidden);
  listeners.forEach((fn) => fn());
}
export function onCategoriesChange(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
/** Every category, hidden ones included, in the admin's order. */
export const allCategories = (): Category[] => registry;
/** The ones on offer (pickers, filters, onboarding). */
export const visibleCategories = (): Category[] => visible;

const prettify = (id: string) => id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

export function getInterest(id: string | null | undefined): Category {
  const found = registry.find((i) => i.id === id);
  if (found) return found;
  const name = id ? prettify(id) : "Other";
  return { id: id ?? "", name, short: name, glyph: "•" };
}
/** A category that exists (hidden ones too: things already using them keep working). */
export function isInterestId(id: unknown): id is InterestId {
  return typeof id === "string" && registry.some((c) => c.id === id);
}

/* ------------------------------------------------------------------ */
/* Limits shared by validators and UI                                  */
/* ------------------------------------------------------------------ */

export const LIMITS = {
  /** groups are private: at most this many people, owner included */
  groupMembers: 1000,
  /** a community's owner can start this many groups in it */
  groupsPerCommunity: 3,
  /** a group chat of friends, its creator included */
  chatGroupMembers: 100,
  chatGroupName: 60,
  pinnedChats: 10,
  pinnedCommunities: 10,
  /** events a community's owner can pin at once */
  pinnedEvents: 3,
  /** a community needs this many members before its owner can apply to be verified */
  verifyMembers: 1000,
  handleMin: 3,
  handleMax: 20,
  displayName: 50,
  bio: 280,
  pronouns: 40,
  communityName: 60,
  communityDescription: 1200,
  eventTitle: 100,
  eventDescription: 4000,
  venue: 120,
  postBody: 1500,
  topicTitle: 160,
  topicBody: 6000,
  topicMedia: 6,
  /** community posts (the Posts section): caption length, pictures per post, comment length */
  feedCaption: 2200,
  feedMedia: 10,
  feedComment: 2000,
  /** tags on a board post, and how long each may be */
  topicTags: 3,
  topicTag: 20,
  boardName: 30,
  boardDescription: 120,
  boardRules: 1000,
  maxBoards: 12,
  topicComment: 3000,
  messageBody: 2000,
  reportDetails: 1000,
  requestMessage: 300,
  minInterests: 3,
  maxInterests: 8,
  pageSize: 12,
} as const;

export const HANDLE_REGEX = /^[a-z0-9_]+$/;

export type DmPolicy = "everyone" | "shared" | "nobody";
/**
 * "Who can message me" (Nov 2026, Instagram style). Friends, people in a klique with you right now, and admins of a
 * community you also run can always chat with you. For everyone else:
 *  - "everyone": they can send ONE message as a request (text only); it waits in your Requests until you accept it
 *  - "shared": only friends and klique mates (the id is older than the name)
 *  - "nobody": nobody new; friends still can
 */
export const DM_POLICIES: { id: DmPolicy; label: string; hint: string }[] = [
  { id: "everyone", label: "Everyone, as message requests", hint: "Friends and klique mates chat with you freely. Anyone else can send one message, which waits in your Requests until you accept it." },
  { id: "shared", label: "Friends and klique mates only", hint: "Only friends, people in a klique with you, and admins of communities you also run." },
  { id: "nobody", label: "No one new", hint: "Only your friends can start a chat with you." },
];

export type ProfileVisibility = "public" | "members" | "friends" | "private";
export const PROFILE_VISIBILITY: { id: ProfileVisibility; label: string; hint: string }[] = [
  { id: "public", label: "Public", hint: "Anyone can see your photos, socials and details." },
  { id: "members", label: "Shared communities", hint: "Only people who share a community with you. Everyone else just sees your picture, banner and name." },
  { id: "friends", label: "Friends only", hint: "Only your friends. Everyone else just sees your picture, banner and name." },
  { id: "private", label: "Just me", hint: "Nobody else. People just see your picture, banner and name." },
];
/** Who a community is for, chosen when it's made and fixed after that. Women-only and men-only communities are always private. */
export type CommunityAudience = "everyone" | "women" | "men";
export const COMMUNITY_AUDIENCES: { id: CommunityAudience; label: string; hint: string }[] = [
  { id: "everyone", label: "General", hint: "Anyone can be part of it." },
  { id: "women", label: "Women only", hint: "Only women can join or ask to join. You approve each one." },
  { id: "men", label: "Men only", hint: "Only men can join or ask to join. You approve each one." },
];
export const audienceLabel = (a?: CommunityAudience) => (a === "women" ? "Women only" : a === "men" ? "Men only" : null);
/** Why this person can't join a community, or null when they can. */
export function audienceRefusal(audience: CommunityAudience | undefined, gender: "woman" | "man" | "unspecified" | undefined): string | null {
  if (!audience || audience === "everyone") return null;
  const wanted = audience === "women" ? "woman" : "man";
  if (gender === wanted) return null;
  const line = `This community is for ${audience} only.`;
  return gender === "woman" || gender === "man" ? line : `${line} If that's you, set your gender in your profile settings to join.`;
}

/** What someone sees on a profile they aren't allowed to see more of. */
export const hiddenProfileText = (reason?: "private" | "members" | "friends") =>
  reason === "members" ? "Only people who share a community with them can see this profile." : reason === "friends" ? "Only their friends can see this profile." : "This profile is private.";

export const REPORT_REASONS = [
  { id: "spam", label: "Spam or scam" },
  { id: "harassment", label: "Harassment or bullying" },
  { id: "hate", label: "Hate or discrimination" },
  { id: "unsafe", label: "Unsafe or illegal activity" },
  { id: "impersonation", label: "Impersonation" },
  // hidden at once, top of the admin queue (policies/adult)
  { id: "minor", label: "Involves a minor, or shared without consent" },
  { id: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["id"];

/** A topic has to be this lively (comments) before the home page calls it trending. */
export const TRENDING_MIN_COMMENTS = 30;

/**
 * Voice channels ("hangout") are switched off for now and shown as "coming soon": they're hidden from channel
 * lists, can't be created or joined, and existing ones stay in the database untouched. Flip to true to bring
 * them back (LiveKit keys must be set; see .env.example).
 */
export const VOICE_ENABLED = false;

/** Slow mode choices for a channel, in seconds (0 = off): how long each person waits between messages. */
export const SLOW_MODE_STEPS = [0, 5, 10, 30, 60, 120, 300, 600, 900, 1800, 3600] as const;

/** "5s", "2m", "1h" (and "Off" for 0). */
export function slowModeLabel(sec: number): string {
  if (!sec) return "Off";
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${Math.round(sec / 3600)}h`;
}

/** The status you set on your profile card (shown as the dot on your picture). "invisible" shows no dot. */
export const PRESENCES = [
  { id: "online", label: "Online" },
  { id: "idle", label: "Idle" },
  { id: "dnd", label: "Do not disturb" },
  { id: "invisible", label: "Invisible" },
] as const;
export type Presence = (typeof PRESENCES)[number]["id"];
