import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "./define";

/**
 * A smaller group that lives inside exactly ONE parent community.
 *  - visibility "parent":  visible to, and freely joinable by, members of the parent community
 *  - visibility "private": invisible to everyone except its members; entry by invite link or admin approval
 */
export interface ISubcommunity {
  _id: Types.ObjectId;
  communityId: Types.ObjectId;
  slug: string;
  name: string;
  description: string;
  visibility: "parent" | "private";
  ownerId: Types.ObjectId;
  memberCount: number;
  /** starter channels created once */
  channelsReady?: boolean;
  /** points (lib/points) someone needs to be added, and to post. 0: anyone. */
  createdAt: Date;
  updatedAt: Date;
}

const SubcommunitySchema = new Schema<ISubcommunity>(
  {
    communityId: { type: Schema.Types.ObjectId, ref: "Community", required: true, index: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, default: "", maxlength: 1200 },
    visibility: { type: String, enum: ["parent", "private"], default: "parent" },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    memberCount: { type: Number, default: 0 },
    channelsReady: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// A slug is unique within its parent community.
SubcommunitySchema.index({ communityId: 1, slug: 1 }, { unique: true });

export const Subcommunity: Model<ISubcommunity> = defineModel<ISubcommunity>("Subcommunity", SubcommunitySchema);
