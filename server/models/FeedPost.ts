import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "./define";

/**
 * A community's Posts section, Instagram style: pictures (or one video) with a caption, voted up or down, with
 * Reddit-style nested comments that take emoji reactions. Turned on per community (Community.feedPolicy).
 * Posts from your communities make up the home feed. (Board posts are Topic; a group's updates are Post.)
 */
export interface IFeedPost {
  _id: Types.ObjectId;
  communityId: Types.ObjectId;
  authorId: Types.ObjectId;
  caption: string;
  media: { kind: "image" | "video"; url: string; poster: string | null }[];
  /** denormalised vote and comment counts (FeedVote / FeedComment keep them in step) */
  upCount: number;
  downCount: number;
  commentCount: number;
  editedAt: Date | null;
  createdAt: Date;
}

const FeedPostSchema = new Schema<IFeedPost>(
  {
    communityId: { type: Schema.Types.ObjectId, ref: "Community", required: true },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    caption: { type: String, default: "", trim: true, maxlength: 2200 },
    media: { type: [new Schema({ kind: { type: String, enum: ["image", "video"], required: true }, url: { type: String, required: true }, poster: { type: String, default: null } }, { _id: false })], default: [] },
    upCount: { type: Number, default: 0 },
    downCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    editedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
FeedPostSchema.index({ communityId: 1, createdAt: -1 });
FeedPostSchema.index({ createdAt: -1 });
FeedPostSchema.index({ authorId: 1, createdAt: -1 });

export const FeedPost: Model<IFeedPost> = defineModel<IFeedPost>("FeedPost", FeedPostSchema);

/** One vote per person per post: up (1) or down (-1). */
export interface IFeedVote {
  _id: Types.ObjectId;
  postId: Types.ObjectId;
  userId: Types.ObjectId;
  value: 1 | -1;
  createdAt: Date;
}

const FeedVoteSchema = new Schema<IFeedVote>(
  {
    postId: { type: Schema.Types.ObjectId, ref: "FeedPost", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    value: { type: Number, enum: [1, -1], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
FeedVoteSchema.index({ postId: 1, userId: 1 }, { unique: true });

export const FeedVote: Model<IFeedVote> = defineModel<IFeedVote>("FeedVote", FeedVoteSchema);

/** A comment on a post; `parentId` makes it a reply (nested, Reddit style). Deleted ones stay as placeholders. */
export interface IFeedComment {
  _id: Types.ObjectId;
  postId: Types.ObjectId;
  communityId: Types.ObjectId;
  authorId: Types.ObjectId;
  parentId: Types.ObjectId | null;
  body: string;
  deletedAt: Date | null;
  createdAt: Date;
}

const FeedCommentSchema = new Schema<IFeedComment>(
  {
    postId: { type: Schema.Types.ObjectId, ref: "FeedPost", required: true },
    communityId: { type: Schema.Types.ObjectId, ref: "Community", required: true },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    parentId: { type: Schema.Types.ObjectId, ref: "FeedComment", default: null },
    body: { type: String, default: "", maxlength: 2000 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
FeedCommentSchema.index({ postId: 1, _id: 1 });

export const FeedComment: Model<IFeedComment> = defineModel<IFeedComment>("FeedComment", FeedCommentSchema);
