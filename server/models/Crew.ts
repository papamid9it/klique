import { Schema, model, models, type Model, type Types } from "mongoose";
import { defineModel } from "./define";

/**
 * A klique (called a "crew" before Nov 2026; the collections keep that name): a small plan to do something
 * together, written as a hook ("Who wants to watch Dune at Filmhouse Lekki on Saturday?"). It belongs to an
 * event (going to it together), to a community (anything its members want to do), or to all communities (neither
 * set: open to anyone, in a place its host names). Everything about a klique
 * (the klique, its members, its chat) carries `expiresAt` = a day after it happens, and MongoDB deletes it then
 * by itself (TTL indexes). For an event, each account may start ONE klique and be in one at a time (as host,
 * member, or with a request waiting); how many kliques someone may start or be in overall is a plan limit.
 */

export const CREW_MAX_MEMBERS = 100;
export type CrewJoinMode = "open" | "approval";

export interface ICrew {
  _id: Types.ObjectId;
  /** going to this event together; null for a community klique */
  eventId: Types.ObjectId | null;
  hostId: Types.ObjectId;
  /** the hook line, e.g. "Who wants to watch Dune at Filmhouse Lekki on Saturday?" */
  title: string;
  /** what it's about (a category id), so it reaches people into that */
  interest: string;
  coverImage: string | null;
  /** only profiles set to "woman" can join (only offered to hosts set to "woman"); kept in step with `audience` */
  womenOnly: boolean;
  /**
   * Who can join: everyone; women only (offered to hosts set to woman); men only (to hosts set to man); or mixed, with
   * `womenSpots` for women and `menSpots` for men and the rest of the spots open to anyone.
   */
  audience?: "everyone" | "women" | "men" | "mixed";
  womenSpots?: number;
  menSpots?: number;
  /** where it happens, for "Kliques for you" (copied from the event, else the community; all communities: the host picks) */
  country: string;
  city: string;
  /** where they're coming from, e.g. "Yaba" */
  area: string;
  /** exact place to meet: only members see it */
  meetupPoint: string;
  meetupAt: Date;
  /** the meetup's time zone (IANA); none (older kliques) = Africa/Lagos */
  timeZone?: string;
  note: string;
  joinMode: CrewJoinMode;
  /** host included, 2–100 */
  maxMembers: number;
  /** active members, host included */
  memberCount: number;
  /** copied from the event, for cleanup when a community or group goes */
  communityId: Types.ObjectId | null;
  subcommunityId: Types.ObjectId | null;
  reminderSentAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CrewSchema = new Schema<ICrew>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "Event", default: null },
    hostId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    interest: { type: String, required: true },
    coverImage: { type: String, default: null },
    womenOnly: { type: Boolean, default: false },
    audience: { type: String, enum: ["everyone", "women", "men", "mixed"], default: "everyone" },
    womenSpots: { type: Number, default: 0, min: 0, max: 99 },
    menSpots: { type: Number, default: 0, min: 0, max: 99 },
    country: { type: String, default: "NG" },
    city: { type: String, default: "" },
    area: { type: String, required: true, trim: true, maxlength: 40 },
    meetupPoint: { type: String, required: true, trim: true, maxlength: 120 },
    meetupAt: { type: Date, required: true },
    timeZone: { type: String, default: undefined },
    note: { type: String, default: "", maxlength: 300 },
    joinMode: { type: String, enum: ["open", "approval"], default: "approval" },
    maxMembers: { type: Number, default: 10, min: 2, max: CREW_MAX_MEMBERS },
    memberCount: { type: Number, default: 1 },
    communityId: { type: Schema.Types.ObjectId, ref: "Community", default: null },
    subcommunityId: { type: Schema.Types.ObjectId, ref: "Subcommunity", default: null },
    reminderSentAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// one klique per person per event (community kliques have no event)
CrewSchema.index({ eventId: 1, hostId: 1 }, { unique: true, name: "event_host_unique", partialFilterExpression: { eventId: { $type: "objectId" } } });
CrewSchema.index({ eventId: 1, createdAt: 1 });
CrewSchema.index({ communityId: 1, meetupAt: 1 });
// "Kliques for you" and /kliques: upcoming ones in a place
CrewSchema.index({ country: 1, city: 1, meetupAt: 1 });
CrewSchema.index({ hostId: 1, createdAt: -1 });
CrewSchema.index({ meetupAt: 1, reminderSentAt: 1 });
CrewSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Crew: Model<ICrew> = defineModel<ICrew>("Crew", CrewSchema);

