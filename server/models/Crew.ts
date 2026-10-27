import { Schema, model, models, type Model, type Types } from "mongoose";
import { defineModel } from "./define";

/**
 * A crew: a few people going to the same event together ("from Yaba, meeting at the bus stop at 3").
 * Everything about a crew (the crew, its members, its chat) carries `expiresAt` = a day after the event ends,
 * and MongoDB deletes it then by itself (TTL indexes). Each account may start ONE crew per event, and be in one
 * crew per event at a time (as host, member, or with a request waiting).
 */

export const CREW_MAX_MEMBERS = 100;
export type CrewJoinMode = "open" | "approval";

export interface ICrew {
  _id: Types.ObjectId;
  eventId: Types.ObjectId;
  hostId: Types.ObjectId;
  /** where they're coming from, e.g. "Yaba" */
  area: string;
  /** exact place to meet: only members see it */
  meetupPoint: string;
  meetupAt: Date;
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
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true },
    hostId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    area: { type: String, required: true, trim: true, maxlength: 40 },
    meetupPoint: { type: String, required: true, trim: true, maxlength: 120 },
    meetupAt: { type: Date, required: true },
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

// one crew per person per event
CrewSchema.index({ eventId: 1, hostId: 1 }, { unique: true });
CrewSchema.index({ eventId: 1, createdAt: 1 });
CrewSchema.index({ meetupAt: 1, reminderSentAt: 1 });
CrewSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Crew: Model<ICrew> = (models.Crew as Model<ICrew>) || model<ICrew>("Crew", CrewSchema);

export interface ICrewMember {
  _id: Types.ObjectId;
  crewId: Types.ObjectId;
  /** lets the database refuse a second crew for the same event */
  eventId: Types.ObjectId;
  userId: Types.ObjectId;
  role: "host" | "member";
  status: "active" | "pending";
  /** what they said when asking to join */
  message: string;
  expiresAt: Date;
  createdAt: Date;
}

const CrewMemberSchema = new Schema<ICrewMember>(
  {
    crewId: { type: Schema.Types.ObjectId, ref: "Crew", required: true },
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["host", "member"], default: "member" },
    status: { type: String, enum: ["active", "pending"], default: "active" },
    message: { type: String, default: "", maxlength: 200 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// one crew per person per event (hosting, in, or asked to join)
CrewMemberSchema.index({ eventId: 1, userId: 1 }, { unique: true });
CrewMemberSchema.index({ crewId: 1, status: 1, createdAt: 1 });
CrewMemberSchema.index({ userId: 1 });
CrewMemberSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const CrewMember: Model<ICrewMember> = (models.CrewMember as Model<ICrewMember>) || model<ICrewMember>("CrewMember", CrewMemberSchema);

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
