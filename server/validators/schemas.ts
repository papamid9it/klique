import { z } from "zod";
import { DATE_FILTERS } from "@/lib/dates";
import { DM_POLICIES, LIMITS, PRESENCES, PROFILE_VISIBILITY, REPORT_REASONS, SLOW_MODE_STEPS } from "@/lib/constants";
import { FRAME_IDS, NAME_EFFECT_IDS } from "@/lib/cosmetics";
import { MOOD_IDS } from "@/lib/moods";
import { REACTION_IDS, STICKER_IDS } from "@/lib/reactions";
import { NOTIFY_CATEGORY_IDS } from "@/lib/notifications";
import { blankToUndef, handle, httpUrl, interestId, objectId, pageQuery, placeDefault, placeOptional, placeRequired, whereParam } from "./common";

const text = (max: number, min = 0) => z.string().trim().min(min).max(max);
const optText = (max: number) => z.string().trim().max(max).optional();

/** URL field where "" or null clears the value and undefined leaves it unchanged. */
const clearableUrl = z.union([httpUrl, z.literal(""), z.null()]).optional();

const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date and time")
  .transform((v) => new Date(v));

/* -------------------------------- auth ------------------------------ */

const emailField = z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address"));
const newPassword = z.string().min(8, "Use at least 8 characters").max(72, "Use at most 72 characters");
const mailToken = z.string().trim().min(20, "This link is incomplete").max(200);

export const signupSchema = z.object({
  email: emailField,
  password: newPassword,
  displayName: text(LIMITS.displayName, 1).pipe(z.string().min(1, "Tell us what to call you")),
  handle,
  ...placeDefault,
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().min(1, "Enter your password").max(200),
});

export const forgotPasswordSchema = z.object({ email: emailField });
export const resetPasswordSchema = z.object({ token: mailToken, password: newPassword });
export const appCodeSchema = z.object({ code: mailToken, verifier: z.string().trim().min(32).max(200) });
export const verifyEmailSchema = z.object({ token: mailToken });
export const changePasswordSchema = z.object({
  /** not needed for accounts that signed up with Google and have no password yet */
  currentPassword: z.string().max(200).optional(),
  newPassword,
});

/* ------------------------------- profile ---------------------------- */

