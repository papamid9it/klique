import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "./define";
import { NOTIFY_CATEGORY_IDS, type NotifyCategory } from "@/lib/notifications";

/**
 * One entry in someone's notification inbox (the bell). Similar ones bundle: while an entry with the same
 * `groupKey` is unread, a new one updates it (count + 1, newest wording) instead of adding another line.
 * Entries delete themselves after 60 days.
 */
export type NotifyAction =
  | { kind: "crewRequest"; crewId: string; userId: string }
  | { kind: "communityRequest"; slug: string; requestId: string }
  | { kind: "event"; eventId: string }
  /** a member's event waiting for this owner/admin to approve it */
  | { kind: "eventReview"; eventId: string };

export interface INotification {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  category: NotifyCategory;
  title: string;
  body: string;
  /** where tapping it goes */
  href: string;
  groupKey: string | null;
  count: number;
  /** who did it (the newest few of a bundle), for the faces on the line */
  actorIds?: Types.ObjectId[];
  /** a picture for the line (an event's cover) */
  image?: string | null;
  /** what can be answered right from the line: a crew or community join request, or an event to RSVP to */
  action?: NotifyAction | null;
  read: boolean;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    category: { type: String, enum: NOTIFY_CATEGORY_IDS, required: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, default: "", maxlength: 400 },
    href: { type: String, default: "/" },
    groupKey: { type: String, default: null },
    count: { type: Number, default: 1 },
    actorIds: { type: [Schema.Types.ObjectId], default: [] },
    image: { type: String, default: null },
    action: { type: Schema.Types.Mixed, default: null },
    read: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

NotificationSchema.index({ userId: 1, updatedAt: -1 });
NotificationSchema.index({ userId: 1, read: 1 });
NotificationSchema.index({ userId: 1, groupKey: 1, read: 1 });
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Notification: Model<INotification> = defineModel<INotification>("Notification", NotificationSchema);
