import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "./define";

/**
 * Someone's Lite or Pro subscription (lib/plans): one row per person, kept after it ends. The plan itself (and until
 * when) is copied onto the user (`User.plan`, `User.planUntil`), which is what everything checks; this row is the
 * Paystack side: which plan they pay for, the codes needed to cancel it, and how it's going.
 *  - "active": renews every month; "non_renewing": cancelled, runs to the end of the paid month;
 *  - "attention": the last renewal failed (Paystack retries); "ended": over.
 * `source` says how they got it: paying on Paystack, or free time (leftover Hype turned into Lite days, or a gift).
 */
export type SubscriptionStatus = "active" | "non_renewing" | "attention" | "ended";

export interface ISubscription {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  plan: "lite" | "pro";
  status: SubscriptionStatus;
  source: "paystack" | "hype" | "grant" | "store";
  currentPeriodEnd: Date;
  /** naira a month, when they signed up */
  amount: number;
  paystack: { customerCode: string | null; subscriptionCode: string | null; emailToken: string | null; planCode: string | null };
  cancelledAt: Date | null;
  /** Paystack references of the renewals already counted (the last few), so a resent webhook adds no extra month */
  renewalRefs?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    plan: { type: String, enum: ["lite", "pro"], required: true },
    status: { type: String, enum: ["active", "non_renewing", "attention", "ended"], default: "active" },
    source: { type: String, enum: ["paystack", "hype", "grant", "store"], default: "paystack" },
    currentPeriodEnd: { type: Date, required: true },
    amount: { type: Number, default: 0 },
    paystack: {
      customerCode: { type: String, default: null },
      subscriptionCode: { type: String, default: null },
      emailToken: { type: String, default: null },
      planCode: { type: String, default: null },
    },
    cancelledAt: { type: Date, default: null },
    renewalRefs: { type: [String], default: [] },
  },
  { timestamps: true },
);
SubscriptionSchema.index({ "paystack.subscriptionCode": 1 });
SubscriptionSchema.index({ "paystack.customerCode": 1 });

export const Subscription: Model<ISubscription> = defineModel<ISubscription>("Subscription", SubscriptionSchema);

/**
 * A checkout for a plan (reference "ksb_…"), so the first payment can be matched when it comes back (redirect or
 * webhook) and counted once.
 */
export interface ISubscriptionCheckout {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  plan: "lite" | "pro";
  amount: number;
  reference: string;
  status: "pending" | "paid";
  paidAt: Date | null;
  createdAt: Date;
}

const CheckoutSchema = new Schema<ISubscriptionCheckout>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    plan: { type: String, enum: ["lite", "pro"], required: true },
    amount: { type: Number, required: true },
    reference: { type: String, required: true, unique: true },
    status: { type: String, enum: ["pending", "paid"], default: "pending" },
    paidAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
CheckoutSchema.index({ userId: 1, createdAt: -1 });

export const SubscriptionCheckout: Model<ISubscriptionCheckout> = defineModel<ISubscriptionCheckout>("SubscriptionCheckout", CheckoutSchema);

/**
 * One line per klique someone starts, for "N a month" (deleting a klique doesn't give the start back). Gone after
 * two months by itself.
 */
export interface IKliqueStart {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  createdAt: Date;
}
const KliqueStartSchema = new Schema<IKliqueStart>({ userId: { type: Schema.Types.ObjectId, ref: "User", required: true }, createdAt: { type: Date, default: () => new Date() } });
KliqueStartSchema.index({ userId: 1, createdAt: -1 });
KliqueStartSchema.index({ createdAt: 1 }, { expireAfterSeconds: 62 * 24 * 60 * 60 });

export const KliqueStart: Model<IKliqueStart> = defineModel<IKliqueStart>("KliqueStart", KliqueStartSchema);

/** One Lite or Pro purchase from the phone app. The unique ref stops one store purchase counting twice. */
export interface IPlanStorePurchase {
  _id: Types.ObjectId;
  ref: string;
  userId: Types.ObjectId;
  plan: "lite" | "pro";
  platform: "apple" | "google";
  until: Date;
  createdAt: Date;
}
const PlanStorePurchaseSchema = new Schema<IPlanStorePurchase>(
  {
    ref: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    plan: { type: String, enum: ["lite", "pro"], required: true },
    platform: { type: String, enum: ["apple", "google"], required: true },
    until: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
export const PlanStorePurchase: Model<IPlanStorePurchase> = defineModel<IPlanStorePurchase>("PlanStorePurchase", PlanStorePurchaseSchema);
