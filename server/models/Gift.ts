import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "./define";

/**
 * Gifts and the Hype that pays for them (lib/gifts.ts). The balance lives on the user (`User.giftHype`, changed only
 * with atomic $inc, never below zero); every change also writes one HypeEntry, so the history explains the balance.
 */

/** One gift in the catalogue (Admin → Gifts). */
export interface IGift {
  _id: Types.ObjectId;
  slug: string;
  name: string;
  /** shown when there's no picture (and as its label) */
  emoji: string;
  /** an uploaded picture or animation (R2); null shows the emoji */
  artUrl: string | null;
  /** naira */
  price: number;
  position: number;
  active: boolean;
  createdAt: Date;
}

const GiftSchema = new Schema<IGift>(
  {
    slug: { type: String, required: true, unique: true, maxlength: 40 },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    emoji: { type: String, default: "🎁", maxlength: 16 },
    artUrl: { type: String, default: null, maxlength: 600 },
    price: { type: Number, required: true, min: 1 },
    position: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
GiftSchema.index({ active: 1, position: 1 });
export const Gift: Model<IGift> = defineModel<IGift>("Gift", GiftSchema);

export type HypeEntryKind = "topup" | "gift" | "grant" | "revoke" | "refund";

/** One change to someone's gift Hype. */
export interface IHypeEntry {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  /** + added, − spent */
  amount: number;
  balanceAfter: number;
  kind: HypeEntryKind;
  note: string;
  /** the top-up's reference, or the gift sent */
  ref: string | null;
  byId: Types.ObjectId | null;
  createdAt: Date;
}

const HypeEntrySchema = new Schema<IHypeEntry>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    kind: { type: String, enum: ["topup", "gift", "grant", "revoke", "refund"], required: true },
    note: { type: String, default: "", maxlength: 300 },
    ref: { type: String, default: null },
    byId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "hypeentries" },
);
HypeEntrySchema.index({ userId: 1, createdAt: -1 });
export const HypeEntry: Model<IHypeEntry> = defineModel<IHypeEntry>("HypeEntry", HypeEntrySchema);

/** A Hype top-up: on the website with Paystack ("khy_…"), or in the app with Apple or Google (the store's transaction id). */
export interface IHypeTopup {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  platform: "web" | "apple" | "google";
  hype: number;
  /** what they paid, naira */
  amount: number;
  /** what the store keeps, naira (0 on the web) */
  storeFee: number;
  /** the web pack picked, or the store's product id ("custom" for a typed amount) */
  pack: string;
  /** Paystack reference, or "apple:<id>" / "google:<order id>": unique, so one payment credits once */
  reference: string;
  status: "pending" | "paid";
  /** a store sandbox purchase (only accepted with STORE_IAP_ALLOW_TEST=1) */
  test: boolean;
  paidAt: Date | null;
  /** set once when a paid top-up from before credits were all-or-nothing is found without its Hype and credited then */
  repairedAt?: Date | null;
  createdAt: Date;
}

const HypeTopupSchema = new Schema<IHypeTopup>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    platform: { type: String, enum: ["web", "apple", "google"], required: true },
    hype: { type: Number, required: true, min: 1 },
    amount: { type: Number, required: true, min: 0 },
    storeFee: { type: Number, default: 0 },
    pack: { type: String, default: "custom", maxlength: 40 },
    reference: { type: String, required: true, unique: true },
    status: { type: String, enum: ["pending", "paid"], default: "pending" },
    test: { type: Boolean, default: false },
    paidAt: { type: Date, default: null },
    repairedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "hypetopups" },
);
HypeTopupSchema.index({ status: 1, paidAt: -1 });
HypeTopupSchema.index({ userId: 1, createdAt: -1 });
export const HypeTopup: Model<IHypeTopup> = defineModel<IHypeTopup>("HypeTopup", HypeTopupSchema);

/** One gift sent. The sender's id is always kept (only site admins see it on an anonymous gift). */
export interface IGiftSend {
  _id: Types.ObjectId;
  fromId: Types.ObjectId;
  toId: Types.ObjectId;
  giftId: Types.ObjectId;
  /** copied at send time, so later catalogue edits don't change history */
  giftName: string;
  emoji: string;
  artUrl: string | null;
  /** naira value and Hype paid */
  price: number;
  hype: number;
  target: { type: "post" | "comment" | "topic" | "reply"; id: Types.ObjectId };
  communityId: Types.ObjectId | null;
  anonymous: boolean;
  /** the sender's one-off id for this send: the same send twice is one gift */
  clientKey: string;
  status: "pending" | "sent";
  /** naira the receiver earns, and what Klique keeps */
  receiverAmount: number;
  kliqueAmount: number;
  /** earnings can be paid out after this */
  holdUntil: Date;
  /** the payout request that claimed these earnings */
  payoutId: Types.ObjectId | null;
  createdAt: Date;
}

const GiftSendSchema = new Schema<IGiftSend>(
  {
    fromId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    toId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    giftId: { type: Schema.Types.ObjectId, ref: "Gift", required: true },
    giftName: { type: String, required: true },
    emoji: { type: String, default: "🎁" },
    artUrl: { type: String, default: null },
    price: { type: Number, required: true },
    hype: { type: Number, required: true },
    target: { type: new Schema({ type: { type: String, enum: ["post", "comment", "topic", "reply"], required: true }, id: { type: Schema.Types.ObjectId, required: true } }, { _id: false }), required: true },
    communityId: { type: Schema.Types.ObjectId, ref: "Community", default: null },
    anonymous: { type: Boolean, default: false },
    clientKey: { type: String, required: true, maxlength: 64 },
    status: { type: String, enum: ["pending", "sent"], default: "pending" },
    receiverAmount: { type: Number, required: true },
    kliqueAmount: { type: Number, required: true },
    holdUntil: { type: Date, required: true },
    payoutId: { type: Schema.Types.ObjectId, ref: "Payout", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "giftsends" },
);
GiftSendSchema.index({ fromId: 1, clientKey: 1 }, { unique: true });
GiftSendSchema.index({ "target.type": 1, "target.id": 1, status: 1 });
GiftSendSchema.index({ toId: 1, createdAt: -1 });
GiftSendSchema.index({ fromId: 1, createdAt: -1 });
GiftSendSchema.index({ toId: 1, payoutId: 1, holdUntil: 1 });
GiftSendSchema.index({ createdAt: -1 });
export const GiftSend: Model<IGiftSend> = defineModel<IGiftSend>("GiftSend", GiftSendSchema);