export interface ICrewMember {
  _id: Types.ObjectId;
  crewId: Types.ObjectId;
  /** lets the database refuse a second klique for the same event (null for a community klique) */
  eventId: Types.ObjectId | null;
  userId: Types.ObjectId;
  role: "host" | "member";
  status: "active" | "pending";
  /** in a mixed klique, the spot they took: a women's, a men's, or an anyone spot (set when they're let in) */
  slot?: "woman" | "man" | "any" | null;
  /** what they said when asking to join */
  message: string;
  expiresAt: Date;
  createdAt: Date;
}

const CrewMemberSchema = new Schema<ICrewMember>(
  {
    crewId: { type: Schema.Types.ObjectId, ref: "Crew", required: true },
    eventId: { type: Schema.Types.ObjectId, ref: "Event", default: null },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["host", "member"], default: "member" },
    status: { type: String, enum: ["active", "pending"], default: "active" },
    slot: { type: String, enum: ["woman", "man", "any", null], default: null },
    message: { type: String, default: "", maxlength: 200 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// one klique per person per event (hosting, in, or asked to join), and one row per person per klique
CrewMemberSchema.index({ eventId: 1, userId: 1 }, { unique: true, name: "event_user_unique", partialFilterExpression: { eventId: { $type: "objectId" } } });
CrewMemberSchema.index({ crewId: 1, userId: 1 }, { unique: true });
CrewMemberSchema.index({ crewId: 1, status: 1, createdAt: 1 });
CrewMemberSchema.index({ userId: 1 });
CrewMemberSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const CrewMember: Model<ICrewMember> = defineModel<ICrewMember>("CrewMember", CrewMemberSchema);

export interface ICrewMessage {
  _id: Types.ObjectId;
  crewId: Types.ObjectId;
  userId: Types.ObjectId;
  body: string;
  /** a sticker instead of text: a built-in one (lib/reactions) or a saved picture sticker */
  sticker?: string | null;
  stickerUrl?: string | null;
  /** up to 4 uploaded pictures or GIFs */
  images?: string[];
  /** crew members tagged with @handle */
  mentions?: Types.ObjectId[];
  editedAt?: Date | null;
  /** soft delete: the row stays so replies keep their place */
  deletedAt?: Date | null;
  /** the message this one answers */
  replyToId: Types.ObjectId | null;
  /** a poll posted with this message (models/Poll) */
  pollId?: Types.ObjectId | null;
  expiresAt: Date;
  createdAt: Date;
}

const CrewMessageSchema = new Schema<ICrewMessage>(
  {
    crewId: { type: Schema.Types.ObjectId, ref: "Crew", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, default: "", trim: true, maxlength: 1000 },
    sticker: { type: String, default: null, maxlength: 20 },
    stickerUrl: { type: String, default: null, maxlength: 600 },
    images: { type: [String], default: [] },
    mentions: { type: [Schema.Types.ObjectId], default: [] },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    replyToId: { type: Schema.Types.ObjectId, ref: "CrewMessage", default: null },
    pollId: { type: Schema.Types.ObjectId, ref: "Poll", default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

CrewMessageSchema.index({ crewId: 1, _id: -1 });
CrewMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const CrewMessage: Model<ICrewMessage> = defineModel<ICrewMessage>("CrewMessage", CrewMessageSchema);

/** How far someone has read a crew's chat, for unread counts. Goes with the crew (same `expiresAt`). */
export interface ICrewRead {
  _id: Types.ObjectId;
  crewId: Types.ObjectId;
  userId: Types.ObjectId;
  lastReadMessageId: Types.ObjectId | null;
  /** last time they had the chat open (people reading right now aren't notified) */
  readAt: Date | null;
  expiresAt: Date;
}

const CrewReadSchema = new Schema<ICrewRead>({
  crewId: { type: Schema.Types.ObjectId, ref: "Crew", required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  lastReadMessageId: { type: Schema.Types.ObjectId, default: null },
  readAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
});
CrewReadSchema.index({ userId: 1, crewId: 1 }, { unique: true });
CrewReadSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const CrewRead: Model<ICrewRead> = (models.CrewRead as Model<ICrewRead>) || model<ICrewRead>("CrewRead", CrewReadSchema);
