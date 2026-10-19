import { Schema, model, models, type Model, type Types } from "mongoose";

/** One phone that has said "yes, send me notifications". A person can have several. */
export interface IPushToken {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  /** Expo push token, e.g. ExponentPushToken[xxxx] */
  token: string;
  platform: "ios" | "android";
  createdAt: Date;
  updatedAt: Date;
}

const PushTokenSchema = new Schema<IPushToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    token: { type: String, required: true, unique: true, maxlength: 200 },
    platform: { type: String, enum: ["ios", "android"], required: true },
  },
  { timestamps: true },
);

export const PushToken: Model<IPushToken> = (models.PushToken as Model<IPushToken>) || model<IPushToken>("PushToken", PushTokenSchema);
