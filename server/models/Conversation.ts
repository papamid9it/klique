import { Schema, model, models, type Model, type Types } from "mongoose";

/**
 * A private one-to-one conversation. `participantKey` is the two user ids
 * sorted and joined, with a unique index, so there can only ever be ONE
 * conversation per pair — even under concurrent "start a chat" requests.
 */
export interface IConversation {
  _id: Types.ObjectId;
  participants: Types.ObjectId[];
  participantKey: string;
  lastMessage: { body: string; senderId: Types.ObjectId; createdAt: Date } | null;
  lastMessageAt: Date;
  /** unread message count per participant, keyed by user id */
  unread: Record<string, number>;
  /**
   * A message request (Instagram style): someone who can't chat with them freely sent ONE text message; it waits in
   * the other person's Requests until they accept (or reply), delete it (silently) or block. null: a normal chat.
   */
  request?: { fromId: Types.ObjectId; at: Date } | null;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    participants: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      validate: [(v: unknown[]) => v.length === 2, "A conversation has exactly two participants."],
      required: true,
    },
    participantKey: { type: String, required: true, unique: true },
    lastMessage: {
      type: new Schema(
        {
          body: String,
          senderId: { type: Schema.Types.ObjectId, ref: "User" },
          createdAt: Date,
        },
        { _id: false },
      ),
      default: null,
    },
    lastMessageAt: { type: Date, default: () => new Date() },
    unread: { type: Schema.Types.Mixed, default: {} },
    request: { type: new Schema({ fromId: { type: Schema.Types.ObjectId, ref: "User" }, at: Date }, { _id: false }), default: null },
  },
  { timestamps: true, minimize: false },
);

ConversationSchema.index({ participants: 1, lastMessageAt: -1 });

export const Conversation: Model<IConversation> =
  (models.Conversation as Model<IConversation>) || model<IConversation>("Conversation", ConversationSchema);

export function participantKey(a: Types.ObjectId | string, b: Types.ObjectId | string) {
  return [String(a), String(b)].sort().join(":");
}
