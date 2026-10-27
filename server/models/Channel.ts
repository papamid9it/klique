import { Schema, model, models, type Model, type Types } from "mongoose";
import { defineModel } from "./define";

/**
 * Chat structure of a community, Discord-style:
 *   community → categories → channels → messages
 * Channels belong to the community (not to groups).
 */
export interface IChannelCategory {
  _id: Types.ObjectId;
  communityId: Types.ObjectId;
  name: string;
  position: number;
  createdAt: Date;
}

const CategorySchema = new Schema<IChannelCategory>(
  {
    communityId: { type: Schema.Types.ObjectId, ref: "Community", required: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    position: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
CategorySchema.index({ communityId: 1, position: 1 });
CategorySchema.index({ communityId: 1, name: 1 }, { unique: true });

export const ChannelCategory: Model<IChannelCategory> =
  (models.ChannelCategory as Model<IChannelCategory>) || model<IChannelCategory>("ChannelCategory", CategorySchema);

export type ChannelType = "text" | "announcement" | "voice";
/** "all": everyone who can see the space · "managers": owners/admins only · "invite": a private room with a guest list */
export type ChannelVisibility = "all" | "managers" | "invite";

export interface IChannel {
  _id: Types.ObjectId;
  communityId: Types.ObjectId;
  /** set for a group's channel; null for the community's own */
  subcommunityId: Types.ObjectId | null;
  categoryId: Types.ObjectId | null;
  slug: string;
  name: string;
  topic: string;
  /** "announcement": everyone reads, only owner/admins post. */
  type: ChannelType;
  /** "managers": hidden from regular members entirely (a staff room). */
  visibility: ChannelVisibility;
  position: number;
  /** slow mode: seconds each person waits between messages (0 = off); owners/admins don't wait */
  slowModeSec: number;
  /** set on a board post's own chat (its replies): hidden from the channel list, opened from the post */
  topicId?: Types.ObjectId | null;
  /** denormalised for the unread dot and "last active" */
  lastMessageId: Types.ObjectId | null;
  lastMessageAt: Date | null;
  createdById: Types.ObjectId;
  createdAt: Date;
}

const ChannelSchema = new Schema<IChannel>(
  {
    communityId: { type: Schema.Types.ObjectId, ref: "Community", required: true },
    subcommunityId: { type: Schema.Types.ObjectId, ref: "Subcommunity", default: null },
    categoryId: { type: Schema.Types.ObjectId, ref: "ChannelCategory", default: null },
    slug: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    topic: { type: String, default: "", maxlength: 200 },
    type: { type: String, enum: ["text", "announcement", "voice"], default: "text" },
    visibility: { type: String, enum: ["all", "managers", "invite"], default: "all" },
    position: { type: Number, default: 0 },
    slowModeSec: { type: Number, default: 0, min: 0, max: 3600 },
    lastMessageId: { type: Schema.Types.ObjectId, default: null },
    lastMessageAt: { type: Date, default: null },
    topicId: { type: Schema.Types.ObjectId, ref: "Topic", default: null },
    createdById: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
ChannelSchema.index({ communityId: 1, subcommunityId: 1, slug: 1 }, { unique: true });
ChannelSchema.index({ communityId: 1, subcommunityId: 1, categoryId: 1, position: 1 });
ChannelSchema.index({ topicId: 1 }, { sparse: true });

export const Channel: Model<IChannel> = defineModel<IChannel>("Channel", ChannelSchema);

/**
 * The slug index changed shape when groups got channels. `syncIndexes` drops the old one, once per
 * process, so databases created by an earlier version keep working.
 */
let indexesSynced: Promise<void> | null = null;
export function ensureChannelIndexes(): Promise<void> {
  indexesSynced ??= Channel.syncIndexes().then(
    () => undefined,
    () => {
      indexesSynced = null;
    },
  );
  return indexesSynced;
}

export interface IChannelMessage {
  _id: Types.ObjectId;
  channelId: Types.ObjectId;
  communityId: Types.ObjectId;
  authorId: Types.ObjectId;
  body: string;
  sticker: string | null;
  /** a picture sticker (someone's saved sticker: one of our uploads); the message has no text then */
  stickerUrl?: string | null;
  images: string[];
  replyToId: Types.ObjectId | null;
  /** a poll posted with this message (models/Poll) */
  pollId?: Types.ObjectId | null;
  /** set when an owner or admin pins it to the channel */
  pinnedAt: Date | null;
  pinnedById: Types.ObjectId | null;
  /** people tagged with @handle (resolved and access-checked on the server) */
  mentions: Types.ObjectId[];
  /** set when the author changed the text after posting */
  editedAt: Date | null;
  /** soft delete: the row stays so the timeline doesn't jump and reports keep their target */
  deletedAt: Date | null;
  deletedById: Types.ObjectId | null;
  createdAt: Date;
}

const MessageSchema = new Schema<IChannelMessage>(
  {
    channelId: { type: Schema.Types.ObjectId, ref: "Channel", required: true },
    communityId: { type: Schema.Types.ObjectId, ref: "Community", required: true },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, default: "", maxlength: 2000 },
    sticker: { type: String, default: null, maxlength: 20 },
    stickerUrl: { type: String, default: null, maxlength: 600 },
    images: { type: [String], default: [] },
    replyToId: { type: Schema.Types.ObjectId, default: null },
    pollId: { type: Schema.Types.ObjectId, ref: "Poll", default: null },
    pinnedAt: { type: Date, default: null },
    pinnedById: { type: Schema.Types.ObjectId, default: null },
    mentions: { type: [Schema.Types.ObjectId], default: [] },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    deletedById: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
// Cursor pagination walks _id (time-ordered) within a channel.
MessageSchema.index({ channelId: 1, _id: -1 });
MessageSchema.index({ channelId: 1, mentions: 1, _id: 1 });
// slow mode: someone's latest message in a channel
MessageSchema.index({ channelId: 1, authorId: 1, _id: -1 });
MessageSchema.index({ channelId: 1, pinnedAt: -1 }, { partialFilterExpression: { pinnedAt: { $type: "date" } } });

export const ChannelMessage: Model<IChannelMessage> =
  defineModel<IChannelMessage>("ChannelMessage", MessageSchema);

export interface IChannelRead {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  channelId: Types.ObjectId;
  communityId: Types.ObjectId;
  lastReadMessageId: Types.ObjectId | null;
}

const ReadSchema = new Schema<IChannelRead>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  channelId: { type: Schema.Types.ObjectId, ref: "Channel", required: true },
  communityId: { type: Schema.Types.ObjectId, ref: "Community", required: true },
  lastReadMessageId: { type: Schema.Types.ObjectId, default: null },
});
ReadSchema.index({ userId: 1, channelId: 1 }, { unique: true });
ReadSchema.index({ userId: 1, communityId: 1 });

export const ChannelRead: Model<IChannelRead> =
  (models.ChannelRead as Model<IChannelRead>) || model<IChannelRead>("ChannelRead", ReadSchema);

/** The guest list of a private ("invite") channel. Owners/admins of the space can always see it too. */
export interface IChannelMember {
  _id: Types.ObjectId;
  channelId: Types.ObjectId;
  userId: Types.ObjectId;
  communityId: Types.ObjectId;
  subcommunityId: Types.ObjectId | null;
  addedById: Types.ObjectId;
  createdAt: Date;
}

const ChannelMemberSchema = new Schema<IChannelMember>(
  {
    channelId: { type: Schema.Types.ObjectId, ref: "Channel", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    communityId: { type: Schema.Types.ObjectId, ref: "Community", required: true },
    subcommunityId: { type: Schema.Types.ObjectId, ref: "Subcommunity", default: null },
    addedById: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
ChannelMemberSchema.index({ channelId: 1, userId: 1 }, { unique: true });
ChannelMemberSchema.index({ userId: 1, communityId: 1 });

export const ChannelMember: Model<IChannelMember> =
  (models.ChannelMember as Model<IChannelMember>) || model<IChannelMember>("ChannelMember", ChannelMemberSchema);
