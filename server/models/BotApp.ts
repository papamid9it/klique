import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "./define";

/**
 * A bot (Settings → Developers; Pro). It has its own account (`userId`, a User with `bot` set) that communities add
 * like a member, with a role holding the permissions its installer chose. Klique sends it signed events at
 * `endpoint` and it calls the bot API with its token (only the hash is kept). Slash commands it registers show in
 * the "/" menu where it's installed.
 */
export interface BotCommand {
  name: string;
  description: string;
  options: { name: string; description: string; required: boolean }[];
}

export interface IBotApp {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  description: string;
  avatarUrl: string | null;
  /** https URL events are POSTed to; null: no events */
  endpoint: string | null;
  tokenHash: string;
  /** signs the events Klique sends (HMAC-SHA256), so the bot can check they're from us */
  signingSecret: string;
  /** what it asks for when added (the installer can give less) */
  permissions: string[];
  commands: BotCommand[];
  /** stop sending events after many failures in a row (it shows in Developers) */
  failures: number;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const CommandSchema = new Schema<BotCommand>(
  {
    name: { type: String, required: true, maxlength: 32 },
    description: { type: String, default: "", maxlength: 100 },
    options: { type: [new Schema({ name: { type: String, maxlength: 32 }, description: { type: String, maxlength: 100 }, required: { type: Boolean, default: false } }, { _id: false })], default: [] },
  },
  { _id: false },
);

const BotAppSchema = new Schema<IBotApp>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 32 },
    description: { type: String, default: "", maxlength: 300 },
    avatarUrl: { type: String, default: null, maxlength: 600 },
    endpoint: { type: String, default: null, maxlength: 500 },
    tokenHash: { type: String, required: true },
    signingSecret: { type: String, required: true },
    permissions: { type: [String], default: [] },
    commands: { type: [CommandSchema], default: [] },
    failures: { type: Number, default: 0 },
    disabledAt: { type: Date, default: null },
  },
  { timestamps: true },
);
BotAppSchema.index({ ownerId: 1, createdAt: -1 });
BotAppSchema.index({ tokenHash: 1 });

export const BotApp: Model<IBotApp> = defineModel<IBotApp>("BotApp", BotAppSchema);
