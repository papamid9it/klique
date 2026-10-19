import { Schema, model, models, type Model, type Types } from "mongoose";

export interface IMessage {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  body: string;
  sticker: string | null;
  images: string[];
  replyToId: Types.ObjectId | null;
  /** set when the sender changed the text after sending */
  editedAt: Date | null;
  /** soft delete ("unsend"): the row stays so the timeline and reports keep their place */
  deletedAt: Date | null;
  createdAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, default: "", trim: true, maxlength: 2000 },
    sticker: { type: String, default: null, maxlength: 20 },
    images: { type: [String], default: [] },
    replyToId: { type: Schema.Types.ObjectId, default: null },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

MessageSchema.index({ conversationId: 1, createdAt: -1 });

export const Message: Model<IMessage> = (models.Message as Model<IMessage>) || model<IMessage>("Message", MessageSchema);
