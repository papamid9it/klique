import { Schema, model, models, type Model, type Types } from "mongoose";

export interface IMembershipRequest {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  communityId: Types.ObjectId;
  subcommunityId: Types.ObjectId | null;
  message: string;
  status: "pending" | "approved" | "rejected";
  decidedBy: Types.ObjectId | null;
  decidedAt: Date | null;
  createdAt: Date;
}

const MembershipRequestSchema = new Schema<IMembershipRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    communityId: { type: Schema.Types.ObjectId, ref: "Community", required: true },
    subcommunityId: { type: Schema.Types.ObjectId, ref: "Subcommunity", default: null },
    message: { type: String, default: "", maxlength: 300 },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    decidedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Only one *pending* request per person per space.
MembershipRequestSchema.index(
  { userId: 1, communityId: 1, subcommunityId: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);
MembershipRequestSchema.index({ communityId: 1, subcommunityId: 1, status: 1, createdAt: -1 });

export const MembershipRequest: Model<IMembershipRequest> =
  (models.MembershipRequest as Model<IMembershipRequest>) ||
  model<IMembershipRequest>("MembershipRequest", MembershipRequestSchema);
