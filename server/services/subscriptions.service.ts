import "server-only";
import { randomBytes } from "node:crypto";
import type { Types } from "mongoose";
import type { z } from "zod";
import { PLAN_NAMES, PLAN_STORE_PRODUCTS, activePlan, planAfterPurchase, planConfigOf, planFromStoreProduct, type PaidPlan, type PlanConfig, type PlanId } from "@/lib/plans";
import type { SubscriptionDTO } from "@/lib/types";
import { appUrl, paystackConfig } from "../env";
import { ApiError, badRequest, notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import { AppSetting } from "../models/AppSetting";
import { CrewMember } from "../models/Crew";
import { KliqueStart, PlanStorePurchase, Subscription, SubscriptionCheckout, type ISubscription, type ISubscriptionCheckout } from "../models/Subscription";
import { User, type IUser } from "../models/User";
import { isSiteAdmin } from "../policies/hosting";
import type { adStoreVerifySchema, planConfigSchema } from "../validators/schemas";
import { sid } from "./helpers";
import { paystack } from "./promotions.service";
import { notify } from "./push.service";
import { appleSale, googleSale, planStoreToken, storeBillingStatus, testSalesAllowed } from "./store-billing.service";

/**
 * Lite and Pro (lib/plans), paid monthly through Paystack subscriptions:
 *  - Checkout: a Paystack plan per paid plan and price (made the first time it's needed, and again when an admin
 *    changes the price), then a checkout with reference "ksb_…". The first payment (redirect or webhook, whichever
 *    comes first, counted once) turns the plan on for a month.
 *  - Paystack charges the card every month by itself: each renewal's charge.success adds another month. A failed
 *    renewal marks it "attention" (Paystack retries); cancelling (here or on Paystack) stops renewals, and the plan
 *    lasts to the end of the month already paid.
 *  - Free time (leftover Hype turned into Lite days, or an admin's gift) adds days without Paystack.
 * What counts everywhere is `User.plan` + `User.planUntil` (activePlan); the Subscription row is the bookkeeping.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** a paid month, plus a day's grace so a renewal that lands a little late doesn't drop anyone to Free */
const MONTH_MS = 30 * DAY_MS;
const GRACE_MS = DAY_MS;
const CONFIG_KEY = "planConfig";
const PAYSTACK_PLANS_KEY = "paystackPlans";

/* ------------------------------ settings ------------------------------ */

export async function getPlanConfig(): Promise<PlanConfig> {
  const row = await AppSetting.findById(CONFIG_KEY).lean();
  return planConfigOf(row?.value);
}

export async function setPlanConfig(input: z.infer<typeof planConfigSchema>): Promise<PlanConfig> {
  const now = await getPlanConfig();
  const next = planConfigOf({
    prices: { ...now.prices, ...(input.prices ?? {}) },
    create: { ...now.create, ...(input.create ?? {}) },
    join: { ...now.join, ...(input.join ?? {}) },
    mediaSlots: { ...now.mediaSlots, ...(input.mediaSlots ?? {}) },
    communitiesCreate: { ...now.communitiesCreate, ...(input.communitiesCreate ?? {}) },
    communitiesJoin: { ...now.communitiesJoin, ...(input.communitiesJoin ?? {}) },
    groupsCreate: { ...now.groupsCreate, ...(input.groupsCreate ?? {}) },
    webhooks: { ...now.webhooks, ...(input.webhooks ?? {}) },
    emojiSlots: { ...now.emojiSlots, ...(input.emojiSlots ?? {}) },
  });
  await AppSetting.updateOne({ _id: CONFIG_KEY }, { $set: { value: next } }, { upsert: true });
  return next;
}

/** The plan this person is on right now (site admins count as Pro). */
export const planOf = (u: Pick<IUser, "plan" | "planUntil" | "email">): PlanId => (isSiteAdmin(u) ? "pro" : activePlan(u));

/* ------------------------------ usage ------------------------------ */

/** The start of this calendar month in Lagos (UTC+1). */
function monthStart(now = new Date()): Date {
  const lagos = new Date(+now + 3600_000);
  return new Date(Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), 1) - 3600_000);
}

