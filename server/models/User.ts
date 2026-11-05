import { Schema, type Model, type Types } from "mongoose";
import { PRESENCES, type DmPolicy, type InterestId, type Presence, type ProfileVisibility } from "@/lib/constants";
import { defineModel } from "./define";
import { FRAME_IDS, NAME_EFFECT_IDS } from "@/lib/cosmetics";
import { DEFAULT_PREF, MOOD_PREFS, type MoodPref } from "@/lib/moods";

export interface IUser {
  _id: Types.ObjectId;
  email: string;
  passwordHash?: string;
  /** false for accounts created with Google that never set a password */
  hasPassword?: boolean;
  /** set once the person has proved they own the email (link, Google, or password reset) */
  emailVerifiedAt?: Date | null;
  googleId?: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bannerUrl?: string | null;
  bannerColor?: string | null;
  avatarFrame?: string | null;
  nameEffect?: string | null;
  /** two colours tinting their profile card (Nitro-style theme) */
  profileTheme?: { primary: string; accent: string } | null;
  /** an animated layer over their profile card */
  profileEffect?: string | null;
  country: string;
  region: string;
  city: string;
  neighborhood: string;
  bio: string;
  /** shown after the name on the profile card, e.g. "she/her" */
  pronouns?: string;
  /** profile photos and short videos, in order (up to 4; how many show, and how many may be videos, is the plan's) */
  media?: { kind: "image" | "video"; url: string; poster: string | null }[];
  socials?: { platform: string; handle: string }[];
  /** Lite or Pro (lib/plans), until `planUntil`; after that they're on Free. Set by subscriptions.service only. */
  plan?: "free" | "lite" | "pro";
  planUntil?: Date | null;
  /** when they last used the app (updated at most every couple of minutes): "online now" for @here */
  lastSeenAt?: Date | null;
  /** optional; only used for "Women only" kliques (never shown on the profile) */
  gender?: "woman" | "man" | "unspecified";
  /** the status the person set (the dot on their picture) */
  presence?: Presence;
  interests: InterestId[];
  /** a mood, or "system" (match the device) */
  mood: MoodPref;
  profileVisibility: ProfileVisibility;
  attendancePublic: boolean;
  dmPolicy: DmPolicy;
  /** bump to invalidate every issued login token */
  tokenVersion: number;
  isDemo?: boolean;
  /** which notifications they want, in the app and as push (lib/notifications: missing = on) */
  notifyPrefs?: Record<string, { inApp?: boolean; push?: boolean }>;
  /** Hype balance, the currency you buy (lib/wallet); changed only with atomic $inc next to a HypeTxn */
  hype?: number;
  /** points earned from other people (lib/points); never bought, never spent, never go down by themselves */
  points?: number;
  /** set by a site admin: the account can't sign in or use the API */
  suspendedAt?: Date | null;
  /** finished joining: picked 3+ categories and joined 2+ communities (null: they're sent to /welcome) */
  onboardedAt?: Date | null;
  /** a bot's own account (models/BotApp): it can't sign in, take DMs or friend requests; shown with a BOT tag */
  bot?: { appId: Types.ObjectId } | null;
  /** date of birth: set once by the person (dobSetAt), changed after that only by a site admin (policies/adult) */
  dob?: Date | null;
  dobSetAt?: Date | null;
  /** said "I'm 18 or older" before first entering an 18+ community */
  adultConfirmedAt?: Date | null;
  /** "Show explicit content" on in Settings (18+ only, with its agreement): when they agreed. Null: off */
  explicitOptInAt?: Date | null;
  suspendedReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, select: false },
    hasPassword: { type: Boolean, default: true },
    emailVerifiedAt: { type: Date, default: null },
    googleId: { type: String, unique: true, sparse: true },
    handle: { type: String, required: true, unique: true, lowercase: true, trim: true, minlength: 3, maxlength: 20 },
    displayName: { type: String, required: true, trim: true, maxlength: 50 },
    avatarUrl: { type: String, default: null },
    bannerUrl: { type: String, default: null },
    bannerColor: { type: String, default: null, match: /^#[0-9a-fA-F]{6}$/ },
    avatarFrame: { type: String, enum: [...FRAME_IDS, null], default: null },
    nameEffect: { type: String, enum: [...NAME_EFFECT_IDS, null], default: null },
    profileTheme: { type: new Schema({ primary: { type: String, match: /^#[0-9a-f]{6}$/i, required: true }, accent: { type: String, match: /^#[0-9a-f]{6}$/i, required: true } }, { _id: false }), default: null },
    profileEffect: { type: String, default: null, maxlength: 40 },
    country: { type: String, default: "NG" },
    region: { type: String, default: "" },
    city: { type: String, default: "lagos" },
    neighborhood: { type: String, default: "", maxlength: 60 },
    bio: { type: String, default: "", maxlength: 280 },
    socials: { type: [{ _id: false, platform: { type: String, required: true }, handle: { type: String, required: true, maxlength: 60 } }], default: [] },
    pronouns: { type: String, default: "", maxlength: 40 },
    gender: { type: String, enum: ["woman", "man", "unspecified"], default: "unspecified" },
    media: {
      type: [{ _id: false, kind: { type: String, enum: ["image", "video"], required: true }, url: { type: String, required: true, maxlength: 2000 }, poster: { type: String, default: null, maxlength: 2000 } }],
      default: [],
    },
    plan: { type: String, enum: ["free", "lite", "pro"], default: "free" },
    lastSeenAt: { type: Date, default: null },
    planUntil: { type: Date, default: null },
    presence: { type: String, enum: PRESENCES.map((p) => p.id), default: "online" },
    interests: { type: [{ type: String }], default: [] },
    mood: { type: String, enum: MOOD_PREFS, default: DEFAULT_PREF },
    profileVisibility: { type: String, enum: ["public", "members", "friends", "private"], default: "public" },
    attendancePublic: { type: Boolean, default: true },
    // new accounts: anyone can send a message request (Nov 2026; was "shared")
    dmPolicy: { type: String, enum: ["everyone", "shared", "nobody"], default: "everyone" },
    tokenVersion: { type: Number, default: 0 },
    isDemo: { type: Boolean, default: false },
    notifyPrefs: { type: Schema.Types.Mixed, default: {} },
    hype: { type: Number, default: 0, min: 0 },
    points: { type: Number, default: 0, min: 0 },
    suspendedAt: { type: Date, default: null },
    onboardedAt: { type: Date, default: null },
    bot: { type: new Schema({ appId: { type: Schema.Types.ObjectId, required: true } }, { _id: false }), default: null },
    dob: { type: Date, default: null },
    dobSetAt: { type: Date, default: null },
    adultConfirmedAt: { type: Date, default: null },
    explicitOptInAt: { type: Date, default: null },
    suspendedReason: { type: String, default: "", maxlength: 300 },
  },
  { timestamps: true },
);

UserSchema.index({ country: 1, city: 1, interests: 1 });
UserSchema.index({ displayName: "text", handle: "text" });

export const User: Model<IUser> = defineModel<IUser>("User", UserSchema);
