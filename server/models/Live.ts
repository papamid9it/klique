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

/** Someone's YouTube channel, connected for going live from the phone's camera. Their sign-in is kept sealed. */
export interface IYouTubeLink {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  channelId: string;
  title: string;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  /** the broadcasts Klique made on their channel lately (newest last): going live checks against these */
  broadcastIds?: string[];
  createdAt: Date;
}

const YouTubeLinkSchema = new Schema<IYouTubeLink>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    channelId: { type: String, required: true, index: true },
    title: { type: String, default: "" },
    avatarUrl: { type: String, default: null },
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    broadcastIds: { type: [String], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const YouTubeLink: Model<IYouTubeLink> = defineModel<IYouTubeLink>("YouTubeLink", YouTubeLinkSchema);

/**
 * How much of YouTube's daily allowance Klique has used (10,000 units a day; it resets at midnight Pacific time). One
 * row per day (`_id`: the Pacific date). `out`: YouTube said it's used up, so going live by link is offered instead.
 */
export interface IYouTubeQuota {
  _id: string;
  used: number;
  out: boolean;
}
const YouTubeQuotaSchema = new Schema<IYouTubeQuota>({ _id: { type: String }, used: { type: Number, default: 0 }, out: { type: Boolean, default: false } }, { versionKey: false });
export const YouTubeQuota: Model<IYouTubeQuota> = defineModel<IYouTubeQuota>("YouTubeQuota", YouTubeQuotaSchema);

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
  /** a YouTube broadcast Klique made (Connect YouTube): finished on YouTube too when it ends here */
  ytBroadcast?: boolean;
  /** the most people watching at once, and how many different people watched (for the "how it went" summary) */
  peakViewers?: number;
  watched?: number;
  /**
   * Live together: up to 3 members the host invited, each streaming from their own phone to their own Twitch or
   * YouTube, shown beside the host's stream in Klique. "invited" (2 minutes to say yes), "waiting" (Twitch hasn't said
   * they're on yet, or their stream dropped), "live".
   */
  guests?: ILiveGuest[];
  /**
   * the host's phone last checked in (its go-live screen asks every few seconds): a camera stream on YouTube whose
   * phone stopped asking (the app closed or crashed) is ended here instead of showing as live for a day
   */
  hostSeenAt?: Date | null;
  /** who's in the big box for everyone (the host picks; none: the host) */
  mainId?: Types.ObjectId | null;
  createdAt: Date;
}

export interface ILiveGuest {
  userId: Types.ObjectId;
  status: "invited" | "waiting" | "live";
  invitedAt: Date;
  /** since when it's been waiting (for Twitch to say they're on, or to come back after a drop) */
  waitingSince?: Date | null;
  joinedAt?: Date | null;
  provider?: "twitch" | "youtube" | null;
  channel?: string | null;
  ytBroadcast?: boolean;
  /** their phone last checked in (as hostSeenAt, for a guest's camera stream on YouTube) */
  seenAt?: Date | null;
}

const LiveGuestSchema = new Schema<ILiveGuest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["invited", "waiting", "live"], default: "invited" },
    invitedAt: { type: Date, required: true },
    waitingSince: { type: Date, default: null },
    joinedAt: { type: Date, default: null },
    provider: { type: String, enum: ["twitch", "youtube", null], default: null },
    channel: { type: String, default: null, maxlength: 64 },
    ytBroadcast: { type: Boolean, default: undefined },
    seenAt: { type: Date, default: null },
  },
  { _id: false },
);

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
    ytBroadcast: { type: Boolean, default: undefined },
    peakViewers: { type: Number, default: 0 },
    watched: { type: Number, default: 0 },
    guests: { type: [LiveGuestSchema], default: undefined },
    mainId: { type: Schema.Types.ObjectId, default: null },
    hostSeenAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
// one stream at a time in a community
LiveStreamSchema.index({ communityId: 1 }, { unique: true, partialFilterExpression: { status: { $in: ["waiting", "live"] } }, name: "one_live_per_community" });
LiveStreamSchema.index({ hostId: 1, status: 1 });
// a guest's live (one at a time), and Twitch's "went live" for a guest
LiveStreamSchema.index({ "guests.userId": 1, status: 1 }, { partialFilterExpression: { status: { $in: ["waiting", "live"] } } });
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
  /** when they last came in (first time, or back again): "Amara joined" for the stream, also for screens polling */
  joinedAt?: Date | null;
}
const LiveViewerSchema = new Schema<ILiveViewer>({
  liveId: { type: Schema.Types.ObjectId, required: true },
  key: { type: String, required: true, maxlength: 64 },
  seenAt: { type: Date, required: true },
  firstSeenAt: { type: Date, default: null },
  counted: { type: Boolean, default: false },
  joinedAt: { type: Date, default: null },
});
LiveViewerSchema.index({ liveId: 1, key: 1 }, { unique: true });
LiveViewerSchema.index({ liveId: 1, seenAt: -1 });
LiveViewerSchema.index({ liveId: 1, joinedAt: -1 });
LiveViewerSchema.index({ seenAt: 1 }, { expireAfterSeconds: 120 });
export const LiveViewer: Model<ILiveViewer> = defineModel<ILiveViewer>("LiveViewer", LiveViewerSchema);
