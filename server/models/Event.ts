import { Schema, model, models, type Model, type Types } from "mongoose";
import { type InterestId } from "@/lib/constants";

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
    capacity: { type: Number, default: null, min: 1 },
    coverImage: { type: String, default: null },
    goingCount: { type: Number, default: 0 },
    interestedCount: { type: Number, default: 0 },
    cancelled: { type: Boolean, default: false },
    reminderSentAt: { type: Date, default: null },
    organizerName: { type: String, default: null, maxlength: 120 },
    sourceUrl: { type: String, default: null, maxlength: 1000 },
  },
  { timestamps: true },
);

EventSchema.index({ audience: 1, country: 1, city: 1, startsAt: 1 });
EventSchema.index({ communityId: 1, startsAt: 1 });
EventSchema.index({ subcommunityId: 1, startsAt: 1 });
EventSchema.index({ title: "text", description: "text", venue: "text" });

export const Event: Model<IEvent> = (models.Event as Model<IEvent>) || model<IEvent>("Event", EventSchema);
