import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "./define";

export interface IMessage {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  body: string;
  sticker: string | null;
  /** a picture sticker (someone's saved sticker: one of our uploads); the message has no text then */
  stickerUrl?: string | null;
  images: string[];
  replyToId: Types.ObjectId | null;
  /** a poll posted with this message (models/Poll) */
  pollId?: Types.ObjectId | null;
  /** set when the sender changed the text after sending */
  editedAt: Date | null;
  /** soft delete ("unsend"): the row stays so the timeline and reports keep their place */
  deletedAt: Date | null;
  /** hidden pending review (a "minor or non-consensual" report): shown as removed until an admin decides */
  hiddenAt?: Date | null;
  createdAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, default: "", trim: true, maxlength: 2000 },
    sticker: { type: String, default: null, maxlength: 20 },
    stickerUrl: { type: String, default: null, maxlength: 600 },
    images: { type: [String], default: [] },
    replyToId: { type: Schema.Types.ObjectId, default: null },
    pollId: { type: Schema.Types.ObjectId, ref: "Poll", default: null },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    hiddenAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

MessageSchema.index({ conversationId: 1, createdAt: -1 });

export const Message: Model<IMessage> = defineModel<IMessage>("Message", MessageSchema);
