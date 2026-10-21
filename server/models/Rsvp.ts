import { Schema, model, models, type Model, type Types } from "mongoose";

export interface IRsvp {
  _id: Types.ObjectId;
  eventId: Types.ObjectId;
  userId: Types.ObjectId;
  status: "going" | "interested";
  /** the host confirmed they came (earns Hype) */
  attendedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const RsvpSchema = new Schema<IRsvp>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["going", "interested"], required: true },
    attendedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

RsvpSchema.index({ eventId: 1, userId: 1 }, { unique: true });
RsvpSchema.index({ userId: 1, status: 1 });

export const Rsvp: Model<IRsvp> = (models.Rsvp as Model<IRsvp>) || model<IRsvp>("Rsvp", RsvpSchema);

export interface ISavedEvent {
  _id: Types.ObjectId;
  eventId: Types.ObjectId;
  userId: Types.ObjectId;
  createdAt: Date;
}

const SavedEventSchema = new Schema<ISavedEvent>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

SavedEventSchema.index({ eventId: 1, userId: 1 }, { unique: true });
SavedEventSchema.index({ userId: 1, createdAt: -1 });

export const SavedEvent: Model<ISavedEvent> =
  (models.SavedEvent as Model<ISavedEvent>) || model<ISavedEvent>("SavedEvent", SavedEventSchema);
