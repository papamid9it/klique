import { Schema, model, models, type Model, type Types } from "mongoose";

/** A host paying (through Paystack) to promote their event. Paid promotions become an Ad. */
export interface IPromotion {
  _id: Types.ObjectId;
  eventId: Types.ObjectId;
  hostId: Types.ObjectId;
  days: number;
  /** scope the promotion targets, e.g. "city:NG:lagos" */
  reach: string;
  /** smallest currency unit (kobo) */
  amount: number;
  currency: string;
  reference: string;
  status: "pending" | "paid" | "failed";
  adId: Types.ObjectId | null;
  paidAt: Date | null;
  channel: string;
  createdAt: Date;
  updatedAt: Date;
}

const PromotionSchema = new Schema<IPromotion>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    hostId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    days: { type: Number, required: true, min: 1, max: 60 },
    reach: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "NGN" },
    reference: { type: String, required: true, unique: true },
    status: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
    adId: { type: Schema.Types.ObjectId, ref: "Ad", default: null },
    paidAt: { type: Date, default: null },
    channel: { type: String, default: "" },
  },
  { timestamps: true },
);

export const Promotion: Model<IPromotion> = (models.Promotion as Model<IPromotion>) || model<IPromotion>("Promotion", PromotionSchema);
