import { Schema, model, models, type Model, type Types } from "mongoose";
import { INTEREST_IDS, type InterestId } from "@/lib/constants";

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
  /** who may post events in this community (and its groups' admins always can in their group) */
  eventPolicy?: "admins" | "members";
  createdAt: Date;
  updatedAt: Date;
}

const CommunitySchema = new Schema<ICommunity>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, default: "", maxlength: 1200 },
    interest: { type: String, enum: INTEREST_IDS, required: true },
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
    eventPolicy: { type: String, enum: ["admins", "members"], default: "admins" },
  },
  { timestamps: true },
);

CommunitySchema.index({ privacy: 1, country: 1, city: 1, interest: 1, memberCount: -1 });
CommunitySchema.index({ name: "text", description: "text" });

export const Community: Model<ICommunity> =
  (models.Community as Model<ICommunity>) || model<ICommunity>("Community", CommunitySchema);
