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
    payoutBank: { type: Schema.Types.Mixed, default: null },
    official: { type: Boolean, default: false },
  },
  { timestamps: true },
);

CommunitySchema.index({ privacy: 1, country: 1, city: 1, interest: 1, memberCount: -1 });
CommunitySchema.index({ name: "text", description: "text" });

export const Community: Model<ICommunity> = defineModel<ICommunity>("Community", CommunitySchema);
