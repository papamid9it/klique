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
  /** "Suppress @everyone and @here" in this community (their notification setting) */
  suppressEveryone?: boolean;
  /** you muted this community: its chat stops notifying you and its unread dot goes (an @mention still shows a badge) */
  muted?: boolean;
  /** their answers to the community's entry questions when they joined (what each question said, then) */
  answers?: { prompt: string; answer: string }[];
  /**
   * Timed out (community rows only) until then: they can read, but not post, react, vote, or start events or kliques
   * in the community or its groups. Set by an owner or admin above them; cleared early with "Remove timeout".
   */
  timeoutUntil?: Date | null;
  timeoutReason?: string | null;
  timeoutById?: Types.ObjectId | null;
  /**
   * Stopped from writing in the Posts section and on Boards (community rows only), by an owner or admin above them.
   * They stay in the community and can still chat, react and go to events. until: null = until it's lifted.
   */
  postBan?: { until: Date | null; reason?: string; byId?: Types.ObjectId } | null;
  /** custom roles they hold (community rows; models/CommunityRole) */
  roleIds?: Types.ObjectId[];
  /** a group row: the title its owner gave them ("Moderator", "Treasurer"…), and what it lets them do (lib/roles GROUP_POWERS) */
  title?: string | null;
  powers?: string[];
  /** they accepted the community's rules (welcome screen) */
  rulesAcceptedAt?: Date | null;
  /** they've seen the welcome screen */
  welcomedAt?: Date | null;
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
    suppressEveryone: { type: Boolean, default: false },
    muted: { type: Boolean, default: false },
    answers: { type: [{ _id: false, prompt: { type: String, maxlength: 200 }, answer: { type: String, maxlength: 500 } }], default: [] },
    timeoutUntil: { type: Date, default: null },
    timeoutReason: { type: String, default: null, maxlength: 300 },
    timeoutById: { type: Schema.Types.ObjectId, default: null },
    roleIds: { type: [Schema.Types.ObjectId], default: [] },
    postBan: { type: { until: Date, reason: String, byId: Schema.Types.ObjectId, _id: false }, default: null },
    title: { type: String, default: null },
    powers: { type: [String], default: undefined },
    rulesAcceptedAt: { type: Date, default: null },
    welcomedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

MembershipSchema.index({ userId: 1, communityId: 1, subcommunityId: 1 }, { unique: true });
MembershipSchema.index({ communityId: 1, subcommunityId: 1, status: 1, role: 1 });
MembershipSchema.index({ userId: 1, status: 1 });

export const Membership: Model<IMembership> =
  (models.Membership as Model<IMembership>) || model<IMembership>("Membership", MembershipSchema);
