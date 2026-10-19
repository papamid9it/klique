import { Schema, model, models, type Model, type Types } from "mongoose";

/**
 * Topics are a community's Reddit-style board: a titled post members discuss in threaded comments.
 * (Chat channels are the live, Discord-style side; topics are the slower, searchable side.)
 */
/**
 * A board is a named section of a community's topics. Admins decide what to call them ("Updates", "Projects",
 * "Questions"…), how many there are, and whether everyone or only admins may post in each.
 */
export interface IBoard {
  _id: Types.ObjectId;
  communityId: Types.ObjectId;
  slug: string;
  name: string;
  description: string;
  postPolicy: "members" | "admins";
  position: number;
  createdById: Types.ObjectId;
  createdAt: Date;
}

const BoardSchema = new Schema<IBoard>(
  {
    communityId: { type: Schema.Types.ObjectId, ref: "Community", required: true },
    slug: { type: String, required: true, maxlength: 40 },
    name: { type: String, required: true, trim: true, maxlength: 30 },
    description: { type: String, default: "", trim: true, maxlength: 120 },
    postPolicy: { type: String, enum: ["members", "admins"], default: "members" },
    position: { type: Number, default: 0 },
    createdById: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
BoardSchema.index({ communityId: 1, slug: 1 }, { unique: true });
BoardSchema.index({ communityId: 1, position: 1 });

export const Board: Model<IBoard> = (models.Board as Model<IBoard>) || model<IBoard>("Board", BoardSchema);

export interface ITopic {
  _id: Types.ObjectId;
  communityId: Types.ObjectId;
  /** the board it lives in (null on topics made before boards existed: they move to the first board) */
  boardId: Types.ObjectId | null;
  authorId: Types.ObjectId;
  title: string;
  body: string;
  imageUrl: string | null;
  media: { kind: "image" | "video"; url: string; poster: string | null }[];
  /** managers pin a topic to the top of the board */
  pinned: boolean;
  /** managers lock a topic: nobody can comment (managers excepted) */
  locked: boolean;
  /** denormalised counters; likes/comments keep them in step */
  likeCount: number;
  commentCount: number;
  editedAt: Date | null;
  /** newest comment (or the topic itself): drives "recently active" */
  lastActivityAt: Date;
  createdAt: Date;
}

const TopicSchema = new Schema<ITopic>(
  {
    communityId: { type: Schema.Types.ObjectId, ref: "Community", required: true },
    boardId: { type: Schema.Types.ObjectId, ref: "Board", default: null },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, default: "", trim: true, maxlength: 6000 },
    imageUrl: { type: String, default: null },
    media: { type: [new Schema({ kind: { type: String, enum: ["image", "video"], required: true }, url: { type: String, required: true }, poster: { type: String, default: null } }, { _id: false })], default: [] },
    pinned: { type: Boolean, default: false },
    locked: { type: Boolean, default: false },
    likeCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    editedAt: { type: Date, default: null },
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
TopicSchema.index({ communityId: 1, pinned: -1, createdAt: -1 });
TopicSchema.index({ communityId: 1, pinned: -1, likeCount: -1, createdAt: -1 });
TopicSchema.index({ communityId: 1, createdAt: -1 });
TopicSchema.index({ boardId: 1, pinned: -1, createdAt: -1 });
TopicSchema.index({ authorId: 1, createdAt: -1 });

export const Topic: Model<ITopic> = (models.Topic as Model<ITopic>) || model<ITopic>("Topic", TopicSchema);

export interface ITopicComment {
  _id: Types.ObjectId;
  topicId: Types.ObjectId;
  communityId: Types.ObjectId;
  authorId: Types.ObjectId;
  /** null for a top-level comment; otherwise the comment being replied to */
  parentId: Types.ObjectId | null;
  body: string;
  likeCount: number;
  editedAt: Date | null;
  /** soft delete: the row stays so replies keep their place in the thread */
  deletedAt: Date | null;
  createdAt: Date;
}

const CommentSchema = new Schema<ITopicComment>(
  {
    topicId: { type: Schema.Types.ObjectId, ref: "Topic", required: true },
    communityId: { type: Schema.Types.ObjectId, ref: "Community", required: true },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    parentId: { type: Schema.Types.ObjectId, ref: "TopicComment", default: null },
    body: { type: String, default: "", maxlength: 3000 },
    likeCount: { type: Number, default: 0 },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
CommentSchema.index({ topicId: 1, _id: 1 });

export const TopicComment: Model<ITopicComment> = (models.TopicComment as Model<ITopicComment>) || model<ITopicComment>("TopicComment", CommentSchema);

/** One like per person per topic/comment. */
export interface ITopicLike {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  topicId: Types.ObjectId;
  targetType: "topic" | "comment";
  targetId: Types.ObjectId;
  createdAt: Date;
}

const LikeSchema = new Schema<ITopicLike>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    topicId: { type: Schema.Types.ObjectId, ref: "Topic", required: true },
    targetType: { type: String, enum: ["topic", "comment"], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
LikeSchema.index({ userId: 1, targetType: 1, targetId: 1 }, { unique: true });
LikeSchema.index({ topicId: 1, userId: 1 });

export const TopicLike: Model<ITopicLike> = (models.TopicLike as Model<ITopicLike>) || model<ITopicLike>("TopicLike", LikeSchema);
