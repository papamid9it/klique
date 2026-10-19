import { z } from "zod";
import { DATE_FILTERS } from "@/lib/dates";
import { DM_POLICIES, LIMITS, PROFILE_VISIBILITY, REPORT_REASONS } from "@/lib/constants";
import { FRAME_IDS, NAME_EFFECT_IDS } from "@/lib/cosmetics";
import { MOOD_IDS } from "@/lib/moods";
import { REACTION_IDS, STICKER_IDS } from "@/lib/reactions";
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
  coverImage: clearableUrl,
});

export const communityUpdateSchema = z.object({
  name: text(LIMITS.communityName, 3).optional(),
  description: optText(LIMITS.communityDescription),
  interest: interestId.optional(),
  ...placeOptional,
  neighborhood: optText(60),
  privacy: z.enum(["public", "private"]).optional(),
  groupPolicy: z.enum(["admins", "members", "off"]).optional(),
  eventPolicy: z.enum(["admins", "members"]).optional(),
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
  visibility: z.enum(["parent", "private"]).default("parent"),
});

export const subUpdateSchema = z.object({
  name: text(LIMITS.communityName, 3).optional(),
  description: optText(LIMITS.communityDescription),
  visibility: z.enum(["parent", "private"]).optional(),
});

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
});
/** http(s) links, or the bundled sample files under /mock/ */
const mediaUrl = z.string().trim().max(2000).refine((v) => /^https?:\/\//i.test(v) || /^\/mock\/[\w.-]+$/.test(v), "Use a full link (https://…)");
const mediaItem = z.object({ kind: z.enum(["image", "video"]), url: mediaUrl, poster: z.union([mediaUrl, z.null()]).optional() });
const mediaList = z
  .array(mediaItem)
  .max(LIMITS.topicMedia, `Up to ${LIMITS.topicMedia} pictures or videos`)
  .refine((m) => m.filter((x) => x.kind === "video").length <= 1, "One video per topic")
  .refine((m) => !m.some((x) => x.kind === "video") || m.length === 1, "A video can't be mixed with pictures");

export const boardCreateSchema = z.object({
  name: text(LIMITS.boardName, 1).pipe(z.string().min(1, "Give the board a name")),
  description: text(LIMITS.boardDescription).default(""),
  postPolicy: z.enum(["members", "admins"]).default("members"),
});
export const boardUpdateSchema = z.object({
  name: text(LIMITS.boardName, 1).optional(),
  description: text(LIMITS.boardDescription).optional(),
  postPolicy: z.enum(["members", "admins"]).optional(),
});

export const topicCreateSchema = z.object({
  /** which board (its slug); the first board when left out */
  board: z.string().trim().max(40).optional(),
  title: text(LIMITS.topicTitle, 3),
  body: text(LIMITS.topicBody).default(""),
  media: mediaList.optional(),
}).refine((v) => v.body.length > 0 || (v.media?.length ?? 0) > 0, { path: ["body"], message: "Write something, or add a picture or video" });
export const topicUpdateSchema = z.object({
  title: text(LIMITS.topicTitle, 3).optional(),
  body: text(LIMITS.topicBody).optional(),
  media: mediaList.optional(),
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
  capacity: z.number().int().min(1).max(100_000).optional().nullable(),
  coverImage: clearableUrl,
};

export const eventCreateSchema = z.object({
  ...eventFields,
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
  capacity: z.number().int().min(1).max(100_000).optional().nullable(),
  coverImage: clearableUrl,
  cancelled: z.boolean().optional(),
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
const chatPayload = z
  .object({
    body: z.string().trim().max(2000).default(""),
    sticker: z.enum(STICKER_IDS).optional(),
    images: z.array(mediaUrl).max(4, "Up to 4 pictures per message").default([]),
    replyToId: objectId.optional(),
  })
  .refine((v) => v.body.length > 0 || !!v.sticker || v.images.length > 0, { message: "Write a message, add a picture or pick a sticker.", path: ["body"] });
export const sendMessageSchema = chatPayload;
export const editMessageSchema = z.object({ body: z.string().trim().min(1, "A message can't be empty.").max(2000) });
export const messageListQuery = z.object({
  before: z.preprocess(blankToUndef, objectId.optional()),
});

/* -------------------------------- safety ---------------------------- */

export const reportSchema = z.object({
  targetType: z.enum(["user", "post", "event", "community", "subcommunity", "message", "channelMessage"]),
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

export const uploadSignSchema = z.object({ kind: z.enum(["avatar", "photo", "video"]) });

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
  filter: z.enum(["all", "new", "admins", "hosts", "suspended", "unverified"]).default("all"),
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
    canHostPublic: z.boolean().optional(),
    suspended: z.boolean().optional(),
    /** sign them out on every device */
    signOut: z.literal(true).optional(),
    reason: z.string().trim().max(300).default(""),
  })
  .refine((v) => v.canHostPublic !== undefined || v.suspended !== undefined || v.signOut, "Nothing to change");

export const adminDraftsQuery = z.object({ status: z.enum(["pending", "approved", "rejected"]).default("pending") });

export const adminImportSchema = z.object({ url: z.string().trim().min(1, "Paste a link").max(1000) });

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
});

export const adminSourceSchema = z.object({
  url: z.string().trim().min(1, "Paste a link").max(1000),
  name: z.string().trim().max(120).default(""),
});
