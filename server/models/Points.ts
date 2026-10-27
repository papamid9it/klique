import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "./define";

/**
 * One award of points (earned reputation, lib/points). `ref` names what earned it ("event:<id>",
 * "feed:<post>:<voter>"), and each (user, action, ref) can only ever be awarded once, so taking an upvote back
 * and giving it again never pays twice. `day` (Lagos date) lets each action's daily cap be checked.
 * (The collection keeps the name it had when earned points were called "Hype".)
 */
export interface IPointAward {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  action: string;
  ref: string;
  amount: number;
  day: string;
  createdAt: Date;
}

const PointAwardSchema = new Schema<IPointAward>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true },
    ref: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    day: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "hypeawards" },
);
PointAwardSchema.index({ userId: 1, action: 1, ref: 1 }, { unique: true });
PointAwardSchema.index({ userId: 1, day: 1, action: 1 });
PointAwardSchema.index({ userId: 1, createdAt: -1 });

export const PointAward: Model<IPointAward> = defineModel<IPointAward>("PointAward", PointAwardSchema);
