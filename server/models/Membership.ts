import { Schema, model, models, type Model, type Types } from "mongoose";

/**
 * One row per (user, space). A "space" is a community (subcommunityId = null)
 * or a subcommunity (subcommunityId set; communityId is always its parent).
 * status "banned" blocks rejoining after a moderator removes someone with a ban.
 */
export interface IMembership {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  communityId: Types.ObjectId;
  subcommunityId: Types.ObjectId | null;
  role: "owner" | "admin" | "member";
  status: "active" | "banned";
  createdAt: Date;
  updatedAt: Date;
}

const MembershipSchema = new Schema<IMembership>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    communityId: { type: Schema.Types.ObjectId, ref: "Community", required: true },
    subcommunityId: { type: Schema.Types.ObjectId, ref: "Subcommunity", default: null },
    role: { type: String, enum: ["owner", "admin", "member"], default: "member" },
    status: { type: String, enum: ["active", "banned"], default: "active" },
  },
  { timestamps: true },
);

MembershipSchema.index({ userId: 1, communityId: 1, subcommunityId: 1 }, { unique: true });
MembershipSchema.index({ communityId: 1, subcommunityId: 1, status: 1, role: 1 });
MembershipSchema.index({ userId: 1, status: 1 });

export const Membership: Model<IMembership> =
  (models.Membership as Model<IMembership>) || model<IMembership>("Membership", MembershipSchema);
