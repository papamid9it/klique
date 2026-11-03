import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "./define";

/**
 * A channel webhook (Pro): a secret link an outside tool (Zapier, GitHub, a script) posts messages to, into one
 * channel of a community. It belongs to the community and is managed by its owner (how many: the owner's plan).
 * Only a hash of the secret is kept.
 */
export interface IWebhook {
  _id: Types.ObjectId;
  communityId: Types.ObjectId;
  channelId: Types.ObjectId;
  /** the name and picture its messages show (a "BOT" tag beside them) */
  name: string;
  avatarUrl: string | null;
  /** sha256 of the secret in the link */
  tokenHash: string;
  /** may its messages ping @everyone / @here (off unless the owner turns it on) */
  allowMassMention: boolean;
  createdById: Types.ObjectId;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookSchema = new Schema<IWebhook>(
  {
    communityId: { type: Schema.Types.ObjectId, ref: "Community", required: true },
    channelId: { type: Schema.Types.ObjectId, ref: "Channel", required: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    avatarUrl: { type: String, default: null, maxlength: 600 },
    tokenHash: { type: String, required: true },
    allowMassMention: { type: Boolean, default: false },
    createdById: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
WebhookSchema.index({ communityId: 1, createdAt: -1 });
WebhookSchema.index({ channelId: 1 });

export const Webhook: Model<IWebhook> = defineModel<IWebhook>("Webhook", WebhookSchema);
