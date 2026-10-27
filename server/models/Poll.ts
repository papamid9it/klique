import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "./define";

/**
 * A poll posted in a chat (Discord style): a community or group channel, a crew's chat, or a DM. It rides on a
 * message (the message's `pollId`), so whoever may post there may start one. People vote until it ends, and may
 * change their vote meanwhile; its creator or the chat's admins can end it early.
 */
export type PollScope = "channel" | "crew" | "dm";

export interface IPoll {
  _id: Types.ObjectId;
  scope: PollScope;
  /** the channel, crew or conversation it was posted in */
  targetId: Types.ObjectId;
  /** channels: the community, for its admins and its size */
  communityId: Types.ObjectId | null;
  creatorId: Types.ObjectId;
  question: string;
  answers: { id: string; text: string; emoji: string | null }[];
  /** more than one answer per person */
  multiple: boolean;
  /** nobody sees who voted for what */
  anonymous: boolean;
  endsAt: Date;
  /** ended early by its creator or an admin */
  endedAt: Date | null;
  createdAt: Date;
}

const PollSchema = new Schema<IPoll>(
  {
    scope: { type: String, enum: ["channel", "crew", "dm"], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    communityId: { type: Schema.Types.ObjectId, ref: "Community", default: null },
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    question: { type: String, required: true, trim: true, maxlength: 300 },
    answers: { type: [new Schema({ id: { type: String, required: true }, text: { type: String, required: true, maxlength: 55 }, emoji: { type: String, default: null, maxlength: 16 } }, { _id: false })], default: [] },
    multiple: { type: Boolean, default: false },
    anonymous: { type: Boolean, default: false },
    endsAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
PollSchema.index({ scope: 1, targetId: 1 });

export const Poll: Model<IPoll> = defineModel<IPoll>("Poll", PollSchema);

/** One person's choice in a poll (several answers when the poll allows it). */
export interface IPollVote {
  _id: Types.ObjectId;
  pollId: Types.ObjectId;
  userId: Types.ObjectId;
  answerIds: string[];
  createdAt: Date;
}

const PollVoteSchema = new Schema<IPollVote>(
  {
    pollId: { type: Schema.Types.ObjectId, ref: "Poll", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    answerIds: { type: [String], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: true } },
);
PollVoteSchema.index({ pollId: 1, userId: 1 }, { unique: true });

export const PollVote: Model<IPollVote> = defineModel<IPollVote>("PollVote", PollVoteSchema);
