import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "./define";

/**
 * A community's moderation log: one row each time someone removed another person's content in that community
 * (its owner, one of its admins, or a site admin). The owner and admins see it in the community's settings.
 * Site-wide, the same removals are also in the admin audit log.
 */
export interface IModAction {
  _id: Types.ObjectId;
  communityId: Types.ObjectId;
  actorId: Types.ObjectId;
  /** "delete" for now */
  action: string;
  /** what it was: a post, comment, topic, message, event, klique, klique message */
  targetType: string;
  targetId: Types.ObjectId | null;
  /** what it said or was called, so the log still reads after it's gone */
  label: string;
  /** the person whose content it was */
  authorId: Types.ObjectId | null;
  createdAt: Date;
}

const ModActionSchema = new Schema<IModAction>(
  {
    communityId: { type: Schema.Types.ObjectId, ref: "Community", required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true, maxlength: 40 },
    targetType: { type: String, required: true, maxlength: 40 },
    targetId: { type: Schema.Types.ObjectId, default: null },
    label: { type: String, default: "", maxlength: 240 },
    authorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
ModActionSchema.index({ communityId: 1, createdAt: -1 });

export const ModAction: Model<IModAction> = defineModel<IModAction>("ModAction", ModActionSchema);