/** Kliques started this month, and kliques they're in right now (not hosting; waiting requests count). */
export async function kliqueUsage(userId: Types.ObjectId): Promise<{ started: number; inNow: number }> {
  const [started, inNow] = await Promise.all([
    KliqueStart.countDocuments({ userId, createdAt: { $gte: monthStart() } }),
    CrewMember.countDocuments({ userId, role: "member", expiresAt: { $gt: new Date() } }),
  ]);
  return { started, inNow };
}

/** Note a klique start (for the monthly limit). */
export async function noteKliqueStart(userId: Types.ObjectId) {
  await KliqueStart.create({ userId });
}

/** Pro hosts among these, for the small boost in "Kliques for you". */
export async function proHosts(hostIds: Types.ObjectId[]): Promise<Set<string>> {
  if (!hostIds.length) return new Set();
  const rows = await User.find({ _id: { $in: hostIds }, plan: "pro", planUntil: { $gt: new Date() } }).select("_id").lean<{ _id: Types.ObjectId }[]>();
  return new Set(rows.map((r) => sid(r._id)));
}

/* ------------------------------ the person's view ------------------------------ */

export async function mySubscription(viewer: IUser): Promise<SubscriptionDTO> {
  const [config, row, usage, me] = await Promise.all([getPlanConfig(), Subscription.findOne({ userId: viewer._id }).lean<ISubscription>(), kliqueUsage(viewer._id), User.findById(viewer._id).select("plan planUntil email").lean<Pick<IUser, "plan" | "planUntil" | "email">>()]);
  const plan = me ? planOf(me) : "free";
  const paid = plan !== "free" && !isSiteAdmin(viewer);
  return {
    plan,
    until: paid && me?.planUntil ? me.planUntil.toISOString() : null,
    status: paid ? (row?.status ?? "active") : null,
    source: paid ? (row?.source ?? null) : null,
    renews: paid && row?.source === "paystack" && (row.status === "active" || row.status === "attention"),
    siteAdmin: isSiteAdmin(viewer),
    canBuy: !!paystackConfig(),
    store: { ...storeBillingStatus(), products: PLAN_STORE_PRODUCTS, accountToken: planStoreToken(sid(viewer._id)) },
    config,
    usage,
  };
}

/* ------------------------------ Paystack plans ------------------------------ */

type PlanCodes = Partial<Record<PaidPlan, { code: string; amount: number }>>;

/** The Paystack plan for this plan at this price, made if there isn't one yet (a new price gets a new plan). */
async function paystackPlanCode(plan: PaidPlan, amount: number): Promise<string> {
  const row = await AppSetting.findById(PAYSTACK_PLANS_KEY).lean();
  const codes = (row?.value ?? {}) as PlanCodes;
  const have = codes[plan];
  if (have && have.amount === amount) return have.code;
  const made = await paystack<{ plan_code: string }>("/plan", { method: "POST", body: { name: `Klique ${PLAN_NAMES[plan]} (₦${amount.toLocaleString("en-NG")}/month)`, interval: "monthly", amount: amount * 100, currency: "NGN" } });
  await AppSetting.updateOne({ _id: PAYSTACK_PLANS_KEY }, { $set: { [`value.${plan}`]: { code: made.plan_code, amount } } }, { upsert: true });
  return made.plan_code;
}

async function ourPlanByCode(code: string | null | undefined): Promise<PaidPlan | null> {
  if (!code) return null;
  const row = await AppSetting.findById(PAYSTACK_PLANS_KEY).lean();
  const codes = (row?.value ?? {}) as PlanCodes;
  // an older price's plan still renews people who signed up at it: look in the history too
  const hist = ((await AppSetting.findById(`${PAYSTACK_PLANS_KEY}:history`).lean())?.value ?? {}) as Record<string, PaidPlan>;
  for (const p of ["lite", "pro"] as const) if (codes[p]?.code === code) return p;
  return hist[code] ?? null;
}

