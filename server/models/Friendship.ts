import { Schema, model, models, type Model, type Types } from "mongoose";
import { participantKey } from "./Conversation";

/**
 * A friend request and, once accepted, a friendship. One row per pair (`pairKey` = both ids sorted),
 * so two people can never have two requests at once. `requesterId` is who asked.
 */
export interface IFriendship {
  _id: Types.ObjectId;
  pairKey: string;
  requesterId: Types.ObjectId;
  recipientId: Types.ObjectId;
  status: "pending" | "accepted";
  createdAt: Date;
  acceptedAt: Date | null;
}

const FriendshipSchema = new Schema<IFriendship>(
  {
    pairKey: { type: String, required: true },
    requesterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["pending", "accepted"], default: "pending" },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
FriendshipSchema.index({ pairKey: 1 }, { unique: true });
FriendshipSchema.index({ requesterId: 1, status: 1 });
FriendshipSchema.index({ recipientId: 1, status: 1 });

export const Friendship: Model<IFriendship> = (models.Friendship as Model<IFriendship>) || model<IFriendship>("Friendship", FriendshipSchema);
export const pairKeyOf = participantKey;
