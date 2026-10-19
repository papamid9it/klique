import { Schema, model, models, type Model, type Types } from "mongoose";

/** One person's reaction of one kind on one message (a channel message or a direct message). Toggled on/off. */
export interface IReaction {
  _id: Types.ObjectId;
  targetType: "channel" | "dm";
  targetId: Types.ObjectId;
  userId: Types.ObjectId;
  kind: string;
  createdAt: Date;
}

const ReactionSchema = new Schema<IReaction>(
  {
    targetType: { type: String, enum: ["channel", "dm"], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, required: true, maxlength: 20 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
// One reaction per person per message: picking another one replaces it.
ReactionSchema.index({ targetType: 1, targetId: 1, userId: 1 }, { unique: true });
ReactionSchema.index({ userId: 1 });

export const Reaction: Model<IReaction> = (models.Reaction as Model<IReaction>) || model<IReaction>("Reaction", ReactionSchema);
