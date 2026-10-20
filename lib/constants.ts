export const APP_NAME = "klique";

/** Where people can reach you about their data or the rules (shown on /terms and /privacy). Set NEXT_PUBLIC_SUPPORT_EMAIL. */
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "";

/** City slugs are open now (see lib/places.ts); kept as an alias so signatures read well. */
export type CityId = string;

/* ------------------------------------------------------------------ */
/* Interests                                                           */
/* ------------------------------------------------------------------ */

export const INTERESTS = [
  { id: "skate", name: "Skateboarding", short: "Skate", glyph: "✳" },
  { id: "music", name: "Alté & indie music", short: "Music", glyph: "♫" },
  { id: "streetwear", name: "Streetwear", short: "Streetwear", glyph: "✦" },
  { id: "photography", name: "Photography", short: "Photo", glyph: "◉" },
  { id: "running", name: "Running", short: "Running", glyph: "↗" },
  { id: "art", name: "Art", short: "Art", glyph: "◐" },
  { id: "film", name: "Film", short: "Film", glyph: "▶" },
  { id: "dance", name: "Dance", short: "Dance", glyph: "❋" },
] as const;

export type InterestId = (typeof INTERESTS)[number]["id"];
export const INTEREST_IDS = INTERESTS.map((i) => i.id) as InterestId[];

export function getInterest(id: string | null | undefined) {
  return INTERESTS.find((i) => i.id === id) ?? INTERESTS[0];
}
export function isInterestId(id: unknown): id is InterestId {
  return typeof id === "string" && (INTEREST_IDS as string[]).includes(id);
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
  communityName: 60,
  communityDescription: 1200,
  eventTitle: 100,
  eventDescription: 4000,
  venue: 120,
  postBody: 1500,
  topicTitle: 160,
  topicBody: 6000,
  topicMedia: 6,
  boardName: 30,
  boardDescription: 120,
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