/** Remember every plan code we ever made (renewals of an old price must still be recognised). */
async function rememberPlanCode(code: string, plan: PaidPlan) {
  await AppSetting.updateOne({ _id: `${PAYSTACK_PLANS_KEY}:history` }, { $set: { [`value.${code}`]: plan } }, { upsert: true });
}

/* ------------------------------ checkout ------------------------------ */

/** Start paying for Lite or Pro: a Paystack checkout the browser goes to. */
export async function startCheckout(viewer: IUser, plan: PaidPlan): Promise<{ authorizationUrl: string; reference: string }> {
  if (!paystackConfig()) throw badRequest("Subscriptions aren't set up yet.");
  if (isSiteAdmin(viewer)) throw badRequest("Site admins have every plan free.");
  const current = planOf(viewer);
  const row = await Subscription.findOne({ userId: viewer._id }).lean<ISubscription>();
  if (current === plan && row?.source === "paystack" && row.status === "active") throw badRequest(`You're already on ${PLAN_NAMES[plan]}.`);
  rateLimit(`sub-checkout:${sid(viewer._id)}`, 15, 60 * 60_000);
  const config = await getPlanConfig();
  const amount = config.prices[plan];
  const planCode = await paystackPlanCode(plan, amount);
  await rememberPlanCode(planCode, plan);
  const reference = `ksb_${randomBytes(9).toString("hex")}`;
  await SubscriptionCheckout.create({ userId: viewer._id, plan, amount, reference });
  const back = `${appUrl()}/settings?tab=plan`;
  const data = await paystack<{ authorization_url: string }>("/transaction/initialize", {
    method: "POST",
    body: { email: viewer.email, amount: amount * 100, currency: "NGN", plan: planCode, reference, callback_url: back, metadata: { purpose: "subscription", plan, cancel_action: back } },
  });
  return { authorizationUrl: data.authorization_url, reference };
}

type Paid = { status: string; amount: number; currency: string; paid_at?: string; customer?: { customer_code?: string; email?: string } };

/** The first payment of a checkout: turn the plan on (once, whichever of the redirect and the webhook comes first). */
export async function fulfilCheckout(reference: string, paid: Paid) {
  const c = await SubscriptionCheckout.findOne({ reference }).lean<ISubscriptionCheckout>();
  if (!c || paid.status !== "success") return;
  if (paid.currency !== "NGN" || paid.amount < c.amount * 100) {
    console.warn("[plans] amount mismatch", reference, paid.amount, c.amount * 100);
    return;
  }
  const claimed = await SubscriptionCheckout.findOneAndUpdate({ _id: c._id, status: "pending" }, { $set: { status: "paid", paidAt: new Date() } }).lean();
  if (!claimed) return;
  const before = await Subscription.findOne({ userId: c.userId }).lean<ISubscription>();
  const paidAt = paid.paid_at ? new Date(paid.paid_at) : new Date();
  const until = new Date(+paidAt + MONTH_MS + GRACE_MS);
  await User.updateOne({ _id: c.userId }, { $set: { plan: c.plan, planUntil: until } });
  await Subscription.updateOne(
    { userId: c.userId },
    {
      // the new subscription's own codes arrive with Paystack's subscription.create
      $set: { plan: c.plan, status: "active", source: "paystack", currentPeriodEnd: until, amount: c.amount, cancelledAt: null, "paystack.customerCode": paid.customer?.customer_code ?? before?.paystack?.customerCode ?? null },
    },
    { upsert: true },
  );
  // switching plan: stop the old one renewing (its codes are still on the row until subscription.create replaces them)
  if (before?.source === "paystack" && before.plan !== c.plan && before.paystack?.subscriptionCode && before.paystack.emailToken) {
    await paystack("/subscription/disable", { method: "POST", body: { code: before.paystack.subscriptionCode, token: before.paystack.emailToken } }).catch((e) => console.warn("[plans] couldn't stop the old subscription:", (e as Error).message));
  }
  notify([c.userId], { title: `You're on ${PLAN_NAMES[c.plan]}`, body: `Thanks! It renews every month. You can cancel any time in Settings.`, data: { href: "/settings?tab=plan" } }, { category: "points", ref: `plan:${reference}` });
}