export const profileUpdateSchema = z.object({
  displayName: text(LIMITS.displayName, 1).optional(),
  bio: optText(LIMITS.bio),
  pronouns: optText(LIMITS.pronouns),
  presence: z.enum(PRESENCES.map((p) => p.id) as [string, ...string[]]).optional(),
  ...placeOptional,
  neighborhood: optText(60),
  interests: z
    .array(interestId)
    .max(LIMITS.maxInterests)
    .transform((a) => [...new Set(a)])
    .optional(),
  avatarUrl: clearableUrl,
  bannerUrl: clearableUrl,
  bannerColor: z.union([z.string().regex(/^#[0-9a-fA-F]{6}$/), z.literal(""), z.null()]).optional(),
  avatarFrame: z.union([z.enum(FRAME_IDS as [string, ...string[]]), z.literal(""), z.null()]).optional(),
  nameEffect: z.union([z.enum(NAME_EFFECT_IDS as [string, ...string[]]), z.literal(""), z.null()]).optional(),
  profileTheme: z.object({ primary: z.string().regex(/^#[0-9a-fA-F]{6}$/), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).nullable().optional(),
  profileEffect: z.union([z.string().regex(/^[a-z0-9-]{1,40}$/), z.literal(""), z.null()]).optional(),
  mood: z.enum(MOOD_IDS as [string, ...string[]]).optional(),
  profileVisibility: z.enum(PROFILE_VISIBILITY.map((p) => p.id) as [string, ...string[]]).optional(),
  attendancePublic: z.boolean().optional(),
  dmPolicy: z.enum(DM_POLICIES.map((p) => p.id) as [string, ...string[]]).optional(),
});

export const peopleQuery = pageQuery.extend({
  where: whereParam,
  interest: z.preprocess(blankToUndef, interestId.optional()),
  q: z.preprocess(blankToUndef, z.string().trim().max(60).optional()),
});

/* ----------------------------- communities -------------------------- */

export const communityCreateSchema = z.object({
  name: text(LIMITS.communityName, 3),
  description: text(LIMITS.communityDescription).default(""),
  interest: interestId,
  ...placeRequired,
  neighborhood: optText(60).default(""),
  privacy: z.enum(["public", "private"]).default("public"),
  groupPolicy: z.enum(["admins", "members", "off"]).default("admins"),
  feedPolicy: z.enum(["admins", "members", "off"]).default("off"),
  coverImage: clearableUrl,
});

/** a points minimum to join or post (lib/points); 0 turns it off */
const minPoints = z.number().int().min(0).max(1_000_000).optional();

export const communityUpdateSchema = z.object({
  name: text(LIMITS.communityName, 3).optional(),
  description: optText(LIMITS.communityDescription),
  interest: interestId.optional(),
  ...placeOptional,
  neighborhood: optText(60),
  privacy: z.enum(["public", "private"]).optional(),
  groupPolicy: z.enum(["admins", "members", "off"]).optional(),
  feedPolicy: z.enum(["admins", "members", "off"]).optional(),
  minPointsJoin: minPoints,
  minPointsPost: minPoints,
  memberEvents: z.boolean().optional(),
  coverImage: clearableUrl,
});

export const communityListQuery = pageQuery.extend({
  where: whereParam,
  interest: z.preprocess(blankToUndef, interestId.optional()),
  q: z.preprocess(blankToUndef, z.string().trim().max(60).optional()),
  scope: z.enum(["discover", "joined"]).default("discover"),
});

export const subCreateSchema = z.object({
  name: text(LIMITS.communityName, 3),
  description: text(LIMITS.communityDescription).default(""),
});

export const subUpdateSchema = z.object({
  name: text(LIMITS.communityName, 3).optional(),
  description: optText(LIMITS.communityDescription),
  minPointsJoin: minPoints,
  minPointsPost: minPoints,
});

export const groupAddSchema = z.object({ userIds: z.array(objectId).min(1, "Pick at least one person").max(50) });
export const groupAddableQuery = z.object({ q: z.string().trim().max(60).default("") });

export const joinSchema = z.object({
  message: optText(LIMITS.requestMessage),
  inviteCode: z.string().trim().max(64).optional(),
});

export const roleSchema = z.object({ role: z.enum(["admin", "member"]) });
export const removeMemberSchema = z.object({ ban: z.boolean().optional() });
export const requestDecisionSchema = z.object({ action: z.enum(["approve", "reject"]) });

export const inviteCreateSchema = z.object({
  expiresInDays: z.number().int().min(1).max(90).optional(),
  maxUses: z.number().int().min(1).max(1000).optional(),
});

export const postCreateSchema = z.object({
  body: text(LIMITS.postBody, 1),
  imageUrl: clearableUrl,
});

export const memberListQuery = pageQuery.extend({
  q: z.preprocess(blankToUndef, z.string().trim().max(60).optional()),
});

/* -------------------------------- topics ---------------------------- */

export const topicListQuery = pageQuery.extend({
  sort: z.enum(["hot", "new", "top"]).default("hot"),
  board: z.preprocess(blankToUndef, z.string().trim().max(40).optional()),
  q: z.preprocess(blankToUndef, z.string().trim().max(60).optional()),
  tag: z.preprocess(blankToUndef, z.string().trim().toLowerCase().max(LIMITS.topicTag).optional()),
});
/** http(s) links, or the bundled sample files under /mock/ */
const mediaUrl = z.string().trim().max(2000).refine((v) => /^https?:\/\//i.test(v) || /^\/mock\/[\w.-]+$/.test(v), "Use a full link (https://…)");
const mediaItem = z.object({ kind: z.enum(["image", "video"]), url: mediaUrl, poster: z.union([mediaUrl, z.null()]).optional() });
/** a community post's media: pictures, or one video on its own */
const mediaList = z
  .array(mediaItem)
  .max(LIMITS.feedMedia, `Up to ${LIMITS.feedMedia} pictures`)
  .refine((m) => m.filter((x) => x.kind === "video").length <= 1, "One video per post")
  .refine((m) => !m.some((x) => x.kind === "video") || m.length === 1, "A video can't be mixed with pictures");

export const feedPostSchema = z
  .object({ caption: text(LIMITS.feedCaption).default(""), media: mediaList.default([]) })
  .refine((v) => v.media.length > 0, { path: ["media"], message: "Add a picture or a video" });
export const feedCaptionSchema = z.object({ caption: text(LIMITS.feedCaption) });
export const feedVoteSchema = z.object({ value: z.union([z.literal(1), z.literal(-1), z.literal(0)]) });
export const feedCommentSchema = z
  .object({
    body: text(LIMITS.feedComment),
    sticker: z.enum(STICKER_IDS).optional(),
    /** a saved picture sticker (checked against our uploads by the service) */
    stickerUrl: z.string().trim().min(1).max(600).optional(),
    parentId: z.preprocess(blankToUndef, objectId.optional()),
  })
  .refine((v) => v.body.length > 0 || !!v.sticker || !!v.stickerUrl, { message: "Write a comment or pick a sticker.", path: ["body"] });
export const feedReactSchema = z.object({ kind: z.enum(REACTION_IDS) });
/** a page of the home feed, or of a community's posts */
/** `at`: when page 1 was made, so later pages rank the same posts the same way (no repeats, no gaps). */
export const homeFeedQuery = pageQuery.extend({ at: z.coerce.number().int().positive().optional() });

export const boardCreateSchema = z.object({
  name: text(LIMITS.boardName, 1).pipe(z.string().min(1, "Give the board a name")),
  description: text(LIMITS.boardDescription).default(""),
  postPolicy: z.enum(["members", "admins"]).default("members"),
});
export const boardUpdateSchema = z.object({
  name: text(LIMITS.boardName, 1).optional(),
  description: text(LIMITS.boardDescription).optional(),
  rules: text(LIMITS.boardRules).optional(),
  postPolicy: z.enum(["members", "admins"]).optional(),
});

/** a board post carries at most one picture (no video) */
const postImage = z.array(z.object({ kind: z.literal("image"), url: mediaUrl, poster: z.null().optional() })).max(1, "One picture per post");
const postTags = z.array(z.string().trim().max(LIMITS.topicTag, `Tags can be up to ${LIMITS.topicTag} characters`)).max(LIMITS.topicTags, `Up to ${LIMITS.topicTags} tags`);
export const topicCreateSchema = z.object({
  /** which board (its slug); the first board when left out */
  board: z.string().trim().max(40).optional(),
  title: text(LIMITS.topicTitle, 3),
  body: text(LIMITS.topicBody).default(""),
  media: postImage.optional(),
  tags: postTags.optional(),
}).refine((v) => v.body.length > 0 || (v.media?.length ?? 0) > 0, { path: ["body"], message: "Write something, or add a picture" });
export const topicUpdateSchema = z.object({
  title: text(LIMITS.topicTitle, 3).optional(),
  body: text(LIMITS.topicBody).optional(),
  media: postImage.optional(),
  tags: postTags.optional(),
  /** owners/admins only */
  pinned: z.boolean().optional(),
  locked: z.boolean().optional(),
});
export const commentCreateSchema = z.object({
  body: text(LIMITS.topicComment, 1),
  parentId: z.preprocess(blankToUndef, objectId.optional()),
});
export const commentUpdateSchema = z.object({ body: text(LIMITS.topicComment, 1) });

/* -------------------------------- events ---------------------------- */

const eventFields = {
  title: text(LIMITS.eventTitle, 3),
  description: text(LIMITS.eventDescription).default(""),
  interest: interestId,
  ...placeRequired,
  neighborhood: optText(60).default(""),
  venue: text(LIMITS.venue, 2),
  startsAt: isoDate,
  endsAt: isoDate.optional().nullable(),
  priceNaira: z.number().int().min(0).max(100_000_000).default(0),
  /** ISO 4217 code; defaults to the country's currency */
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  online: z.boolean().default(false),
  ticketUrl: clearableUrl,
  onlineUrl: clearableUrl,
  capacity: z.number().int().min(1).max(100_000).optional().nullable(),
  coverImage: clearableUrl,
};

/** chipping in toward an event: so much a unit, up to so many units at a time (null switches it off) */
const contributionInput = z.object({ label: z.string().trim().max(60).default(""), unitPrice: z.number().int().min(100).max(1_000_000), maxQuantity: z.number().int().min(1).max(100).default(1) }).nullable().optional();

export const eventCreateSchema = z.object({
  ...eventFields,
  contribution: contributionInput,
  interest: interestId.optional(),
  /** host this event inside a community / subcommunity */
  communitySlug: z.string().trim().max(80).optional(),
  subSlug: z.string().trim().max(80).optional(),
});

export const eventUpdateSchema = z.object({
  title: eventFields.title.optional(),
  description: optText(LIMITS.eventDescription),
  interest: interestId.optional(),
  ...placeOptional,
  neighborhood: optText(60),
  venue: eventFields.venue.optional(),
  startsAt: isoDate.optional(),
  endsAt: isoDate.optional().nullable(),
  priceNaira: z.number().int().min(0).max(100_000_000).optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  online: z.boolean().optional(),
  ticketUrl: clearableUrl,
  onlineUrl: clearableUrl,
  capacity: z.number().int().min(1).max(100_000).optional().nullable(),
  coverImage: clearableUrl,
  cancelled: z.boolean().optional(),
  contribution: contributionInput,
});

export const eventListQuery = pageQuery.extend({
  where: whereParam,
  interest: z.preprocess(blankToUndef, interestId.optional()),
  price: z.enum(["any", "free", "paid"]).default("any"),
  format: z.enum(["any", "in-person", "online"]).default("any"),
  /** one calendar day, YYYY-MM-DD (Lagos time) */
  day: z.preprocess(blankToUndef, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  date: z.enum(DATE_FILTERS.map((d) => d.id) as [string, ...string[]]).default("any"),
  q: z.preprocess(blankToUndef, z.string().trim().max(60).optional()),
  community: z.preprocess(blankToUndef, z.string().trim().max(80).optional()),
  sub: z.preprocess(blankToUndef, z.string().trim().max(80).optional()),
  scope: z.enum(["all", "going", "saved", "hosted"]).default("all"),
  past: z.preprocess((v) => v === "true" || v === true, z.boolean()).default(false),
});

/** The events page's side panel: counts per place and per day for whatever is being looked at. */
export const eventOverviewQuery = z.object({ where: whereParam, interest: z.preprocess(blankToUndef, interestId.optional()) });

export const rsvpSchema = z.object({ status: z.enum(["going", "interested"]).default("going") });

/* ------------------------------ discovery --------------------------- */

export const discoverQuery = z.object({ where: whereParam });
export const searchQuery = z.object({
  q: z.string().trim().min(1, "Type something to search").max(60),
  where: whereParam,
});

/* ------------------------------ messaging --------------------------- */

export const startConversationSchema = z.object({
  handle: handle,
  message: z.string().trim().min(1).max(LIMITS.messageBody).optional(),
});
const stickerUrl = z.string().trim().min(1).max(600);
/** a poll posted in a chat: a question, 2 to 10 answers (each with an emoji if you like), and how long it runs */
export const POLL_HOURS = [1, 4, 8, 24, 72, 168] as const;
export const pollInput = z.object({
  question: text(300, 1),
  answers: z.array(z.object({ text: text(55, 1), emoji: z.preprocess(blankToUndef, z.string().trim().max(16).optional()) })).min(2, "Add at least two answers").max(10, "Up to ten answers"),
  multiple: z.boolean().default(false),
  anonymous: z.boolean().default(false),
  hours: z.number().int().refine((h) => (POLL_HOURS as readonly number[]).includes(h), "Pick how long it runs").default(24),
});
const chatPayload = z
  .object({
    body: z.string().trim().max(2000).default(""),
    sticker: z.enum(STICKER_IDS).optional(),
    /** a saved picture sticker (checked against our uploads by the service) */
    stickerUrl: stickerUrl.optional(),
    images: z.array(mediaUrl).max(4, "Up to 4 pictures per message").default([]),
    replyToId: objectId.optional(),
    poll: pollInput.optional(),
  })
  .refine((v) => v.body.length > 0 || !!v.sticker || !!v.stickerUrl || v.images.length > 0 || !!v.poll, { message: "Write a message, add a picture or pick a sticker.", path: ["body"] });
export const sendMessageSchema = chatPayload;
export const pollVoteSchema = z.object({ answerIds: z.array(z.string().max(12)).max(10) });
export const editMessageSchema = z.object({ body: z.string().trim().min(1, "A message can't be empty.").max(2000) });
export const messageListQuery = z.object({
  before: z.preprocess(blankToUndef, objectId.optional()),
});

/* -------------------------------- safety ---------------------------- */

export const reportSchema = z.object({
  targetType: z.enum(["user", "post", "event", "community", "subcommunity", "message", "channelMessage", "ad", "feedPost"]),
  targetId: objectId,
  reason: z.enum(REPORT_REASONS.map((r) => r.id) as [string, ...string[]]),
  details: optText(LIMITS.reportDetails),
});

/* -------------------------------- channels -------------------------- */

const channelName = z
  .string()
  .trim()
  .min(2, "Use at least 2 characters")
  .max(40, "Use at most 40 characters")
  .refine((v) => /[a-z0-9]/i.test(v), "Use letters or numbers");

export const channelCreateSchema = z.object({
  name: channelName,
  topic: optText(200),
  type: z.enum(["text", "announcement", "voice"]).default("text"),
  visibility: z.enum(["all", "managers", "invite"]).default("all"),
  categoryId: objectId.nullable().optional(),
  /** guest list for a private ("invite") channel; must all be members of the space */
  memberIds: z.array(objectId).max(100).optional(),
});

export const channelUpdateSchema = z.object({
  name: channelName.optional(),
  topic: optText(200),
  type: z.enum(["text", "announcement", "voice"]).optional(),
  visibility: z.enum(["all", "managers", "invite"]).optional(),
  categoryId: objectId.nullable().optional(),
  /** slow mode in seconds, one of SLOW_MODE_STEPS (0 = off) */
  slowModeSec: z
    .number()
    .int()
    .refine((n) => (SLOW_MODE_STEPS as readonly number[]).includes(n), "Pick one of the slow mode options.")
    .optional(),
});

export const channelMemberSchema = z.object({ userId: objectId });

export const memberSearchQuery = z.object({ q: z.preprocess(blankToUndef, z.string().trim().max(30).optional()) });

export const unfurlQuery = z.object({ url: z.string().trim().max(2000) });

export const categorySchema = z.object({ name: text(40, 2) });

export const chatBodySchema = chatPayload;
export const pinSchema = z.object({ pinned: z.boolean() });
export const reactSchema = z.object({ kind: z.enum(REACTION_IDS) });
export const reactionIdsQuery = z.object({ ids: z.string().max(2000).transform((v) => v.split(",").map((x) => x.trim()).filter((x) => /^[a-f0-9]{24}$/i.test(x)).slice(0, 80)) });

export const chatListQuery = z.object({
  before: z.preprocess(blankToUndef, objectId.optional()),
  after: z.preprocess(blankToUndef, objectId.optional()),
});

export const friendRequestSchema = z.object({ handle: handle });
export const friendRespondSchema = z.object({ action: z.enum(["accept", "decline"]) });

/* -------------------------------- uploads --------------------------- */

export const uploadSignSchema = z.object({
  kind: z.enum(["avatar", "photo", "video", "effect"]),
  files: z
    .array(z.object({ variant: z.enum(["main", "sm", "poster"]), type: z.string().max(40), size: z.number().int().min(1).max(200 * 1024 * 1024) }))
    .min(1)
    .max(3),
});

/* ------------------------------- admin ------------------------------ */

export const adminReportsQuery = pageQuery.extend({
  status: z.enum(["open", "reviewing", "actioned", "dismissed"]).default("open"),
});

export const adminReportActionSchema = z.object({
  action: z.enum(["dismiss", "reviewing", "remove", "suspend", "remove-and-suspend"]),
  note: z.string().trim().max(300).default(""),
});

export const adminUsersQuery = pageQuery.extend({
  q: z.string().trim().max(100).default(""),
  filter: z.enum(["all", "new", "admins", "suspended", "unverified"]).default("all"),
});

export const adminEventsQuery = pageQuery.extend({
  q: z.string().trim().max(100).default(""),
  filter: z.enum(["upcoming", "past", "cancelled", "imported"]).default("upcoming"),
});

export const adminCommunitiesQuery = pageQuery.extend({
  q: z.string().trim().max(100).default(""),
  sort: z.enum(["members", "new"]).default("members"),
});

export const adminAuditQuery = pageQuery.extend({
  q: z.string().trim().max(100).default(""),
  action: z.string().trim().max(40).regex(/^[a-z.]*$/).default(""),
});

export const adminNoteSchema = z.object({ note: z.string().trim().max(300).default("") });

export const adminEventUpdateSchema = z.object({ cancelled: z.boolean(), note: z.string().trim().max(300).default("") });

export const adminUserUpdateSchema = z
  .object({
    suspended: z.boolean().optional(),
    /** sign them out on every device */
    signOut: z.literal(true).optional(),
    reason: z.string().trim().max(300).default(""),
  })
  .refine((v) => v.suspended !== undefined || v.signOut, "Nothing to change");

export const adminDraftsQuery = z.object({ status: z.enum(["pending", "approved", "rejected"]).default("pending") });

export const adminImportSchema = z.object({ url: z.string().trim().min(1, "Paste a link").max(1000) });

/* ------------------------------ event finder ------------------------------ */

const finderPlace = {
  country: z.string().trim().toUpperCase().max(2).default(""),
  region: z.string().trim().toLowerCase().max(40).default(""),
  city: z.string().trim().max(60).default(""),
  interests: z.array(z.string().trim().max(40)).max(30).default([]),
  includeSources: z.boolean().default(true),
};

export const finderSearchSchema = z.object({
  ...finderPlace,
  from: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Pick a start date"),
  to: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Pick an end date"),
  urls: z.array(z.string().trim().max(1000)).max(20).default([]),
});

export const savedSearchSchema = z.object({
  ...finderPlace,
  country: z.string().trim().toUpperCase().length(2, "Pick a country"),
  name: z.string().trim().max(80).default(""),
  days: z.number().int().min(1).max(180).default(30),
});

export const savedSearchPatchSchema = z.object({ daily: z.boolean().optional(), name: z.string().trim().max(80).optional(), days: z.number().int().min(1).max(180).optional() });

/** where approved drafts go: Klique (no slug) or a community / group */
const draftTarget = { communitySlug: z.string().trim().max(80).optional(), subSlug: z.string().trim().max(80).optional() };

export const draftBulkSchema = z.object({
  ids: z.array(z.string().regex(/^[a-f0-9]{24}$/)).min(1, "Pick some events").max(100),
  action: z.enum(["approve", "reject"]),
  ...draftTarget,
});

const draftDate = z.union([z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date and time"), z.null()]).optional();

export const adminDraftPatchSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(4000).optional(),
  interest: interestId.optional(),
  organizerName: z.string().max(120).optional(),
  country: z.string().trim().max(2).optional(),
  region: z.string().trim().toLowerCase().max(40).optional(),
  city: z.string().trim().max(60).optional(),
  venue: z.string().max(200).optional(),
  online: z.boolean().optional(),
  startsAt: draftDate,
  endsAt: draftDate,
  price: z.number().min(0).max(100_000_000).optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  coverImage: z.union([httpUrl, z.literal(""), z.null()]).optional(),
  ...draftTarget,
});

export const adminSourceSchema = z.object({
  url: z.string().trim().min(1, "Paste a link").max(1000),
  name: z.string().trim().max(120).default(""),
});

/* --------------------------------- ads ------------------------------ */

const adSlot = z.enum(["home-feed", "home-rail", "events-list", "event-page", "search", "communities"]);

export const adServeQuery = z.object({
  slot: adSlot,
  where: z.preprocess(blankToUndef, z.string().max(80).optional()),
  interest: z.preprocess(blankToUndef, interestId.optional()),
  q: z.string().max(100).optional(),
  exclude: z.preprocess(blankToUndef, objectId.optional()),
  count: z.coerce.number().int().min(1).max(3).default(1),
});

export const adInputSchema = z.object({
  name: z.string().trim().min(1, "Give the ad a name").max(120),
  kind: z.enum(["event", "brand", "community"]),
  eventId: z.union([objectId, z.null()]).optional(),
  communityId: z.union([objectId, z.null()]).optional(),
  advertiser: z.string().max(80).optional(),
  title: z.string().max(120).optional(),
  body: z.string().max(200).optional(),
  imageUrl: z.union([httpUrl, z.literal(""), z.null()]).optional(),
  ctaLabel: z.string().max(24).optional(),
  url: z.string().max(1000).optional(),
  slots: z.array(adSlot).min(1, "Pick at least one spot on the site for this ad").max(5),
  places: z.array(z.string().max(80)).max(20).default([]),
  interests: z.array(interestId).max(20).default([]),
  keywords: z.array(z.string().max(40)).max(20).default([]),
  startsAt: z.union([z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date"), z.null()]).optional(),
  endsAt: z.union([z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date"), z.null()]).optional(),
  weight: z.number().int().min(1).max(10).default(5),
  status: z.enum(["active", "paused"]).optional(),
});

export const adStatusSchema = z.object({ status: z.enum(["active", "paused"]) });

/** ?slugs=a,b,c for the batched community sidebars */
export const sidebarsQuery = z.object({
  slugs: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => v.split(",").map((x) => x.trim().toLowerCase()).filter((x) => /^[a-z0-9-]{1,80}$/.test(x)))
    .pipe(z.array(z.string()).min(1, "Pass at least one community").max(20)),
});

/* ------------------------------- crews ------------------------------ */

const crewFields = {
  area: text(40, 2),
  meetupPoint: text(120, 2),
  meetupAt: isoDate,
  note: text(300).default(""),
  joinMode: z.enum(["open", "approval"]).default("approval"),
  maxMembers: z.number().int().min(2, "A crew is at least 2 people").max(100, "A crew can have up to 100 people").default(10),
};

export const crewCreateSchema = z.object(crewFields);

export const crewUpdateSchema = z
  .object({
    area: crewFields.area.optional(),
    meetupPoint: crewFields.meetupPoint.optional(),
    meetupAt: isoDate.optional(),
    note: text(300).optional(),
    joinMode: z.enum(["open", "approval"]).optional(),
    maxMembers: z.number().int().min(2).max(100).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to change");

export const crewJoinSchema = z.object({ message: text(200).default("") });
export const crewDecisionSchema = z.object({ accept: z.boolean() });
export const crewMessageSchema = z
  .object({
    body: text(1000).default(""),
    sticker: z.enum(STICKER_IDS).optional(),
    stickerUrl: stickerUrl.optional(),
    images: z.array(mediaUrl).max(4, "Up to 4 pictures per message").default([]),
    replyToId: z.string().regex(/^[a-f0-9]{24}$/).nullish(),
    poll: pollInput.optional(),
  })
  .refine((v) => v.body.length > 0 || !!v.sticker || !!v.stickerUrl || v.images.length > 0 || !!v.poll, { message: "Write a message, add a picture or pick a sticker.", path: ["body"] });
export const crewEditSchema = z.object({ body: text(1000, 1) });

/* ----------------------------- stickers ----------------------------- */

export const saveStickerSchema = z.object({ url: stickerUrl });
export const reorderStickersSchema = z.object({ ids: z.array(objectId).max(200) });
/** an event's crews: `q` searches where they're coming from; `limit` grows with "Load more" */
export const eventCrewsQuery = z.object({
  q: z.preprocess(blankToUndef, z.string().trim().max(40).optional()),
  limit: z.coerce.number().int().min(1).max(200).default(10),
});

export const crewMessagesQuery = z.object({ after: z.string().regex(/^[a-f0-9]{24}$/).optional(), before: z.string().regex(/^[a-f0-9]{24}$/).optional() });

/* --------------------------- notifications -------------------------- */

export const notificationsQuery = z.object({
  before: z.string().datetime().optional(),
  category: z.enum(NOTIFY_CATEGORY_IDS as [string, ...string[]]).optional(),
  unread: z.preprocess((v) => v === "1" || v === "true", z.boolean()).optional(),
});
export const notificationsReadSchema = z
  .object({ ids: z.array(objectId).max(100).optional(), all: z.literal(true).optional() })
  .refine((v) => v.all || (v.ids && v.ids.length > 0), "Nothing to mark");
const channelPref = z.object({ inApp: z.boolean().optional(), push: z.boolean().optional() });
export const notifyPrefsSchema = z.partialRecord(z.enum(NOTIFY_CATEGORY_IDS as [string, ...string[]]), channelPref);

/* ------------------------------- ad requests ------------------------------ */

export const adCampaignSchema = z.object({
  kind: z.enum(["event", "community", "brand"]),
  eventId: z.string().trim().max(40).optional(),
  communitySlug: z.string().trim().max(80).optional(),
  advertiser: z.string().trim().max(80).optional(),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().max(200).optional(),
  imageUrl: z.string().trim().max(1000).nullable().optional(),
  ctaLabel: z.string().trim().max(24).optional(),
  url: z.string().trim().max(1000).optional(),
  placements: z.array(z.string()).min(1, "Pick at least one placement").max(10),
  reach: z.enum(["city", "country", "world"]),
  place: z.string().trim().max(120).nullable().optional(),
  days: z.number().int().min(1).max(365),
  startOn: isoDate.nullable().optional().transform((d) => (d ? d.toISOString() : null)),
});

const naira = z.number().int().min(0).max(100_000_000);
export const adPricingSchema = z.object({
  perDay: z.partialRecord(z.enum(["home-feed", "home-rail", "events-list", "event-page", "search"]), naira).optional(),
  reach: z.partialRecord(z.enum(["city", "country", "world"]), z.number().min(0.1).max(100)).optional(),
  minDays: z.number().int().min(1).max(365).optional(),
  maxDays: z.number().int().min(1).max(365).optional(),
});

export const adReviewSchema = z.object({ action: z.enum(["approve", "changes", "reject", "mark-paid"]), note: z.string().trim().max(500).default("") });
export const adCampaignListQuery = z.object({ status: z.enum(["review", "approved", "running", "all"]).default("review") });
export const adVerifySchema = z.object({ reference: z.string().trim().min(6).max(80) });

/* ------------------------------ Hype (bought) ------------------------------ */

const hypeN = z.number().int().min(0).max(1_000_000);
/** a design you can unlock with Hype (lib/wallet StyleKey) */
const STYLE_KEY_RX = /^(frame|name|theme|effect|anim):[a-z0-9-]+$/;
export const walletConfigSchema = z.object({
  packs: z
    .array(z.object({ id: z.string().trim().regex(/^[a-z0-9-]{1,24}$/), hype: z.number().int().min(1).max(1_000_000), price: z.number().int().min(100).max(10_000_000) }))
    .min(1)
    .max(8)
    .optional(),
  unlockDays: z.number().int().min(1).max(365).optional(),
  defaultPrice: z.object({ frame: hypeN, name: hypeN, theme: hypeN, effect: hypeN, anim: hypeN }).partial().optional(),
  prices: z.record(z.string().regex(STYLE_KEY_RX), hypeN).optional(),
});
export const styleUnlockSchema = z.object({ key: z.string().regex(STYLE_KEY_RX), autoRenew: z.boolean().optional() });
export const autoRenewSchema = z.object({ key: z.string().regex(STYLE_KEY_RX), autoRenew: z.boolean() });
export const buyHypeSchema = z.object({ packId: z.string().trim().min(1).max(24) });
export const hypeHistoryQuery = z.object({ before: z.string().datetime().optional() });
/** Admin → Points → People: give (+) or take (−) Hype or points. */
export const adminAdjustSchema = z.object({ who: z.string().trim().min(1).max(40), currency: z.enum(["hype", "points"]).default("hype"), amount: z.number().int().min(-1_000_000).max(1_000_000), note: z.string().trim().max(200).default("") });
export const adminWalletUserQuery = z.object({ who: z.string().trim().min(1).max(40) });

/* ------------------------------ points (earned) ------------------------------ */

const pointAction = z.enum(["attend", "hostAttendee", "crew", "postUpvote", "boardUpvote", "reaction"]);
export const pointsEarningSchema = z.object({
  actions: z.partialRecord(pointAction, z.number().int().min(0).max(10_000)).optional(),
  caps: z.partialRecord(pointAction, z.number().int().min(0).max(1_000_000)).optional(),
});
/** Admin → Profile effects: an uploaded Lottie JSON, the frame it waits on, a name and a Hype price (null: the default). */
export const profileEffectSchema = z.object({
  name: z.string().trim().min(1, "Give it a name").max(40),
  fileUrl: z.string().trim().url().max(1000).refine((u) => /\.(json|lottie)($|[?#])/i.test(u), "Upload a Lottie: a .lottie or .json file."),
  /** where it waits when it isn't playing (picker tiles, animations off, data saver), 0 to 1 */
  posterFrame: z.number().min(0).max(1).optional(),
  price: z.number().int().min(0).max(1_000_000).nullable().optional(),
  active: z.boolean().optional(),
});

/* ------------------------------ money ------------------------------ */

export const moneyConfigSchema = z.object({
  donationFeePercent: z.number().min(0).max(50).optional(),
  contributionFeePercent: z.number().min(0).max(50).optional(),
  minPayout: z.number().int().min(100).max(10_000_000).optional(),
});
export const donationButtonSchema = z.object({
  title: z.string().trim().min(1, "Give it a name").max(60),
  description: z.string().trim().max(300).optional(),
  goal: z.number().int().min(100).max(1_000_000_000).nullable().optional(),
  active: z.boolean().optional(),
});
/** a donation: they must tick that donations can't be refunded */
export const donateSchema = z.object({ buttonId: objectId, amount: z.number().int().min(100).max(5_000_000), message: z.string().trim().max(200).optional(), agree: z.literal(true, { message: "Tick that you understand donations can't be refunded." }) });
/** a contribution: they must tick the refund terms */
export const contributeSchema = z.object({ quantity: z.number().int().min(1).max(100), agree: z.literal(true, { message: "Tick that you've read how refunds work." }) });
export const payVerifySchema = z.object({ reference: z.string().trim().regex(/^k(dn|ct)_[a-f0-9]{18}$/, "That isn't a payment reference.") });
export const payoutRequestSchema = z.object({
  useSaved: z.boolean().optional(),
  bankCode: z.string().trim().max(20).optional(),
  bankName: z.string().trim().max(80).optional(),
  accountNumber: z.string().trim().max(20).optional(),
  accountName: z.string().trim().max(120).optional(),
});
export const payoutDecisionSchema = z.object({ decision: z.enum(["paid", "rejected"]), reference: z.string().trim().max(120).optional(), note: z.string().trim().max(300).optional() });
export const payoutListQuery = z.object({ status: z.enum(["requested", "paid", "rejected", "all"]).default("requested") });

/** An owner or admin deciding on a member's event: a reason is needed to turn one down. */
export const eventReviewSchema = z.object({ decision: z.enum(["approve", "reject"]), reason: z.string().trim().max(500).default("") });
export const attendanceSchema = z.object({ userIds: z.array(z.string().regex(/^[a-f0-9]{24}$/)).min(1).max(500), attended: z.boolean() });

/** Admin → Categories: the whole list, in order. */
export const categoriesListSchema = z.object({
  categories: z
    .array(
      z.object({
        id: z.string().trim().min(2).max(30),
        name: z.string().trim().min(1).max(40),
        short: z.string().trim().max(16).optional().default(""),
        glyph: z.string().trim().max(4).optional().default(""),
        hidden: z.boolean().optional(),
      }),
    )
    .min(3)
    .max(60),
});

/** Onboarding step 1: what you're into (at least 3). */
export const onboardingInterestsSchema = z.object({ interests: z.array(interestId).min(3, "Pick at least 3.").max(20) });
