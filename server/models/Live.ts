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
  /** removed from this stream by its host or a moderator: no player or live chat for them in Klique */
  kickedIds?: Types.ObjectId[];
  /** the most people watching at once, and how many different people watched (for the "how it went" summary) */
  peakViewers?: number;
  watched?: number;
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
    kickedIds: { type: [Schema.Types.ObjectId], default: [] },
    peakViewers: { type: Number, default: 0 },
    watched: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
// one stream at a time in a community
LiveStreamSchema.index({ communityId: 1 }, { unique: true, partialFilterExpression: { status: { $in: ["waiting", "live"] } }, name: "one_live_per_community" });
LiveStreamSchema.index({ hostId: 1, status: 1 });
// a streamed event: is it live now
LiveStreamSchema.index({ eventId: 1, status: 1 }, { partialFilterExpression: { eventId: { $type: "objectId" } } });

export const LiveStream: Model<ILiveStream> = defineModel<ILiveStream>("LiveStream", LiveStreamSchema);

/**
 * Someone watching a stream right now: the player says so every 30 seconds, and a row older than a minute no longer
 * counts (and goes by itself). `key`: the person's id, or a random one for people who aren't signed in.
 */
export interface ILiveViewer {
  _id: Types.ObjectId;
  liveId: Types.ObjectId;
  key: string;
  seenAt: Date;
  /** when they started watching (a streamed event: watching long enough counts as coming) */
  firstSeenAt?: Date;
  /** already counted as coming to the event */
  counted?: boolean;
}
const LiveViewerSchema = new Schema<ILiveViewer>({
  liveId: { type: Schema.Types.ObjectId, required: true },
  key: { type: String, required: true, maxlength: 64 },
  seenAt: { type: Date, required: true },
  firstSeenAt: { type: Date, default: null },
  counted: { type: Boolean, default: false },
});
LiveViewerSchema.index({ liveId: 1, key: 1 }, { unique: true });
LiveViewerSchema.index({ liveId: 1, seenAt: -1 });
LiveViewerSchema.index({ seenAt: 1 }, { expireAfterSeconds: 120 });
export const LiveViewer: Model<ILiveViewer> = defineModel<ILiveViewer>("LiveViewer", LiveViewerSchema);
