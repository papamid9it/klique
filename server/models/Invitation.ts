import { Schema, model, models, type Model, type Types } from "mongoose";

/** A shareable invite link: /invite/<code>. Grants entry to ONE space. */
export interface IInvitation {
  _id: Types.ObjectId;
  code: string;
  communityId: Types.ObjectId;
  subcommunityId: Types.ObjectId | null;
  createdBy: Types.ObjectId;
  expiresAt: Date | null;
  maxUses: number | null;
  uses: number;
  revokedAt: Date | null;
  createdAt: Date;
}

const InvitationSchema = new Schema<IInvitation>(
  {
    code: { type: String, required: true, unique: true },
    communityId: { type: Schema.Types.ObjectId, ref: "Community", required: true },
    subcommunityId: { type: Schema.Types.ObjectId, ref: "Subcommunity", default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, default: null },
    maxUses: { type: Number, default: null },
    uses: { type: Number, default: 0 },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

InvitationSchema.index({ communityId: 1, subcommunityId: 1, createdAt: -1 });

export const Invitation: Model<IInvitation> =
  (models.Invitation as Model<IInvitation>) || model<IInvitation>("Invitation", InvitationSchema);
