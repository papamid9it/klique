import { Schema, model, models, type Model, type Types } from "mongoose";

/** One browser (desktop or phone) that said yes to klique notifications. A person can have several. */
export interface IWebPushSubscription {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** "Chrome on Windows", for the settings list */
  label: string;
  createdAt: Date;
  updatedAt: Date;
}

const WebPushSubscriptionSchema = new Schema<IWebPushSubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true, unique: true, maxlength: 1000 },
    keys: { p256dh: { type: String, required: true, maxlength: 200 }, auth: { type: String, required: true, maxlength: 100 } },
    label: { type: String, default: "", maxlength: 80 },
  },
  { timestamps: true },
);

export const WebPushSubscription: Model<IWebPushSubscription> =
  (models.WebPushSubscription as Model<IWebPushSubscription>) || model<IWebPushSubscription>("WebPushSubscription", WebPushSubscriptionSchema);
