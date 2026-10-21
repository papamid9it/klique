import { Schema, model, models, type Model, type Types } from "mongoose";
import { INTEREST_IDS, type DmPolicy, type InterestId, type ProfileVisibility } from "@/lib/constants";
import { FRAME_IDS, NAME_EFFECT_IDS } from "@/lib/cosmetics";
import { DEFAULT_MOOD, MOOD_IDS, type MoodId } from "@/lib/moods";

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
  country: string;
  region: string;
  city: string;
  neighborhood: string;
  bio: string;
  interests: InterestId[];
  mood: MoodId;
  profileVisibility: ProfileVisibility;
  attendancePublic: boolean;
  dmPolicy: DmPolicy;
  /** bump to invalidate every issued login token */
  tokenVersion: number;
  isDemo?: boolean;
  /** which notifications they want, in the app and as push (lib/notifications: missing = on) */
  notifyPrefs?: Record<string, { inApp?: boolean; push?: boolean }>;
  /** points balance (lib/points); changed only with atomic $inc next to a PointTxn */
  points?: number;
  /** set by a site admin: the account can't sign in or use the API */
  suspendedAt?: Date | null;
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
    country: { type: String, default: "NG" },
    region: { type: String, default: "" },
    city: { type: String, default: "lagos" },
    neighborhood: { type: String, default: "", maxlength: 60 },
    bio: { type: String, default: "", maxlength: 280 },
    interests: { type: [{ type: String, enum: INTEREST_IDS }], default: [] },
    mood: { type: String, enum: MOOD_IDS, default: DEFAULT_MOOD },
    profileVisibility: { type: String, enum: ["public", "members", "private"], default: "public" },
    attendancePublic: { type: Boolean, default: true },
    dmPolicy: { type: String, enum: ["everyone", "shared", "nobody"], default: "shared" },
    tokenVersion: { type: Number, default: 0 },
    isDemo: { type: Boolean, default: false },
    notifyPrefs: { type: Schema.Types.Mixed, default: {} },
    points: { type: Number, default: 0, min: 0 },
    suspendedAt: { type: Date, default: null },
    suspendedReason: { type: String, default: "", maxlength: 300 },
  },
  { timestamps: true },
);

UserSchema.index({ country: 1, city: 1, interests: 1 });
UserSchema.index({ displayName: "text", handle: "text" });

export const User: Model<IUser> = (models.User as Model<IUser>) || model<IUser>("User", UserSchema);