/** Back from Paystack: check with Paystack itself (never trust the redirect alone). */
export async function verifyCheckout(viewer: IUser, reference: string): Promise<{ paid: boolean; subscription: SubscriptionDTO }> {
  const c = await SubscriptionCheckout.findOne({ reference }).lean<ISubscriptionCheckout>();
  if (!c || sid(c.userId) !== sid(viewer._id)) throw notFound("We couldn't find that payment.");
  if (c.status === "pending") await fulfilCheckout(reference, await paystack<Paid>(`/transaction/verify/${encodeURIComponent(reference)}`));
  const now = await SubscriptionCheckout.findById(c._id).select("status").lean<Pick<ISubscriptionCheckout, "status">>();
  const me = (await User.findById(viewer._id).lean<IUser>()) ?? viewer;
  return { paid: now?.status === "paid", subscription: await mySubscription(me) };
}

/* ------------------------------ bought in the phone app ------------------------------ */

/** Give someone what a checked store purchase paid for. Counted once, however many times the phone reports it. */
export async function applyPlanPurchase(userId: Types.ObjectId, ref: string, bought: PaidPlan, platform: "apple" | "google", now = new Date()): Promise<void> {
  if (await PlanStorePurchase.exists({ ref })) return;
  const me = await User.findById(userId).select("plan planUntil").lean<Pick<IUser, "plan" | "planUntil">>();
  const next = planAfterPurchase({ plan: me?.plan ?? "free", until: me?.planUntil ?? null }, bought, now);
  try {
    await PlanStorePurchase.create({ ref, userId, plan: bought, platform, until: next.until });
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return; // the same purchase, reported twice at once
    throw e;
  }
  await User.updateOne({ _id: userId }, { $set: { plan: next.plan, planUntil: next.until } });
  await Subscription.updateOne({ userId }, { $set: { plan: next.plan, status: "non_renewing", source: "store", currentPeriodEnd: next.until, cancelledAt: null } }, { upsert: true });
  notify([userId], { title: `You're on ${PLAN_NAMES[next.plan]}`, body: "Thanks! It lasts 30 days and doesn't renew by itself.", data: { href: "/settings?tab=plan" } });
}

/** A Lite or Pro purchase from the phone: ask the store what it really was, then give it to the person who bought it. */
export async function verifyPlanStorePurchase(viewer: IUser, input: z.infer<typeof adStoreVerifySchema>): Promise<SubscriptionDTO> {
  rateLimit(`plan-store:${sid(viewer._id)}`, 30, 60 * 60 * 1000);
  const sale = input.platform === "apple" ? await appleSale(input.transactionId) : await googleSale(input.productId, input.purchaseToken);
  if (sale.test && !testSalesAllowed()) throw new ApiError(402, "That was a test purchase, so it can't pay for a plan.", { code: "store_test" });
  if (sale.refunded) throw new ApiError(402, "That purchase was refunded.", { code: "store_refunded" });
  if (sale.pending) throw new ApiError(409, "Your payment is still going through. Your plan starts once it's done.", { code: "store_pending" });
  const bought = planFromStoreProduct(sale.productId);
  if (!bought) throw new ApiError(402, "That purchase isn't for a plan.", { code: "store_unknown" });
  if (sale.accountToken !== planStoreToken(sid(viewer._id))) throw new ApiError(409, "That purchase was made on another Klique account. Contact us and we'll sort it out.", { code: "store_other_account" });
  await applyPlanPurchase(viewer._id, `${input.platform}:${sale.id}`, bought, input.platform);
  const me = (await User.findById(viewer._id).lean<IUser>()) ?? viewer;
  return mySubscription(me);
}

/* ------------------------------ cancelling ------------------------------ */

