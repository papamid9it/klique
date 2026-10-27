import { Schema, type Model, type Types } from "mongoose";
import { type InterestId } from "@/lib/constants";
import { defineModel } from "./define";

/**
 * `audience` is denormalised from the owning space so list queries can filter
 * visibility in one indexed query:
 *   public       -> anyone (also signed-out visitors)
 *   community    -> active members of `communityId`
 *   subcommunity -> active members of `subcommunityId`
 * It is recomputed whenever a community's privacy changes.
 */
export interface IEvent {
  _id: Types.ObjectId;
  hostId: Types.ObjectId;
  communityId: Types.ObjectId | null;
  subcommunityId: Types.ObjectId | null;
  audience: "public" | "community" | "subcommunity";
  title: string;
  description: string;
  interest: InterestId;
  country: string;
  region: string;
  city: string;
  neighborhood: string;
  venue: string;
  startsAt: Date;
  endsAt: Date | null;
  /** price in major units of `currency` (the field name is historical) */
  priceNaira: number;
  currency: string;
  online: boolean;
  /** where to buy tickets (the host's own page) */
  ticketUrl?: string | null;
  /** the link to join an online event (Zoom, Meet, a stream…) */
  onlineUrl?: string | null;
  capacity: number | null;
  coverImage: string | null;
  goingCount: number;
  interestedCount: number;
  cancelled: boolean;
  /** for events found elsewhere and approved by a site admin: who really runs it, and where to get tickets */
  organizerName?: string | null;
  sourceUrl?: string | null;
  /** set once the "starts soon" notification has gone out */
  reminderSentAt?: Date | null;
  /**
   * A member's event waiting for the community's owner or an admin ("pending"), or turned down ("rejected", with
   * `reviewReason`). Until approved only its host and the space's owners and admins see it. null: published.
   */
  review?: "pending" | "rejected" | null;
  /** people can chip in toward it through Paystack: so much a unit, up to `maxQuantity` units at a time (lib/money) */
  contribution?: { label: string; unitPrice: number; maxQuantity: number } | null;
  reviewReason?: string;
  reviewedById?: Types.ObjectId | null;
  reviewedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const EventSchema = new Schema<IEvent>(
  {
    hostId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    communityId: { type: Schema.Types.ObjectId, ref: "Community", default: null },
    subcommunityId: { type: Schema.Types.ObjectId, ref: "Subcommunity", default: null },
    audience: { type: String, enum: ["public", "community", "subcommunity"], default: "public" },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: "", maxlength: 4000 },
    interest: { type: String, required: true },
    country: { type: String, default: "NG", index: true },
    region: { type: String, default: "" },
    city: { type: String, required: true },
    neighborhood: { type: String, default: "", maxlength: 60 },
    venue: { type: String, required: true, trim: true, maxlength: 120 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, default: null },
    priceNaira: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "NGN" },
    online: { type: Boolean, default: false },
    ticketUrl: { type: String, default: null, maxlength: 500 },
    onlineUrl: { type: String, default: null, maxlength: 500 },
    capacity: { type: Number, default: null, min: 1 },
    coverImage: { type: String, default: null },
    goingCount: { type: Number, default: 0 },
    interestedCount: { type: Number, default: 0 },
    cancelled: { type: Boolean, default: false },
    reminderSentAt: { type: Date, default: null },
    organizerName: { type: String, default: null, maxlength: 120 },
    sourceUrl: { type: String, default: null, maxlength: 1000 },
    review: { type: String, enum: ["pending", "rejected", null], default: null },
    contribution: { type: new Schema({ label: { type: String, default: "", maxlength: 60 }, unitPrice: { type: Number, required: true, min: 100 }, maxQuantity: { type: Number, default: 1, min: 1, max: 100 } }, { _id: false }), default: null },
    reviewReason: { type: String, default: "", maxlength: 500 },
    reviewedById: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

EventSchema.index({ audience: 1, country: 1, city: 1, startsAt: 1 });
EventSchema.index({ communityId: 1, startsAt: 1 });
EventSchema.index({ subcommunityId: 1, startsAt: 1 });
EventSchema.index({ communityId: 1, review: 1, createdAt: -1 });
EventSchema.index({ title: "text", description: "text", venue: "text" });

export const Event: Model<IEvent> = defineModel<IEvent>("Event", EventSchema);
