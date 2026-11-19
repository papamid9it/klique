import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "./define";

/**
 * Posts Home and Reels have already shown someone, so they sink next time instead of greeting them again (the feed
 * feels fresh). Kept a week, then MongoDB deletes them by itself (TTL index). Needs `npm run db:indexes` once.
 */
export interface IFeedSeen {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  postId: Types.ObjectId;
  where: "home" | "reels";
  at: Date;
}

const FeedSeenSchema = new Schema<IFeedSeen>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    postId: { type: Schema.Types.ObjectId, ref: "FeedPost", required: true },
    where: { type: String, enum: ["home", "reels"], required: true },
    at: { type: Date, required: true },
  },
  { versionKey: false },
);
FeedSeenSchema.index({ userId: 1, where: 1, postId: 1 }, { unique: true });
FeedSeenSchema.index({ at: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });

export const FeedSeen: Model<IFeedSeen> = defineModel<IFeedSeen>("FeedSeen", FeedSeenSchema);