/** Stop renewing. The plan lasts to the end of the month already paid. */
export async function cancelSubscription(viewer: IUser): Promise<SubscriptionDTO> {
  const row = await Subscription.findOne({ userId: viewer._id }).lean<ISubscription>();
  if (!row || row.source !== "paystack" || row.status === "ended" || row.status === "non_renewing") throw badRequest("You don't have a subscription that renews.");
  let { subscriptionCode, emailToken } = row.paystack ?? {};
  // the codes come with Paystack's subscription.create; if that hasn't reached us, ask Paystack
  if ((!subscriptionCode || !emailToken) && row.paystack?.customerCode) {
    const cust = await paystack<{ subscriptions?: { subscription_code: string; email_token: string; status: string }[] }>(`/customer/${encodeURIComponent(row.paystack.customerCode)}`).catch(() => null);
    const live = cust?.subscriptions?.find((s) => s.status === "active" || s.status === "attention");
    if (live) ({ subscription_code: subscriptionCode, email_token: emailToken } = live);
  }
  if (!subscriptionCode || !emailToken) throw badRequest("We couldn't reach your subscription on Paystack just now. Try again in a few minutes.");
  await paystack("/subscription/disable", { method: "POST", body: { code: subscriptionCode, token: emailToken } });
  await Subscription.updateOne({ _id: row._id }, { $set: { status: "non_renewing", cancelledAt: new Date(), "paystack.subscriptionCode": subscriptionCode, "paystack.emailToken": emailToken } });
  return mySubscription(viewer);
}

/* ------------------------------ webhooks ------------------------------ */

type SubEvent = {
  event?: string;
  data?: {
    reference?: string;
    subscription_code?: string;
    email_token?: string;
    status?: string;
    next_payment_date?: string;
    paid_at?: string;
    amount?: number;
    plan?: { plan_code?: string } | string | null;
    plan_object?: { plan_code?: string };
    customer?: { customer_code?: string; email?: string };
    subscription?: { subscription_code?: string; next_payment_date?: string };
  };
};

const planCodeIn = (d: SubEvent["data"]) => (typeof d?.plan === "string" ? d.plan : (d?.plan?.plan_code ?? d?.plan_object?.plan_code ?? null));

/** Whose subscription a Paystack event is about: by subscription code, then customer code, then email. */
async function findRow(d: SubEvent["data"]): Promise<ISubscription | null> {
  const code = d?.subscription_code ?? d?.subscription?.subscription_code;
  if (code) {
    const r = await Subscription.findOne({ "paystack.subscriptionCode": code }).lean<ISubscription>();
    if (r) return r;
  }
  if (d?.customer?.customer_code) {
    const r = await Subscription.findOne({ "paystack.customerCode": d.customer.customer_code }).lean<ISubscription>();
    if (r) return r;
  }
  if (d?.customer?.email) {
    const u = await User.findOne({ email: d.customer.email.toLowerCase() }).select("_id").lean<{ _id: Types.ObjectId }>();
    if (u) return Subscription.findOne({ userId: u._id }).lean<ISubscription>();
  }
  return null;
}

/**
 * A charge that isn't one of our checkouts but is for one of our plans: a monthly renewal. Another month on top of
 * what's paid. Returns false when it isn't ours (so the caller can try the other kinds of payment).
 */
export async function handleRenewal(evt: SubEvent): Promise<boolean> {
  const d = evt.data;
  const plan = await ourPlanByCode(planCodeIn(d));
  if (!plan) return false;
  const row = await findRow(d);
  if (!row) {
    console.warn("[plans] renewal for someone we don't know", d?.customer?.email ? "(email on file)" : "");
    return true;
  }
  // Paystack resends a webhook it isn't sure we got: count each renewal once (claimed first, so two at once can't both)
  const ref = d?.reference;
  if (ref) {
    const claimed = await Subscription.updateOne({ _id: row._id, renewalRefs: { $ne: ref } }, { $push: { renewalRefs: { $each: [ref], $slice: -24 } } });
    if (!claimed.modifiedCount) return true;
  }
  const user = await User.findById(row.userId).select("planUntil").lean<Pick<IUser, "planUntil">>();
  const paidAt = d?.paid_at ? new Date(d.paid_at) : new Date();
  const from = Math.max(+paidAt, user?.planUntil ? +user.planUntil - GRACE_MS : 0);
  const until = new Date(from + MONTH_MS + GRACE_MS);
  await User.updateOne({ _id: row.userId }, { $set: { plan, planUntil: until } });
  await Subscription.updateOne({ _id: row._id }, { $set: { plan, status: "active", currentPeriodEnd: until } });
  return true;
}

