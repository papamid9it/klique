import { Schema, model, models, type Model, type Types } from "mongoose";

/**
 * One award of Hype. `ref` names what earned it ("event:<id>", "event:<id>:<attendee>"), and each (user, action,
 * ref) can only ever be awarded once, so re-confirming someone never pays twice.
 * `day` (Lagos date) lets the daily cap be checked.
 */
export interface IHypeAward {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  action: string;
  ref: string;
  amount: number;
  day: string;
  createdAt: Date;
}

const HypeAwardSchema = new Schema<IHypeAward>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true },
    ref: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    day: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
HypeAwardSchema.index({ userId: 1, action: 1, ref: 1 }, { unique: true });
HypeAwardSchema.index({ userId: 1, day: 1 });
HypeAwardSchema.index({ userId: 1, createdAt: -1 });

export const HypeAward: Model<IHypeAward> = (models.HypeAward as Model<IHypeAward>) || model<IHypeAward>("HypeAward", HypeAwardSchema);
