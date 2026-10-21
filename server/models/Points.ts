import { Schema, model, models, type Model, type Types } from "mongoose";

/**
 * Points bookkeeping. The balance itself lives on the user (`User.points`, changed only with atomic $inc);
 * every change also writes one PointTxn, so the history always explains the balance.
 */
export type PointTxnKind = "purchase" | "unlock" | "renew" | "grant" | "revoke" | "earn";

export interface IPointTxn {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  /** + added, − spent */
  amount: number;
  balanceAfter: number;
  kind: PointTxnKind;
  /** what it was for, in plain words ("Fire frame, 30 days", "Bought 500 points") */
  note: string;
  /** the style for unlocks/renewals, the payment reference for purchases */
  ref: string | null;
  /** the admin who gave or took points */
  byId: Types.ObjectId | null;
  createdAt: Date;
}

const PointTxnSchema = new Schema<IPointTxn>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    kind: { type: String, enum: ["purchase", "unlock", "renew", "grant", "revoke", "earn"], required: true },
    note: { type: String, default: "", maxlength: 300 },
    ref: { type: String, default: null },
    byId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
PointTxnSchema.index({ userId: 1, createdAt: -1 });
PointTxnSchema.index({ kind: 1, createdAt: -1 });

export const PointTxn: Model<IPointTxn> = (models.PointTxn as Model<IPointTxn>) || model<IPointTxn>("PointTxn", PointTxnSchema);

/** A points pack someone is paying for on Paystack (reference "kpt_…"). The points land once it's paid. */
export interface IPointPurchase {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  packId: string;
  points: number;
  /** naira */
  amount: number;
  currency: "NGN";
  reference: string;
  status: "pending" | "paid";
  paidAt: Date | null;
  createdAt: Date;
}

const PointPurchaseSchema = new Schema<IPointPurchase>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    packId: { type: String, required: true },
    points: { type: Number, required: true, min: 1 },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "NGN" },
    reference: { type: String, required: true, unique: true },
    status: { type: String, enum: ["pending", "paid"], default: "pending" },
    paidAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
PointPurchaseSchema.index({ status: 1, paidAt: -1 });
PointPurchaseSchema.index({ userId: 1, createdAt: -1 });

export const PointPurchase: Model<IPointPurchase> = (models.PointPurchase as Model<IPointPurchase>) || model<IPointPurchase>("PointPurchase", PointPurchaseSchema);

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
  /** "points" paid for, "gift" when it was free (styles worn before points existed, admin gifts) */
  source: "points" | "gift";
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
    source: { type: String, enum: ["points", "gift"], default: "points" },
    remindedFor: { type: Date, default: null },
    endedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
StyleUnlockSchema.index({ userId: 1, key: 1 }, { unique: true });
StyleUnlockSchema.index({ endedAt: 1, expiresAt: 1 });

export const StyleUnlock: Model<IStyleUnlock> = (models.StyleUnlock as Model<IStyleUnlock>) || model<IStyleUnlock>("StyleUnlock", StyleUnlockSchema);