/** Paystack's subscription events: its codes (needed to cancel), cancellations, failed renewals. */
export async function handleSubscriptionEvent(evt: SubEvent): Promise<void> {
  const d = evt.data;
  const row = await findRow(d);
  if (!row) return;
  switch (evt.event) {
    case "subscription.create":
      if ((await ourPlanByCode(planCodeIn(d))) && d?.subscription_code) await Subscription.updateOne({ _id: row._id }, { $set: { "paystack.subscriptionCode": d.subscription_code, "paystack.emailToken": d.email_token ?? null, "paystack.planCode": planCodeIn(d), "paystack.customerCode": d.customer?.customer_code ?? row.paystack?.customerCode ?? null } });
      return;
    case "subscription.not_renew":
    case "subscription.disable":
      // only the subscription we know about (a plan switch disables the old one, which mustn't end the new one)
      if (d?.subscription_code && row.paystack?.subscriptionCode && d.subscription_code !== row.paystack.subscriptionCode) return;
      if (row.status !== "ended") await Subscription.updateOne({ _id: row._id }, { $set: { status: "non_renewing", cancelledAt: row.cancelledAt ?? new Date() } });
      return;
    case "invoice.payment_failed":
      await Subscription.updateOne({ _id: row._id }, { $set: { status: "attention" } });
      notify([row.userId], { title: `We couldn't renew your ${PLAN_NAMES[row.plan]} plan`, body: "Paystack will try your card again. Update it in Settings to keep your plan.", data: { href: "/settings?tab=plan" } }, { category: "points", ref: `plan-failed:${sid(row._id)}` });
      return;
  }
}

/* ------------------------------ free time ------------------------------ */

/**
 * Add `days` of a plan without Paystack (leftover Hype, or a gift from an admin). On top of the same plan's time;
 * someone already on a higher paid plan keeps it and gets the days after it.
 */
export async function grantPlanDays(userId: Types.ObjectId, plan: PaidPlan, days: number, source: "hype" | "grant"): Promise<Date> {
  const u = await User.findById(userId).select("plan planUntil").lean<Pick<IUser, "plan" | "planUntil">>();
  const now = Date.now();
  const current = activePlan(u ?? {});
  const keepHigher = current === "pro" && plan === "lite";
  const from = current === plan || keepHigher ? Math.max(now, u?.planUntil ? +u.planUntil : now) : now;
  const until = new Date(from + days * DAY_MS);
  if (!keepHigher) await User.updateOne({ _id: userId }, { $set: { plan, planUntil: until } });
  else await User.updateOne({ _id: userId }, { $set: { planUntil: until } }); // Pro runs a little longer instead
  await Subscription.updateOne({ userId }, { $setOnInsert: { plan, status: "non_renewing", source, amount: 0, currentPeriodEnd: until } }, { upsert: true });
  await Subscription.updateOne({ userId, source: { $ne: "paystack" } }, { $set: { currentPeriodEnd: until } });
  return until;
}

/* ------------------------------ lifecycle ------------------------------ */

/** Runs with the reminders job: plans that ran out end (the user is back on Free; nothing else to undo). */
export async function runPlanLifecycle(now = new Date()): Promise<number> {
  const ended = await User.find({ plan: { $in: ["lite", "pro"] }, planUntil: { $lte: now } }).select("_id plan").limit(1000).lean<{ _id: Types.ObjectId; plan: PaidPlan }[]>();
  for (const u of ended) {
    await User.updateOne({ _id: u._id, planUntil: { $lte: now } }, { $set: { plan: "free" } });
    await Subscription.updateOne({ userId: u._id }, { $set: { status: "ended" } });
    notify([u._id], { title: `Your ${PLAN_NAMES[u.plan]} plan has ended`, body: "You're on Free now. Your kliques and photos stay; pick a plan any time to get the extras back.", data: { href: "/settings?tab=plan" } }, { category: "points", ref: `plan-ended:${sid(u._id)}` });
  }
  return ended.length;
}
