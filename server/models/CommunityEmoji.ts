import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "./define";

/** A community's custom emoji (:name:), one of our uploads (PNG, WebP or an animated GIF, at most 256 KB). */
export interface ICommunityEmoji {
  _id: Types.ObjectId;
  communityId: Types.ObjectId;
  name: string;
  url: string;
  animated: boolean;
  createdById: Types.ObjectId;
  createdAt: Date;
}

const CommunityEmojiSchema = new Schema<ICommunityEmoji>(
  {
    communityId: { type: Schema.Types.ObjectId, ref: "Community", required: true },
    name: { type: String, required: true, lowercase: true, trim: true, maxlength: 32 },
    url: { type: String, required: true, maxlength: 600 },
    animated: { type: Boolean, default: false },
    createdById: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
CommunityEmojiSchema.index({ communityId: 1, name: 1 }, { unique: true });

export const CommunityEmoji: Model<ICommunityEmoji> = defineModel<ICommunityEmoji>("CommunityEmoji", CommunityEmojiSchema);
