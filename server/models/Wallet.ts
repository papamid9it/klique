import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "./define";

/**
 * Hype bookkeeping (the currency you buy). The balance itself lives on the user (`User.hype`, changed only with
 * atomic $inc); every change also writes one HypeTxn, so the history always explains the balance.
 * (The collections keep the names they had when this currency was called "points".)
 */
export type HypeTxnKind = "purchase" | "unlock" | "renew" | "grant" | "revoke" | "earn";

export interface IHypeTxn {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  /** + added, − spent */
  amount: number;
  balanceAfter: number;
  /** "earn": from the old ranks, before Hype could only be bought */
  kind: HypeTxnKind;
  /** what it was for, in plain words ("Fire frame, 30 days", "Bought 500 Hype") */
  note: string;
  /** the style for unlocks/renewals, the payment reference for purchases */
  ref: string | null;
  /** the admin who gave or took Hype */
  byId: Types.ObjectId | null;
  createdAt: Date;
}

const HypeTxnSchema = new Schema<IHypeTxn>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    kind: { type: String, enum: ["purchase", "unlock", "renew", "grant", "revoke", "earn"], required: true },
    note: { type: String, default: "", maxlength: 300 },
    ref: { type: String, default: null },
    byId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "pointtxns" },
);
HypeTxnSchema.index({ userId: 1, createdAt: -1 });
HypeTxnSchema.index({ kind: 1, createdAt: -1 });

export const HypeTxn: Model<IHypeTxn> = defineModel<IHypeTxn>("HypeTxn", HypeTxnSchema);

/** A Hype pack someone is paying for on Paystack (reference "kpt_…"). The Hype lands once it's paid. */
export interface IHypePurchase {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  packId: string;
  hype: number;
  /** naira */
  amount: number;
  currency: "NGN";
  reference: string;
  status: "pending" | "paid";
  paidAt: Date | null;
  createdAt: Date;
}

const HypePurchaseSchema = new Schema<IHypePurchase>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    packId: { type: String, required: true },
    hype: { type: Number, required: true, min: 1 },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "NGN" },
    reference: { type: String, required: true, unique: true },
    status: { type: String, enum: ["pending", "paid"], default: "pending" },
    paidAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "pointpurchases" },
);
HypePurchaseSchema.index({ status: 1, paidAt: -1 });
HypePurchaseSchema.index({ userId: 1, createdAt: -1 });

export const HypePurchase: Model<IHypePurchase> = defineModel<IHypePurchase>("HypePurchase", HypePurchaseSchema);

/**
 * One design someone may wear until `expiresAt` ("frame:fire"). Renewing pushes `expiresAt` on; when it passes
 * without renewing, the design comes off their profile and the row is marked ended.
 */
export interface IStyleUnlock {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  key: string;
  expiresAt: Date;
  autoRenew: boolean;
  /** "hype" paid for, "gift" when it was free (styles worn before unlocks existed, admin gifts) */
  source: "hype" | "gift";
  /** the "ends in 3 days" notice went out for this expiresAt */
  remindedFor: Date | null;
  /** it ran out and came off their profile (the row stays, so it's never handed out free again) */
  endedAt: Date | null;
  createdAt: Date;
}

const StyleUnlockSchema = new Schema<IStyleUnlock>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    key: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    autoRenew: { type: Boolean, default: false },
    source: { type: String, enum: ["hype", "gift"], default: "hype" },
    remindedFor: { type: Date, default: null },
    endedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
StyleUnlockSchema.index({ userId: 1, key: 1 }, { unique: true });
StyleUnlockSchema.index({ endedAt: 1, expiresAt: 1 });

export const StyleUnlock: Model<IStyleUnlock> = defineModel<IStyleUnlock>("StyleUnlock", StyleUnlockSchema);
