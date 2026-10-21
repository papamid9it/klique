import { Schema, model, models, type Model, type Types } from "mongoose";
import { NOTIFY_CATEGORY_IDS, type NotifyCategory } from "@/lib/notifications";

/**
 * One entry in someone's notification inbox (the bell). Similar ones bundle: while an entry with the same
 * `groupKey` is unread, a new one updates it (count + 1, newest wording) instead of adding another line.
 * Entries delete themselves after 60 days.
 */
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
    read: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

NotificationSchema.index({ userId: 1, updatedAt: -1 });
NotificationSchema.index({ userId: 1, read: 1 });
NotificationSchema.index({ userId: 1, groupKey: 1, read: 1 });
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Notification: Model<INotification> = (models.Notification as Model<INotification>) || model<INotification>("Notification", NotificationSchema);
