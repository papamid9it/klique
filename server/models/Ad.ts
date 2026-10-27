import { Schema, type Model, type Types } from "mongoose";
import { type InterestId } from "@/lib/constants";
import { defineModel } from "./define";

export const AD_SLOTS = ["home-feed", "home-rail", "events-list", "event-page", "search", "communities"] as const;
export type AdSlot = (typeof AD_SLOTS)[number];

/**
 * An ad set up by a site admin. A promoted event (an existing public event shown as "Promoted"), a brand ad
 * (picture, headline, text, button and link), or a sponsored community (shown under "Sponsored communities" on
 * the Communities page, only in the "communities" slot). Always labelled "Sponsored" in the app.
 * Targeted by place and scene only: nothing about the person is tracked.
 */
export interface IAd {
  _id: Types.ObjectId;
  /** internal name, for the admin list */
  name: string;
  kind: "event" | "brand" | "community";
  status: "active" | "paused";
  eventId: Types.ObjectId | null;
  /** sponsored communities: the (public) community */
  communityId?: Types.ObjectId | null;
  advertiser: string;
  title: string;
  body: string;
  imageUrl: string | null;
  ctaLabel: string;
  url: string;
  slots: AdSlot[];
  /** place scopes like "city:NG:lagos" or "country:NG"; empty = everywhere */
  places: string[];
  /** scenes; empty = every scene */
  interests: InterestId[];
  /** search words that trigger it on the search page; empty = any search */
  keywords: string[];
  startsAt: Date | null;
  endsAt: Date | null;
  /** 1–10: how often it wins when several ads fit the same spot */
  weight: number;
  impressions: number;
  clicks: number;
  /** set when a host paid for it through Paystack */
  promotionId: Types.ObjectId | null;
  /** set when someone's approved, paid ad request (AdCampaign) became this ad */
  campaignId?: Types.ObjectId | null;
  /** paid promotions waiting for an admin (PROMOTION_REVIEW=1); the run starts when approved */
  pendingReview: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AdSchema = new Schema<IAd>(
  {
    name: { type: String, required: true, maxlength: 120 },
    kind: { type: String, enum: ["event", "brand", "community"], required: true },
    status: { type: String, enum: ["active", "paused"], default: "active" },
    eventId: { type: Schema.Types.ObjectId, ref: "Event", default: null },
    communityId: { type: Schema.Types.ObjectId, ref: "Community", default: null },
    advertiser: { type: String, default: "", maxlength: 80 },
    title: { type: String, default: "", maxlength: 120 },
    body: { type: String, default: "", maxlength: 200 },
    imageUrl: { type: String, default: null },
    ctaLabel: { type: String, default: "Learn more", maxlength: 24 },
    url: { type: String, default: "", maxlength: 1000 },
    slots: { type: [String], enum: AD_SLOTS, default: [] },
    places: { type: [String], default: [] },
    interests: { type: [String], default: [] },
    keywords: { type: [String], default: [] },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    weight: { type: Number, default: 5, min: 1, max: 10 },
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    promotionId: { type: Schema.Types.ObjectId, ref: "Promotion", default: null },
    pendingReview: { type: Boolean, default: false },
    campaignId: { type: Schema.Types.ObjectId, ref: "AdCampaign", default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);
AdSchema.index({ status: 1, slots: 1 });

export const Ad: Model<IAd> = defineModel<IAd>("Ad", AdSchema);
