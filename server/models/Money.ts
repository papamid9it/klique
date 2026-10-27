import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "./define";

/**
 * Money that flows to a community through Paystack (lib/money): donations to one of its donation buttons, and
 * contributions toward an event. Klique keeps a fee (set by a site admin) and the rest is the community's, paid out
 * to its owner's bank on request. All amounts are whole naira.
 */

/** A "Donate" button on a community, with an optional goal. `raised` and `donors` count paid donations. */
export interface IDonationButton {
  _id: Types.ObjectId;
  communityId: Types.ObjectId;
  title: string;
  description: string;
  /** naira; null: no goal, no progress bar */
  goal: number | null;
  raised: number;
  donors: number;
  active: boolean;
  position: number;
  createdAt: Date;
}

const DonationButtonSchema = new Schema<IDonationButton>(
  {
    communityId: { type: Schema.Types.ObjectId, ref: "Community", required: true },
    title: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, default: "", maxlength: 300 },
    goal: { type: Number, default: null, min: 1 },
    raised: { type: Number, default: 0, min: 0 },
    donors: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
    position: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
DonationButtonSchema.index({ communityId: 1, position: 1 });

export const DonationButton: Model<IDonationButton> = defineModel<IDonationButton>("DonationButton", DonationButtonSchema);

/**
 * One payment: a donation ("kdn_…") or an event contribution ("kct_…"). The fee is fixed when it's made, so later
 * fee changes never touch it. Once a payout claims it (`payoutId`) it can no longer be refunded.
 */
export interface IPayment {
  _id: Types.ObjectId;
  kind: "donation" | "contribution";
  communityId: Types.ObjectId;
  buttonId: Types.ObjectId | null;
  eventId: Types.ObjectId | null;
  userId: Types.ObjectId;
  /** contributions: how many units at the event's unit price */
  quantity: number;
  /** what the person paid */
  amount: number;
  feePercent: number;
  fee: number;
  /** amount − fee: the community's */
  net: number;
  message: string;
  reference: string;
  status: "pending" | "paid" | "refunded";
  paidAt: Date | null;
  refundedAt: Date | null;
  /** what went back to them (amount − fee) */
  refundAmount: number;
  payoutId: Types.ObjectId | null;
  createdAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    kind: { type: String, enum: ["donation", "contribution"], required: true },
    communityId: { type: Schema.Types.ObjectId, ref: "Community", required: true },
    buttonId: { type: Schema.Types.ObjectId, ref: "DonationButton", default: null },
    eventId: { type: Schema.Types.ObjectId, ref: "Event", default: null },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    quantity: { type: Number, default: 1, min: 1 },
    amount: { type: Number, required: true, min: 1 },
    feePercent: { type: Number, required: true, min: 0 },
    fee: { type: Number, required: true, min: 0 },
    net: { type: Number, required: true, min: 0 },
    message: { type: String, default: "", maxlength: 200 },
    reference: { type: String, required: true, unique: true },
    status: { type: String, enum: ["pending", "paid", "refunded"], default: "pending" },
    paidAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },
    refundAmount: { type: Number, default: 0 },
    payoutId: { type: Schema.Types.ObjectId, ref: "Payout", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
PaymentSchema.index({ communityId: 1, status: 1, payoutId: 1 });
PaymentSchema.index({ eventId: 1, status: 1 });
PaymentSchema.index({ userId: 1, createdAt: -1 });
PaymentSchema.index({ communityId: 1, createdAt: -1 });

export const Payment: Model<IPayment> = defineModel<IPayment>("Payment", PaymentSchema);

export interface PayoutBank {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
}

/**
 * A community owner asking for the community's money. It claims every paid payment not yet paid out; a site admin
 * sends the transfer and marks it paid (or turns it down, which releases those payments again).
 */
export interface IPayout {
  _id: Types.ObjectId;
  communityId: Types.ObjectId;
  requestedById: Types.ObjectId;
  amount: number;
  bank: PayoutBank;
  status: "requested" | "paid" | "rejected";
  /** the bank transfer's reference, once paid */
  reference: string;
  note: string;
  decidedById: Types.ObjectId | null;
  decidedAt: Date | null;
  createdAt: Date;
}

const bankSchema = new Schema<PayoutBank>({ bankCode: { type: String, default: "" }, bankName: { type: String, required: true, maxlength: 80 }, accountNumber: { type: String, required: true, maxlength: 20 }, accountName: { type: String, required: true, maxlength: 120 } }, { _id: false });

const PayoutSchema = new Schema<IPayout>(
  {
    communityId: { type: Schema.Types.ObjectId, ref: "Community", required: true },
    requestedById: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true, min: 1 },
    bank: { type: bankSchema, required: true },
    status: { type: String, enum: ["requested", "paid", "rejected"], default: "requested" },
    reference: { type: String, default: "", maxlength: 120 },
    note: { type: String, default: "", maxlength: 300 },
    decidedById: { type: Schema.Types.ObjectId, ref: "User", default: null },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
PayoutSchema.index({ communityId: 1, createdAt: -1 });
PayoutSchema.index({ status: 1, createdAt: 1 });

export const Payout: Model<IPayout> = defineModel<IPayout>("Payout", PayoutSchema);
