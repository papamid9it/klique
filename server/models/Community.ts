import { Schema, type Model, type Types } from "mongoose";
import { type InterestId } from "@/lib/constants";
import { defineModel } from "./define";

export interface ICommunity {
  _id: Types.ObjectId;
  slug: string;
  name: string;
  description: string;
  interest: InterestId;
  country: string;
  region: string;
  city: string;
  neighborhood: string;
  privacy: "public" | "private";
  coverImage: string | null;
  ownerId: Types.ObjectId;
  /** denormalised; always recomputed from memberships (see recountMembers) */
  memberCount: number;
  /** default channels have been created (set once, so deleting channels never re-creates them) */
  channelsReady?: boolean;
  /** who may create groups inside this community */
  groupPolicy: "admins" | "members" | "off";
  /** the Posts section (pictures and videos with a caption): off, or who may post there */
  feedPolicy?: "admins" | "members" | "off";
  /** made by Klique, can't be deleted. The default "Klique" community (slug "klique") is the official one */
  official?: boolean;
  /** points (lib/points) someone needs to join, and to post in the Posts section (nothing else). 0: anyone. Never on Klique. */
  minPointsJoin?: number;
  minPointsPost?: number;
  /** members may send events in for the owner or an admin to approve (default on) */
  memberEvents?: boolean;
  /** 18+ (private only), and of those, allowing explicit content: who may see them, policies/adult */
  adult?: boolean;
  /** who it's for (fixed when it's made); women or men only are always private */
  audience?: "everyone" | "women" | "men";
  /**
   * "Mention @everyone, @here and all roles" (Discord's permission): owners and admins always may; members only when
   * this is on (off by default). Without it the words still send, they just don't ping anyone.
   */
  membersMassMention?: boolean;
  /** AutoMod settings (lib/automod AutoModConfig; read through automodOf, which fills in defaults) */
  automod?: unknown;
  /** raid protection tripped: until then joining is paused, or goes through approval (`raidMode`) */
  raidUntil?: Date | null;
  raidMode?: "pause" | "approval" | null;
  /** bots added to it (BotApp ids), for sending them events */
  bots?: Types.ObjectId[];
  /**
   * The welcome screen, shown once to each new member: a message, rules (which they may have to accept before
   * posting), roles they can pick themselves, up to 5 channels to start in, and an optional greeting posted in a
   * channel when someone joins ("Welcome {user}!").
   */
  welcome?: {
    enabled: boolean;
    message: string;
    rules: string[];
    requireAccept: boolean;
    channels: { channelId: Types.ObjectId; note: string }[];
    greetChannelId: Types.ObjectId | null;
    greetText: string;
  } | null;
  /** a "Verified" check by its name: given (and taken away) only by site admins; Klique HQ always has it */
  verified?: boolean;
  /** the emoji on the owner's picture inside this community; the owner chooses it, and it stays if ownership moves */
  ownerIcon?: string | null;
  /**
   * Entry questions (like a membership screening): when on, anyone joining answers them first (public: joins right
   * after; private: the answers go with the request). Up to 5. Owners and admins set them in settings.
   */
  screening?: { enabled: boolean; questions: { id: string; kind: "text" | "choice" | "agree"; prompt: string; options: string[]; required: boolean }[] };
  explicit?: boolean;
  /** where payouts go, saved from the owner's last request (only the owner and admins see it) */
  payoutBank?: { bankCode: string; bankName: string; accountNumber: string; accountName: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

const CommunitySchema = new Schema<ICommunity>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, default: "", maxlength: 1200 },
    interest: { type: String, required: true },
    country: { type: String, default: "NG", index: true },
    region: { type: String, default: "" },
    city: { type: String, required: true },
    neighborhood: { type: String, default: "", maxlength: 60 },
    privacy: { type: String, enum: ["public", "private"], default: "public" },
    coverImage: { type: String, default: null },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    memberCount: { type: Number, default: 0 },
    channelsReady: { type: Boolean, default: false },
    groupPolicy: { type: String, enum: ["admins", "members", "off"], default: "admins" },
    feedPolicy: { type: String, enum: ["admins", "members", "off"], default: "off" },
    minPointsJoin: { type: Number, default: 0, min: 0, max: 1_000_000 },
    minPointsPost: { type: Number, default: 0, min: 0, max: 1_000_000 },
    memberEvents: { type: Boolean, default: true },
    adult: { type: Boolean, default: false },
    audience: { type: String, enum: ["everyone", "women", "men"], default: "everyone" },
    verified: { type: Boolean, default: false },
    ownerIcon: { type: String, default: null, maxlength: 16 },
    membersMassMention: { type: Boolean, default: false },
    automod: { type: Schema.Types.Mixed, default: null },
    raidUntil: { type: Date, default: null },
    raidMode: { type: String, enum: ["pause", "approval", null], default: null },
    bots: { type: [Schema.Types.ObjectId], default: [] },
    welcome: {
      type: new Schema(
        {
          enabled: { type: Boolean, default: false },
          message: { type: String, default: "", maxlength: 1000 },
          rules: { type: [String], default: [] },
          requireAccept: { type: Boolean, default: true },
          channels: { type: [new Schema({ channelId: { type: Schema.Types.ObjectId, required: true }, note: { type: String, default: "", maxlength: 120 } }, { _id: false })], default: [] },
          greetChannelId: { type: Schema.Types.ObjectId, default: null },
          greetText: { type: String, default: "", maxlength: 300 },
        },
        { _id: false },
      ),
      default: null,
    },
    screening: {
      enabled: { type: Boolean, default: false },
      questions: {
        type: [{ _id: false, id: { type: String, required: true }, kind: { type: String, enum: ["text", "choice", "agree"], required: true }, prompt: { type: String, required: true, maxlength: 200 }, options: { type: [String], default: [] }, required: { type: Boolean, default: true } }],
        default: [],
      },
    },
    explicit: { type: Boolean, default: false },
    payoutBank: { type: Schema.Types.Mixed, default: null },
    official: { type: Boolean, default: false },
  },
  { timestamps: true },
);

CommunitySchema.index({ privacy: 1, country: 1, city: 1, interest: 1, memberCount: -1 });
CommunitySchema.index({ name: "text", description: "text" });

export const Community: Model<ICommunity> = defineModel<ICommunity>("Community", CommunitySchema);
