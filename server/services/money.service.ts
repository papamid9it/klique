import "server-only";
import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import type { z } from "zod";
import { DEFAULT_MONEY_CONFIG, MAX_PAYMENT, MIN_PAYMENT, feeOf, moneyConfigOf, type MoneyConfig } from "@/lib/money";
import type { CommunityMoneyDTO, DonationButtonDTO, PaymentDTO, PayoutDTO } from "@/lib/types";
import { appUrl, paystackConfig } from "../env";
import { ApiError, badRequest, conflict, forbidden, notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import { AppSetting } from "../models/AppSetting";
import { Community, type ICommunity } from "../models/Community";
import { Event, type IEvent } from "../models/Event";
import { Membership } from "../models/Membership";
import { DonationButton, Payment, Payout, type IDonationButton, type IPayment, type IPayout, type PayoutBank } from "../models/Money";
import type { IUser } from "../models/User";
import { canViewEvent } from "../policies/access";
import { isSiteAdmin } from "../policies/hosting";
import { loadBriefs, GHOST } from "../serializers";
import type { donationButtonSchema, moneyConfigSchema, payoutRequestSchema } from "../validators/schemas";
import { sid } from "./helpers";
import { isKlique } from "./klique.service";
import { paystack } from "./promotions.service";
import { notify } from "./push.service";
import { resolveSpaceFor } from "./spaces.service";

/**
 * Money for communities (lib/money). Donations go to one of a community's donation buttons; contributions go toward
 * one of its events. Both are paid on Paystack, Klique keeps its fee (fixed per payment when it's made), and the rest
 * builds the community's balance. Its owner asks for a payout, which claims every paid payment not yet paid out; a
 * site admin sends the bank transfer and marks it paid. A contribution can be refunded (minus the fee) until then;
 * donations can't be refunded. The money only ever moves on Paystack's word: a payment counts once Paystack confirms
 * it in full (the redirect back, or the webhook), never because the browser says so.
 */

const CONFIG_KEY = "moneyConfig";
const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

export async function getMoneyConfig(): Promise<MoneyConfig> {
  const row = await AppSetting.findById(CONFIG_KEY).lean();
  return moneyConfigOf(row?.value ?? DEFAULT_MONEY_CONFIG);
}

export async function setMoneyConfig(input: z.infer<typeof moneyConfigSchema>): Promise<MoneyConfig> {
  const next = moneyConfigOf({ ...(await getMoneyConfig()), ...input });
  await AppSetting.updateOne({ _id: CONFIG_KEY }, { $set: { value: next } }, { upsert: true });
  return next;
}

/* ------------------------------ who may ------------------------------ */

const NO_MONEY_EXPLICIT = "Communities with explicit content can't take donations, contributions or payouts on Klique.";

async function managedCommunity(viewer: IUser, slug: string) {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (space.sub) throw notFound("Money lives in the community, not in a group.");
  if (!access.canManage && !isSiteAdmin(viewer)) throw forbidden("Only this community's owner and admins can do that.");
  if (isKlique(space.community)) throw forbidden("Klique itself doesn't take donations.");
  if (space.community.explicit) throw forbidden(NO_MONEY_EXPLICIT);
  return { community: space.community, access };
}

/* ------------------------------ shapes ------------------------------ */

const buttonDto = (b: IDonationButton): DonationButtonDTO => ({ id: sid(b._id), title: b.title, description: b.description, goal: b.goal ?? null, raised: b.raised, donors: b.donors, active: b.active });

async function paymentDtos(rows: IPayment[]): Promise<PaymentDTO[]> {
  const people = await loadBriefs(rows.map((r) => r.userId));
  const events = new Map((await Event.find({ _id: { $in: rows.map((r) => r.eventId).filter(Boolean) } }).select("title").lean<Pick<IEvent, "_id" | "title">[]>()).map((e) => [sid(e._id), e.title]));
  const buttons = new Map((await DonationButton.find({ _id: { $in: rows.map((r) => r.buttonId).filter(Boolean) } }).select("title").lean<Pick<IDonationButton, "_id" | "title">[]>()).map((b) => [sid(b._id), b.title]));
  return rows.map((r) => ({
    id: sid(r._id),
    kind: r.kind,
    user: people.get(sid(r.userId)) ?? GHOST,
    amount: r.amount,
    fee: r.fee,
    net: r.net,
    quantity: r.quantity,
    message: r.message,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    forTitle: r.eventId ? (events.get(sid(r.eventId)) ?? "An event") : r.buttonId ? (buttons.get(sid(r.buttonId)) ?? "Donation") : "Donation",
    eventId: r.eventId ? sid(r.eventId) : null,
    refundable: r.kind === "contribution" && r.status === "paid" && !r.payoutId,
  }));
}

const mask = (acct: string) => (acct.length > 4 ? `••••${acct.slice(-4)}` : acct);

async function payoutDtos(rows: IPayout[], full = false): Promise<PayoutDTO[]> {
  const people = full ? await loadBriefs(rows.map((r) => r.requestedById)) : new Map();
  const communities = full ? new Map((await Community.find({ _id: { $in: rows.map((r) => r.communityId) } }).select("slug name").lean<Pick<ICommunity, "_id" | "slug" | "name">[]>()).map((c) => [sid(c._id), c])) : new Map<string, Pick<ICommunity, "_id" | "slug" | "name">>();
  return rows.map((r) => ({
    id: sid(r._id),
    amount: r.amount,
    status: r.status,
    bank: { bankName: r.bank.bankName, accountName: r.bank.accountName, bankCode: r.bank.bankCode, accountNumber: full ? r.bank.accountNumber : mask(r.bank.accountNumber) },
    reference: r.reference,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt?.toISOString() ?? null,
    ...(full ? { community: (() => { const c = communities.get(sid(r.communityId)); return c ? { slug: c.slug, name: c.name } : { slug: "", name: "Deleted community" }; })(), requestedBy: people.get(sid(r.requestedById)) ?? GHOST } : {}),
  }));
}

/* ------------------------------ donation buttons ------------------------------ */

/** A community's active donation buttons, for anyone who can see the community. */
export async function listDonationButtons(viewer: IUser | null, slug: string): Promise<DonationButtonDTO[]> {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (space.sub || !access.canView || isKlique(space.community)) return [];
  const rows = await DonationButton.find({ communityId: space.community._id, active: true }).sort({ position: 1, createdAt: 1 }).lean<IDonationButton[]>();
  return rows.map(buttonDto);
}

export async function saveDonationButton(viewer: IUser, slug: string, input: z.infer<typeof donationButtonSchema>, id?: string): Promise<DonationButtonDTO> {
  const { community } = await managedCommunity(viewer, slug);
  const set = { title: input.title, description: input.description ?? "", goal: input.goal || null, active: input.active ?? true };
  if (id) {
    const b = await DonationButton.findOneAndUpdate({ _id: id, communityId: community._id }, { $set: set }, { returnDocument: "after" }).lean<IDonationButton>();
    if (!b) throw notFound("We couldn't find that button.");
    return buttonDto(b);
  }
  if ((await DonationButton.countDocuments({ communityId: community._id })) >= 6) throw badRequest("A community can have up to 6 donation buttons.");
  const position = (await DonationButton.countDocuments({ communityId: community._id })) + 1;
  const b = await DonationButton.create({ ...set, communityId: community._id, position });
  return buttonDto(b.toObject());
}

/** Removing a button that has had donations only hides it, so what was given stays on the record. */
export async function deleteDonationButton(viewer: IUser, slug: string, id: string) {
  const { community } = await managedCommunity(viewer, slug);
  const b = await DonationButton.findOne({ _id: id, communityId: community._id }).lean<IDonationButton>();
  if (!b) throw notFound("We couldn't find that button.");
  if (await Payment.exists({ buttonId: b._id, status: { $ne: "pending" } })) await DonationButton.updateOne({ _id: b._id }, { $set: { active: false } });
  else await DonationButton.deleteOne({ _id: b._id });
  return { deleted: true };
}

/* ------------------------------ paying ------------------------------ */

async function checkout(viewer: IUser, p: Pick<IPayment, "kind" | "communityId" | "buttonId" | "eventId" | "quantity" | "amount" | "message">, back: string): Promise<{ authorizationUrl: string; reference: string }> {
  if (!paystackConfig()) throw badRequest("Card payments aren't switched on yet.");
  // no money moves for a community with explicit content (our payment provider doesn't allow adult content)
  if (p.communityId && (await Community.exists({ _id: p.communityId, explicit: true }))) throw forbidden(NO_MONEY_EXPLICIT);
  if (p.amount < MIN_PAYMENT || p.amount > MAX_PAYMENT) throw badRequest(`Pick an amount between ${naira(MIN_PAYMENT)} and ${naira(MAX_PAYMENT)}.`);
  rateLimit(`pay:${sid(viewer._id)}`, 20, 60 * 60 * 1000);
  const config = await getMoneyConfig();
  const feePercent = p.kind === "donation" ? config.donationFeePercent : config.contributionFeePercent;
  const fee = feeOf(p.amount, feePercent);
  const reference = `${p.kind === "donation" ? "kdn" : "kct"}_${randomBytes(9).toString("hex")}`;
  await Payment.create({ ...p, userId: viewer._id, feePercent, fee, net: p.amount - fee, reference });
  const callback = `${appUrl()}${back}${back.includes("?") ? "&" : "?"}payment=${reference}`;
  const data = await paystack<{ authorization_url: string }>("/transaction/initialize", {
    method: "POST",
    body: { email: viewer.email, amount: p.amount * 100, currency: "NGN", reference, callback_url: callback, metadata: { purpose: p.kind, cancel_action: `${appUrl()}${back}` } },
  });
  return { authorizationUrl: data.authorization_url, reference };
}

/** Start a donation to one of a community's buttons. They agree no refunds first (the form asks). */
export async function startDonation(viewer: IUser, slug: string, buttonId: string, input: { amount: number; message?: string }) {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (space.sub || !access.canView || isKlique(space.community)) throw notFound("We couldn't find that community.");
  const b = Types.ObjectId.isValid(buttonId) ? await DonationButton.findOne({ _id: buttonId, communityId: space.community._id, active: true }).lean<IDonationButton>() : null;
  if (!b) throw notFound("That donation button isn't there any more.");
  return checkout(viewer, { kind: "donation", communityId: space.community._id, buttonId: b._id, eventId: null, quantity: 1, amount: Math.round(input.amount), message: (input.message ?? "").trim().slice(0, 200) }, `/communities/${space.community.slug}`);
}

/** Start a contribution toward an event: `quantity` units at its price, up to its maximum. */
export async function startContribution(viewer: IUser, eventId: string, quantity: number) {
  const e = Types.ObjectId.isValid(eventId) ? await Event.findById(eventId).lean<IEvent>() : null;
  if (!e || !(await canViewEvent(e, viewer))) throw notFound("We couldn't find that event.");
  if (!e.contribution || !e.communityId) throw badRequest("This event doesn't take contributions.");
  if (e.review || e.cancelled) throw conflict("This event isn't taking contributions.");
  if ((e.endsAt ?? e.startsAt) < new Date(Date.now() - 24 * 60 * 60 * 1000)) throw conflict("This event has already happened.");
  const q = Math.round(quantity);
  if (q < 1 || q > e.contribution.maxQuantity) throw badRequest(`Pick between 1 and ${e.contribution.maxQuantity}.`);
  return checkout(viewer, { kind: "contribution", communityId: e.communityId, buttonId: null, eventId: e._id, quantity: q, amount: q * e.contribution.unitPrice, message: "" }, `/events/${sid(e._id)}`);
}

/** Count a payment once Paystack says it's paid in full (the webhook and the redirect can both arrive: only the first counts). */
async function settle(p: IPayment, paidAt: Date): Promise<boolean> {
  const claimed = await Payment.findOneAndUpdate({ _id: p._id, status: "pending" }, { $set: { status: "paid", paidAt } }, { returnDocument: "after" }).lean<IPayment>();
  if (!claimed) return false;
  if (claimed.buttonId) await DonationButton.updateOne({ _id: claimed.buttonId }, { $inc: { raised: claimed.amount, donors: 1 } });
  const community = await Community.findById(claimed.communityId).select("name slug").lean<Pick<ICommunity, "name" | "slug">>();
  const what = claimed.kind === "donation" ? "donation" : "contribution";
  // the people who run it hear about money coming in, bundled
  const staff = await Membership.find({ communityId: claimed.communityId, subcommunityId: null, status: "active", role: { $in: ["owner", "admin"] } }).select("userId").lean<{ userId: Types.ObjectId }[]>();
  notify(
    staff.map((m) => m.userId).filter((id) => sid(id) !== sid(claimed.userId)),
    { title: `${naira(claimed.amount)} ${what} to ${community?.name ?? "your community"}`, body: claimed.message ? `"${claimed.message}"` : `${naira(claimed.net)} after Klique's fee.`, data: { href: `/communities/${community?.slug}?view=dashboard` } },
    { actorId: claimed.userId, category: "admin", groupKey: `money:${sid(claimed.communityId)}`, many: (n) => `${n} payments to ${community?.name ?? "your community"}`, ref: `money:${sid(claimed.communityId)}` },
  );
  notify([claimed.userId], { title: `Thank you for your ${what}`, body: `${naira(claimed.amount)} to ${community?.name ?? "the community"}. Reference ${claimed.reference}.`, data: { href: claimed.eventId ? `/events/${sid(claimed.eventId)}` : `/communities/${community?.slug}` } }, { category: "community", ref: `receipt:${claimed.reference}` });
  return true;
}

/** Paystack's answer for a checkout (redirect or webhook): count it if it's fully paid in naira. */
export async function fulfilPayment(reference: string, paid: { status: string; amount: number; currency: string; paid_at?: string }) {
  const p = await Payment.findOne({ reference }).lean<IPayment>();
  if (!p || paid.status !== "success") return;
  if (paid.currency !== "NGN" || paid.amount < p.amount * 100) {
    console.warn("[money] amount mismatch", reference, paid.amount, p.amount * 100);
    return;
  }
  await settle(p, paid.paid_at ? new Date(paid.paid_at) : new Date());
}

/** Back from Paystack: check with Paystack directly (never trust the redirect alone). */
export async function verifyPayment(viewer: IUser, reference: string): Promise<{ paid: boolean; kind: IPayment["kind"]; amount: number }> {
  const p = await Payment.findOne({ reference }).lean<IPayment>();
  if (!p || sid(p.userId) !== sid(viewer._id)) throw notFound("We couldn't find that payment.");
  if (p.status === "pending") {
    const data = await paystack<{ status: string; amount: number; currency: string; paid_at?: string }>(`/transaction/verify/${encodeURIComponent(reference)}`);
    await fulfilPayment(reference, data);
  }
  const now = await Payment.findById(p._id).select("status").lean<Pick<IPayment, "status">>();
  return { paid: now?.status === "paid", kind: p.kind, amount: p.amount };
}

/* ------------------------------ contributions on an event ------------------------------ */

/** Who has chipped in toward an event, for its host and the community's owners and admins. */
export async function eventContributions(viewer: IUser, eventId: string): Promise<PaymentDTO[]> {
  const e = await Event.findById(eventId).lean<IEvent>();
  if (!e || !e.communityId) throw notFound("We couldn't find that event.");
  await assertMoneyAdmin(viewer, e);
  const rows = await Payment.find({ eventId: e._id, status: { $in: ["paid", "refunded"] } }).sort({ createdAt: -1 }).limit(500).lean<IPayment[]>();
  return paymentDtos(rows);
}

async function assertMoneyAdmin(viewer: IUser, e: Pick<IEvent, "hostId" | "communityId">) {
  if (sid(e.hostId) === sid(viewer._id) || isSiteAdmin(viewer)) return;
  const m = await Membership.findOne({ userId: viewer._id, communityId: e.communityId, subcommunityId: null, status: "active", role: { $in: ["owner", "admin"] } }).lean();
  if (!m) throw forbidden("Only the event's host and the community's owner and admins can see that.");
}

/**
 * Refund a contribution, minus Klique's fee, while it's still in the community's balance (not claimed by a payout).
 * Paystack sends it back to their card.
 */
export async function refundContribution(viewer: IUser, paymentId: string): Promise<PaymentDTO> {
  const p = Types.ObjectId.isValid(paymentId) ? await Payment.findById(paymentId).lean<IPayment>() : null;
  if (!p || p.kind !== "contribution" || !p.eventId) throw notFound("We couldn't find that contribution.");
  const e = await Event.findById(p.eventId).select("hostId communityId title").lean<Pick<IEvent, "_id" | "hostId" | "communityId" | "title">>();
  if (!e) throw notFound("We couldn't find that event.");
  await assertMoneyAdmin(viewer, e);
  if (p.status !== "paid") throw conflict(p.status === "refunded" ? "This was already refunded." : "This hasn't been paid.");
  if (p.payoutId) throw conflict("This money has already been requested as a payout, so it can't be refunded.");
  const back = p.amount - p.fee;
  // claim it first, so two clicks can't refund twice; undone if Paystack refuses
  const claimed = await Payment.updateOne({ _id: p._id, status: "paid", payoutId: null }, { $set: { status: "refunded", refundedAt: new Date(), refundAmount: back } });
  if (!claimed.modifiedCount) throw conflict("This contribution changed just now. Try again.");
  try {
    if (back > 0) await paystack("/refund", { method: "POST", body: { transaction: p.reference, amount: back * 100, merchant_note: "Klique contribution refund (minus fee)" } });
  } catch (err) {
    await Payment.updateOne({ _id: p._id }, { $set: { status: "paid", refundedAt: null, refundAmount: 0 } });
    throw err;
  }
  notify([p.userId], { title: `Your contribution was refunded`, body: `${naira(back)} is on its way back to your card (${naira(p.amount)} minus Klique's ${naira(p.fee)} fee), for ${e.title}.`, data: { href: `/events/${sid(e._id)}` } }, { category: "community", ref: `refund:${p.reference}` });
  return (await paymentDtos([{ ...p, status: "refunded", refundAmount: back }]))[0];
}

/* ------------------------------ balance and payouts ------------------------------ */

async function balanceOf(communityId: Types.ObjectId) {
  const rows = await Payment.aggregate<{ _id: string; net: number }>([
    { $match: { communityId, status: "paid" } },
    { $lookup: { from: "payouts", localField: "payoutId", foreignField: "_id", as: "payout" } },
    { $group: { _id: { $ifNull: [{ $arrayElemAt: ["$payout.status", 0] }, "none"] }, net: { $sum: "$net" } } },
  ]);
  const by = new Map(rows.map((r) => [r._id, r.net]));
  return { available: (by.get("none") ?? 0) + (by.get("rejected") ?? 0), requested: by.get("requested") ?? 0, paidOut: by.get("paid") ?? 0 };
}

/** The community's money, for its owner and admins: balance, buttons, recent payments, payouts. */
export async function communityMoney(viewer: IUser, slug: string): Promise<CommunityMoneyDTO> {
  const { community, access } = await managedCommunity(viewer, slug);
  const config = await getMoneyConfig();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [balance, totals, last30, buttons, recent, payouts] = await Promise.all([
    balanceOf(community._id),
    Payment.aggregate<{ _id: string; n: number }>([{ $match: { communityId: community._id, status: "paid" } }, { $group: { _id: "$kind", n: { $sum: "$amount" } } }]),
    Payment.aggregate<{ n: number }>([{ $match: { communityId: community._id, status: "paid", paidAt: { $gte: since } } }, { $group: { _id: null, n: { $sum: "$amount" } } }]),
    DonationButton.find({ communityId: community._id }).sort({ position: 1, createdAt: 1 }).lean<IDonationButton[]>(),
    Payment.find({ communityId: community._id, status: { $in: ["paid", "refunded"] } }).sort({ createdAt: -1 }).limit(30).lean<IPayment[]>(),
    Payout.find({ communityId: community._id }).sort({ createdAt: -1 }).limit(20).lean<IPayout[]>(),
  ]);
  const t = new Map(totals.map((x) => [x._id, x.n]));
  const bank = community.payoutBank;
  return {
    fees: { donationPercent: config.donationFeePercent, contributionPercent: config.contributionFeePercent },
    minPayout: config.minPayout,
    ...balance,
    totals: { donations: t.get("donation") ?? 0, contributions: t.get("contribution") ?? 0, last30: last30[0]?.n ?? 0 },
    buttons: buttons.map(buttonDto),
    recent: await paymentDtos(recent),
    payouts: await payoutDtos(payouts),
    bank: bank ? { bankName: bank.bankName, accountName: bank.accountName, bankCode: bank.bankCode, accountNumber: mask(bank.accountNumber) } : null,
    canTakePayments: !!paystackConfig(),
    canRequestPayout: access.role === "owner",
  };
}

/** Nigerian banks for the payout form (from Paystack; empty when payments aren't set up). Cached for a day. */
let banksCache: { at: number; list: { code: string; name: string }[] } | null = null;
export async function listBanks(): Promise<{ code: string; name: string }[]> {
  if (!paystackConfig()) return [];
  if (banksCache && Date.now() - banksCache.at < 24 * 60 * 60 * 1000) return banksCache.list;
  const rows = await paystack<{ code: string; name: string; active?: boolean }[]>("/bank?country=nigeria&perPage=200");
  const list = rows.filter((b) => b.active !== false).map((b) => ({ code: b.code, name: b.name }));
  banksCache = { at: Date.now(), list };
  return list;
}

/**
 * The owner asks for everything in the balance to be paid to a bank account. With Paystack set up the account
 * name comes from the bank itself (so a typo can't send money to a stranger). One request at a time.
 */
export async function requestPayout(viewer: IUser, slug: string, input: z.infer<typeof payoutRequestSchema>): Promise<CommunityMoneyDTO> {
  const { community, access } = await managedCommunity(viewer, slug);
  if (access.role !== "owner") throw forbidden("Only the community's owner can ask for a payout.");
  rateLimit(`payout:${sid(community._id)}`, 5, 24 * 60 * 60 * 1000);
  if (await Payout.exists({ communityId: community._id, status: "requested" })) throw conflict("There's already a payout waiting. You can ask again once it's paid.");
  const config = await getMoneyConfig();

  let bank: PayoutBank;
  const saved = community.payoutBank;
  if (input.useSaved && saved) bank = saved;
  else {
    if (!input.accountNumber || !/^\d{10}$/.test(input.accountNumber)) throw new ApiError(422, "Enter the 10-digit account number.", { errors: { accountNumber: "10 digits" } });
    if (!input.bankName) throw new ApiError(422, "Pick the bank.", { errors: { bankCode: "Required" } });
    let accountName = (input.accountName ?? "").trim();
    if (paystackConfig() && input.bankCode) {
      const r = await paystack<{ account_name: string }>(`/bank/resolve?account_number=${input.accountNumber}&bank_code=${encodeURIComponent(input.bankCode)}`).catch(() => null);
      if (!r) throw new ApiError(422, "That account number doesn't match the bank. Check both.", { errors: { accountNumber: "Not found at this bank" } });
      accountName = r.account_name;
    }
    if (!accountName) throw new ApiError(422, "Enter the name on the account.", { errors: { accountName: "Required" } });
    bank = { bankCode: input.bankCode ?? "", bankName: input.bankName, accountNumber: input.accountNumber, accountName };
    await Community.updateOne({ _id: community._id }, { $set: { payoutBank: bank } });
  }

  // claim every paid payment not paid out yet (and those a turned-down payout let go)
  const releasable = await Payout.find({ communityId: community._id, status: "rejected" }).distinct("_id");
  const eligible = await Payment.find({ communityId: community._id, status: "paid", $or: [{ payoutId: null }, { payoutId: { $in: releasable } }] }).select("_id net").lean<Pick<IPayment, "_id" | "net">[]>();
  const amount = eligible.reduce((t, p) => t + p.net, 0);
  if (amount < config.minPayout) throw badRequest(`The smallest payout is ${naira(config.minPayout)}. There's ${naira(amount)} so far.`);
  const payout = await Payout.create({ communityId: community._id, requestedById: viewer._id, amount, bank });
  await Payment.updateMany({ _id: { $in: eligible.map((p) => p._id) } }, { $set: { payoutId: payout._id } });
  return communityMoney(viewer, slug);
}

/* ------------------------------ site admins ------------------------------ */

export async function adminPayouts(status: IPayout["status"] | "all"): Promise<PayoutDTO[]> {
  const rows = await Payout.find(status === "all" ? {} : { status }).sort({ createdAt: status === "requested" ? 1 : -1 }).limit(200).lean<IPayout[]>();
  return payoutDtos(rows, true);
}

/** A site admin sent the transfer (and notes its reference), or turns the request down (its payments go back to the balance). */
export async function decidePayout(admin: IUser, id: string, decision: "paid" | "rejected", input: { reference?: string; note?: string }): Promise<PayoutDTO> {
  const p = Types.ObjectId.isValid(id) ? await Payout.findById(id).lean<IPayout>() : null;
  if (!p) throw notFound("We couldn't find that payout.");
  if (p.status !== "requested") throw conflict(`This payout was already ${p.status === "paid" ? "paid" : "turned down"}.`);
  if (decision === "paid" && !input.reference?.trim()) throw new ApiError(422, "Add the transfer reference.", { errors: { reference: "Required" } });
  if (decision === "rejected" && !input.note?.trim()) throw new ApiError(422, "Say why, so the owner can fix it.", { errors: { note: "Required" } });
  const done = await Payout.findOneAndUpdate({ _id: p._id, status: "requested" }, { $set: { status: decision, reference: input.reference?.trim() ?? "", note: input.note?.trim() ?? "", decidedById: admin._id, decidedAt: new Date() } }, { returnDocument: "after" }).lean<IPayout>();
  if (!done) throw conflict("Someone else just decided on this payout.");
  if (decision === "rejected") await Payment.updateMany({ payoutId: p._id }, { $set: { payoutId: null } });
  const c = await Community.findById(p.communityId).select("slug name").lean<Pick<ICommunity, "slug" | "name">>();
  notify(
    [p.requestedById],
    decision === "paid"
      ? { title: `${naira(p.amount)} paid out to ${p.bank.bankName}`, body: `For ${c?.name ?? "your community"}. Transfer reference ${done.reference}.`, data: { href: `/communities/${c?.slug}?view=dashboard` } }
      : { title: `Your payout for ${c?.name ?? "your community"} was turned down`, body: done.note, data: { href: `/communities/${c?.slug}?view=dashboard` } },
    { actorId: admin._id, category: "admin", ref: `payout:${sid(p._id)}` },
  );
  return (await payoutDtos([done], true))[0];
}
