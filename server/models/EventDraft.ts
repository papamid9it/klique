import { Schema, model, models, type Model, type Types } from "mongoose";
import { INTEREST_IDS, type InterestId } from "@/lib/constants";

/**
 * An event found on another site (pasted by an admin or picked up from a source page), waiting in the
 * admin inbox. Nothing here is visible to anyone else: approving it creates a real Event.
 */
export interface IEventDraft {
  _id: Types.ObjectId;
  status: "pending" | "approved" | "rejected";
  /** the event's own page; one draft per page */
  sourceUrl: string;
  sourceName: string;
  title: string;
  description: string;
  interest: InterestId;
  organizerName: string;
  country: string;
  region: string;
  city: string;
  venue: string;
  online: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  price: number;
  currency: string;
  coverImage: string | null;
  eventId: Types.ObjectId | null;
  reviewedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const EventDraftSchema = new Schema<IEventDraft>(
  {
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    sourceUrl: { type: String, required: true, unique: true, maxlength: 1000 },
    sourceName: { type: String, default: "", maxlength: 120 },
    title: { type: String, default: "", maxlength: 200 },
    description: { type: String, default: "", maxlength: 4000 },
    interest: { type: String, enum: INTEREST_IDS, default: "music" },
    organizerName: { type: String, default: "", maxlength: 120 },
    country: { type: String, default: "NG" },
    region: { type: String, default: "" },
    city: { type: String, default: "" },
    venue: { type: String, default: "", maxlength: 200 },
    online: { type: Boolean, default: false },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    price: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "NGN" },
    coverImage: { type: String, default: null },
    eventId: { type: Schema.Types.ObjectId, ref: "Event", default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);
EventDraftSchema.index({ status: 1, startsAt: 1 });

export const EventDraft: Model<IEventDraft> = (models.EventDraft as Model<IEventDraft>) || model<IEventDraft>("EventDraft", EventDraftSchema);

/** A page the nightly finder checks for events (a venue's or ticket site's listings page). */
export interface IEventSource {
  _id: Types.ObjectId;
  url: string;
  name: string;
  lastRunAt: Date | null;
  lastFound: number;
  lastError: string;
  createdAt: Date;
}

const EventSourceSchema = new Schema<IEventSource>(
  {
    url: { type: String, required: true, unique: true, maxlength: 1000 },
    name: { type: String, default: "", maxlength: 120 },
    lastRunAt: { type: Date, default: null },
    lastFound: { type: Number, default: 0 },
    lastError: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const EventSource: Model<IEventSource> = (models.EventSource as Model<IEventSource>) || model<IEventSource>("EventSource", EventSourceSchema);
