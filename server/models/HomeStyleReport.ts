import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "./define";

/**
 * Which Home style (lib/constants HOME_STYLES) someone uses on each kind of device. The choice itself lives on the
 * device; this is only so admins can see how many people use each. One row per person and device kind.
 */
export interface IHomeStyleReport {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  platform: "phone" | "site" | "desktop";
  style: "casual" | "communities";
  seenAt: Date;
}

const HomeStyleReportSchema = new Schema<IHomeStyleReport>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  platform: { type: String, enum: ["phone", "site", "desktop"], required: true },
  style: { type: String, enum: ["casual", "communities"], required: true },
  seenAt: { type: Date, required: true },
});

HomeStyleReportSchema.index({ userId: 1, platform: 1 }, { unique: true });
HomeStyleReportSchema.index({ seenAt: -1 });

export const HomeStyleReport: Model<IHomeStyleReport> = defineModel<IHomeStyleReport>("HomeStyleReport", HomeStyleReportSchema);
