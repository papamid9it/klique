import { Schema, model, models, type Model, type Types } from "mongoose";

/** The audit log: one row per thing a site admin did in /admin. */
export interface IAdminAction {
  _id: Types.ObjectId;
  adminId: Types.ObjectId;
  action: string;
  targetType: "user" | "event" | "community" | "report" | "draft" | "source" | "post" | "message" | "channelMessage" | "subcommunity" | "ad" | "points";
  targetId: Types.ObjectId | null;
  /** what the target was called at the time, so the log still reads after it's deleted */
  targetLabel: string;
  note: string;
  /** where to look at the target in the app (null once it's deleted) */
  href: string | null;
  createdAt: Date;
}

const AdminActionSchema = new Schema<IAdminAction>(
  {
    adminId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: Schema.Types.ObjectId, default: null },
    targetLabel: { type: String, default: "", maxlength: 200 },
    note: { type: String, default: "", maxlength: 300 },
    href: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
AdminActionSchema.index({ createdAt: -1 });
AdminActionSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

export const AdminAction: Model<IAdminAction> = (models.AdminAction as Model<IAdminAction>) || model<IAdminAction>("AdminAction", AdminActionSchema);
