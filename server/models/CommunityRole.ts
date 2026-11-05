import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "./define";

/**
 * A custom role in a community (lib/roles): name, colour, optional emoji, permissions, and its place in the order
 * (higher `position` = higher up = more say). `builtin: "admin"` is the community's Admin role, kept in step with
 * Membership.role "admin". People hold roles through Membership.roleIds (community rows).
 */
export interface ICommunityRole {
  _id: Types.ObjectId;
  communityId: Types.ObjectId;
  name: string;
  color: string | null;
  icon: string | null;
  position: number;
  permissions: string[];
  /** members can give it to themselves (on the welcome screen) */
  selfAssignable: boolean;
  builtin: "admin" | null;
  /** the role a bot got when it was added (it can't be given to anyone else or deleted; removing the bot removes it) */
  botAppId?: Types.ObjectId | null;
  /** a bot's role: when the community allowed it to read messages. It sees nothing older. Null: it can't. */
  readMessagesSince?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const CommunityRoleSchema = new Schema<ICommunityRole>(
  {
    communityId: { type: Schema.Types.ObjectId, ref: "Community", required: true },
    name: { type: String, required: true, trim: true, maxlength: 32 },
    color: { type: String, default: null, maxlength: 7 },
    icon: { type: String, default: null, maxlength: 16 },
    position: { type: Number, default: 1 },
    permissions: { type: [String], default: [] },
    selfAssignable: { type: Boolean, default: false },
    builtin: { type: String, enum: ["admin", null], default: null },
    botAppId: { type: Schema.Types.ObjectId, default: null },
    readMessagesSince: { type: Date, default: null },
  },
  { timestamps: true },
);
CommunityRoleSchema.index({ communityId: 1, position: -1 });

export const CommunityRole: Model<ICommunityRole> = defineModel<ICommunityRole>("CommunityRole", CommunityRoleSchema);
