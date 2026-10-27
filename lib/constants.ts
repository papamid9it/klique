export const APP_NAME = "klique";

/**
 * The one default community, "Klique": everyone is in it from signup and can't leave. Only site admins post its
 * events, and those are the only events everyone sees; every other event is for its own community's (or group's)
 * members. Announcements are made there.
 */
export const KLIQUE_SLUG = "klique";

/** Where people can reach you about their data or the rules (shown on /terms and /privacy). Set NEXT_PUBLIC_SUPPORT_EMAIL. */
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "";

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

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "skate", name: "Skateboarding", short: "Skate", glyph: "✳" },
  { id: "music", name: "Alté & indie music", short: "Music", glyph: "♫" },
  { id: "streetwear", name: "Streetwear", short: "Streetwear", glyph: "✦" },
  { id: "photography", name: "Photography", short: "Photo", glyph: "◉" },
  { id: "running", name: "Running", short: "Running", glyph: "↗" },
  { id: "art", name: "Art", short: "Art", glyph: "◐" },
  { id: "film", name: "Film", short: "Film", glyph: "▶" },
  { id: "dance", name: "Dance", short: "Dance", glyph: "❋" },
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
  /** groups are small and private: at most this many people, owner included */
  groupMembers: 50,
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
  maxInterests: 8,
  pageSize: 12,
} as const;

export const HANDLE_REGEX = /^[a-z0-9_]+$/;

export type DmPolicy = "everyone" | "shared" | "nobody";
export const DM_POLICIES: { id: DmPolicy; label: string; hint: string }[] = [
  { id: "everyone", label: "Everyone", hint: "Anyone on klique can message you." },
  {
    id: "shared",
    label: "People in my communities",
    hint: "Only people who share at least one community with you.",
  },
  { id: "nobody", label: "Nobody", hint: "Your inbox is closed to new conversations." },
];

export type ProfileVisibility = "public" | "members" | "private";
export const PROFILE_VISIBILITY: { id: ProfileVisibility; label: string; hint: string }[] = [
  { id: "public", label: "Public", hint: "Anyone can view your scene card." },
  { id: "members", label: "Shared communities", hint: "Only people who share a community with you." },
  { id: "private", label: "Just me", hint: "Your profile is hidden from everyone else." },
];

export const REPORT_REASONS = [
  { id: "spam", label: "Spam or scam" },
  { id: "harassment", label: "Harassment or bullying" },
  { id: "hate", label: "Hate or discrimination" },
  { id: "unsafe", label: "Unsafe or illegal activity" },
  { id: "impersonation", label: "Impersonation" },
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
