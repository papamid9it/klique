import { Schema, model, models, type Model, type Types } from "mongoose";

export interface IBlock {
  _id: Types.ObjectId;
  blockerId: Types.ObjectId;
  blockedId: Types.ObjectId;
  createdAt: Date;
}

const BlockSchema = new Schema<IBlock>(
  {
    blockerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    blockedId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
BlockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
BlockSchema.index({ blockedId: 1 });

export const Block: Model<IBlock> = (models.Block as Model<IBlock>) || model<IBlock>("Block", BlockSchema);

export interface IReport {
  _id: Types.ObjectId;
  reporterId: Types.ObjectId;
  targetType: "user" | "post" | "event" | "community" | "subcommunity" | "message" | "channelMessage" | "ad";
  targetId: Types.ObjectId;
  /** extra routing context so a moderator knows where the target lives */
  communityId: Types.ObjectId | null;
  reason: string;
  details: string;
  status: "open" | "reviewing" | "actioned" | "dismissed";
  createdAt: Date;
}

const ReportSchema = new Schema<IReport>(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    targetType: {
      type: String,
      enum: ["user", "post", "event", "community", "subcommunity", "message", "channelMessage", "ad"],
      required: true,
    },
    targetId: { type: Schema.Types.ObjectId, required: true },
    communityId: { type: Schema.Types.ObjectId, ref: "Community", default: null },
    reason: { type: String, required: true },
    details: { type: String, default: "", maxlength: 1000 },
    status: { type: String, enum: ["open", "reviewing", "actioned", "dismissed"], default: "open" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
ReportSchema.index({ status: 1, createdAt: -1 });
// One open report per reporter per target — stops accidental double-submits.
ReportSchema.index(
  { reporterId: 1, targetType: 1, targetId: 1 },
  { unique: true, partialFilterExpression: { status: "open" } },
);

export const Report: Model<IReport> = (models.Report as Model<IReport>) || model<IReport>("Report", ReportSchema);
