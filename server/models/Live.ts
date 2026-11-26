import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "./define";

/** Someone's Twitch account, connected for going live from Klique. Their sign-in is kept sealed (secret-box). */
export interface ITwitchLink {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  twitchId: string;
  login: string;
  displayName: string;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  /** Twitch's "went live" / "went off" subscriptions for this channel (to remove them on disconnect) */
  subscriptionIds: string[];
  createdAt: Date;
}

const TwitchLinkSchema = new Schema<ITwitchLink>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    twitchId: { type: String, required: true, index: true },
    login: { type: String, required: true },
    displayName: { type: String, default: "" },
    avatarUrl: { type: String, default: null },
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    subscriptionIds: { type: [String], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const TwitchLink: Model<ITwitchLink> = defineModel<ITwitchLink>("TwitchLink", TwitchLinkSchema);

/**
 * A live stream in a community (or one of its events): one at a time per community. On Twitch it's "waiting" until
 * Twitch says the channel went live, then "live" until it goes off; a YouTube link is live as soon as it's posted,
 * until its host ends it (or a day passes).
 */
export interface ILiveStream {
  _id: Types.ObjectId;
  communityId: Types.ObjectId;
  eventId: Types.ObjectId | null;
  hostId: Types.ObjectId;
  provider: "twitch" | "youtube";
  /** Twitch: the channel's login; YouTube: the video's id */
  channel: string;
  title: string;
  status: "waiting" | "live" | "ended";
  startedAt: Date | null;
  endedAt: Date | null;
  endedById: Types.ObjectId | null;
  createdAt: Date;
}

const LiveStreamSchema = new Schema<ILiveStream>(
  {
    communityId: { type: Schema.Types.ObjectId, ref: "Community", required: true },
    eventId: { type: Schema.Types.ObjectId, ref: "Event", default: null },
    hostId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    provider: { type: String, enum: ["twitch", "youtube"], required: true },
    channel: { type: String, required: true, maxlength: 64 },
    title: { type: String, default: "", maxlength: 120 },
    status: { type: String, enum: ["waiting", "live", "ended"], default: "waiting" },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    endedById: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
// one stream at a time in a community
LiveStreamSchema.index({ communityId: 1 }, { unique: true, partialFilterExpression: { status: { $in: ["waiting", "live"] } }, name: "one_live_per_community" });
LiveStreamSchema.index({ hostId: 1, status: 1 });
// a streamed event: is it live now
LiveStreamSchema.index({ eventId: 1, status: 1 }, { partialFilterExpression: { eventId: { $type: "objectId" } } });

export const LiveStream: Model<ILiveStream> = defineModel<ILiveStream>("LiveStream", LiveStreamSchema);
