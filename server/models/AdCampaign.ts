import { Schema, model, models, type Model, type Types } from "mongoose";
import { AD_PLACEMENTS, AD_REACHES, type AdPlacement, type AdReach } from "@/lib/ads";

/**
 * An ad someone asked to run. The steps: they submit it ("pending") → a site admin approves it, asks for
 * changes, or rejects it → once approved they pay (Paystack, or an admin marks it paid) → it becomes a live
 * Ad for the days they bought, then ends. Every step notifies them.
 */
export type CampaignStatus = "pending" | "changes" | "rejected" | "approved" | "paid" | "cancelled";

export interface IAdCampaign {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  kind: "event" | "community" | "brand";
  eventId: Types.ObjectId | null;
  communityId: Types.ObjectId | null;
  /** brand ads (and the wording for event/community ads, filled in from them) */
  advertiser: string;
  title: string;
  body: string;
  imageUrl: string | null;
  ctaLabel: string;
  url: string;
  placements: AdPlacement[];
  reach: AdReach;
  /** for city/country reach: "city:NG:lagos" or "country:NG" */
  place: string | null;
  days: number;
  /** when they'd like it to start (null = as soon as it's paid) */
  startOn: Date | null;
  /** naira, worked out by the server at submission (and again if edited) */
  amount: number;
  currency: string;
  status: CampaignStatus;
  /** the admin's reason, for "changes" and "rejected" */
  reviewNote: string;
  reviewedBy: Types.ObjectId | null;
  reviewedAt: Date | null;
  paymentRef: string | null;
  /** the Paystack checkout for paymentRef, reused if they press Pay again */
  paymentUrl: string | null;
  paymentMethod: "paystack" | "manual" | null;
  paidAt: Date | null;
  /** the running ad, once paid */
  adId: Types.ObjectId | null;
  startsAt: Date | null;
  endsAt: Date | null;
  endingSoonSentAt: Date | null;
  endedSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const AdCampaignSchema = new Schema<IAdCampaign>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, enum: ["event", "community", "brand"], required: true },
    eventId: { type: Schema.Types.ObjectId, ref: "Event", default: null },
    communityId: { type: Schema.Types.ObjectId, ref: "Community", default: null },
    advertiser: { type: String, default: "", maxlength: 80 },
    title: { type: String, default: "", maxlength: 120 },
    body: { type: String, default: "", maxlength: 200 },
    imageUrl: { type: String, default: null },
    ctaLabel: { type: String, default: "Learn more", maxlength: 24 },
    url: { type: String, default: "", maxlength: 1000 },
    placements: { type: [String], enum: AD_PLACEMENTS.map((p) => p.id), default: [] },
    reach: { type: String, enum: AD_REACHES.map((r) => r.id), default: "city" },
    place: { type: String, default: null },
    days: { type: Number, required: true, min: 1, max: 365 },
    startOn: { type: Date, default: null },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "NGN" },
    status: { type: String, enum: ["pending", "changes", "rejected", "approved", "paid", "cancelled"], default: "pending" },
    reviewNote: { type: String, default: "", maxlength: 500 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    paymentRef: { type: String, default: null },
    paymentUrl: { type: String, default: null },
    paymentMethod: { type: String, enum: ["paystack", "manual", null], default: null },
    paidAt: { type: Date, default: null },
    adId: { type: Schema.Types.ObjectId, ref: "Ad", default: null },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    endingSoonSentAt: { type: Date, default: null },
    endedSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

AdCampaignSchema.index({ userId: 1, createdAt: -1 });
AdCampaignSchema.index({ status: 1, createdAt: 1 });
AdCampaignSchema.index({ paymentRef: 1 }, { unique: true, partialFilterExpression: { paymentRef: { $type: "string" } } });
AdCampaignSchema.index({ status: 1, endsAt: 1 });

export const AdCampaign: Model<IAdCampaign> = (models.AdCampaign as Model<IAdCampaign>) || model<IAdCampaign>("AdCampaign", AdCampaignSchema);
