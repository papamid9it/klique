import "server-only";
import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import type { z } from "zod";
import { isStyleKey, pointsConfigOf, styleName, stylePrice, type PointsConfig, type StyleKey } from "@/lib/points";
import type { AdminPointsOverviewDTO, AdminPointsUserDTO, PointTxnDTO, PointsWalletDTO, StyleUnlockDTO } from "@/lib/types";
import { appUrl, paystackConfig } from "../env";
import { badRequest, conflict, notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import { AppSetting } from "../models/AppSetting";
import { PointPurchase, PointTxn, StyleUnlock, type IPointPurchase, type IPointTxn, type IStyleUnlock, type PointTxnKind } from "../models/Points";
import { User, type IUser } from "../models/User";
import { loadBriefs, toBrief } from "../serializers";
import type { pointsConfigSchema } from "../validators/schemas";
import { isSiteAdmin } from "../policies/hosting";
import { sid } from "./helpers";
import { paystack } from "./promotions.service";
import { notify } from "./push.service";

/**
 * Points. Picture frames and name styles cost points to wear, for `unlockDays` at a time (your picture and
 * banner are always free). Points come from packs bought on Paystack, from admins, and later from Hype.
 * The balance only ever moves through `move()`: one atomic $inc on the user (never below zero) plus one line
 * in the history. Prices always come from the admin's settings here, never from the browser.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const CONFIG_KEY = "pointsConfig";
const REMIND_MS = 3 * DAY_MS;
const HISTORY_PAGE = 30;

/* ------------------------------ settings ------------------------------ */

export async function getPointsConfig(): Promise<PointsConfig> {
  const row = await AppSetting.findById(CONFIG_KEY).lean();
  return pointsConfigOf(row?.value);
}

export async function setPointsConfig(input: z.infer<typeof pointsConfigSchema>): Promise<PointsConfig> {
  const now = await getPointsConfig();
  if (input.packs && new Set(input.packs.map((p) => p.id)).size !== input.packs.length) throw badRequest("Two packs have the same id.");
  const next = pointsConfigOf({
    ...now,
    ...input,
    defaultPrice: { ...now.defaultPrice, ...(input.defaultPrice ?? {}) },
    prices: input.prices ?? now.prices,
  });
  await AppSetting.updateOne({ _id: CONFIG_KEY }, { $set: { value: next } }, { upsert: true });
  return next;
}

/* ------------------------------- balance ------------------------------- */

/**
 * Add (+) or take (−) points, and write it in the history. Taking never goes below zero: it returns null when
 * the balance is too low, and nothing changes.
 */
async function move(userId: Types.ObjectId, amount: number, kind: PointTxnKind, note: string, ref: string | null = null, byId: Types.ObjectId | null = null): Promise<number | null> {
  const filter = amount < 0 ? { _id: userId, points: { $gte: -amount } } : { _id: userId };
  const u = await User.findOneAndUpdate(filter, { $inc: { points: amount } }, { returnDocument: "after" }).select("points").lean<Pick<IUser, "points">>();
  if (!u) return null;
  const balance = u.points ?? 0;
  await PointTxn.create({ userId, amount, balanceAfter: balance, kind, note, ref, byId });
  return balance;
}

/** Points for something earned (ranking up). Never fails for a missing balance; returns the new balance. */
export async function earnPoints(userId: Types.ObjectId, amount: number, note: string, ref: string): Promise<number | null> {
  if (amount <= 0) return null;
  return move(userId, amount, "earn", note, ref);
}

/** May this person wear this design right now? Free designs: always. Otherwise: an unexpired unlock. */
export async function canWear(userId: Types.ObjectId, key: StyleKey, config?: PointsConfig): Promise<boolean> {
  const c = config ?? (await getPointsConfig());
  if (stylePrice(c, key) === 0) return true;
  return !!(await StyleUnlock.exists({ userId, key, endedAt: null, expiresAt: { $gt: new Date() } }));
}

/** Throws when the profile patch puts on a design they haven't unlocked (keeping what they already wear is fine). */
export async function assertCanWear(viewer: IUser, patch: { avatarFrame?: string | null; nameEffect?: string | null }) {
  // site admins (ADMIN_EMAILS) wear everything free
  if (isSiteAdmin(viewer)) return;
  const c = await getPointsConfig();
  const wants: [string | null | undefined, string | null | undefined, "frame" | "name"][] = [
    [patch.avatarFrame, viewer.avatarFrame, "frame"],
    [patch.nameEffect, viewer.nameEffect, "name"],
  ];
  for (const [next, current, kind] of wants) {
    if (!next || next === current) continue;
    const key = `${kind}:${next}` as StyleKey;
    if (!(await canWear(viewer._id, key, c))) throw conflict(`Unlock the ${styleName(key)} first (${stylePrice(c, key)} points for ${c.unlockDays} days).`);
  }
}

/* ------------------------------- shapes ------------------------------- */

const unlockDto = (u: IStyleUnlock, c: PointsConfig): StyleUnlockDTO => ({
  key: u.key,
  name: styleName(u.key),
  expiresAt: u.expiresAt.toISOString(),
  autoRenew: u.autoRenew,
  source: u.source,
  price: isStyleKey(u.key) ? stylePrice(c, u.key) : 0,
});

const txnDto = (t: IPointTxn): PointTxnDTO => ({ id: sid(t._id), amount: t.amount, balanceAfter: t.balanceAfter, kind: t.kind, note: t.note, createdAt: t.createdAt.toISOString() });

async function historyOf(userId: Types.ObjectId, before?: string) {
  const q: Record<string, unknown> = { userId };
  if (before) q.createdAt = { $lt: new Date(before) };
  const rows = await PointTxn.find(q).sort({ createdAt: -1, _id: -1 }).limit(HISTORY_PAGE + 1).lean<IPointTxn[]>();
  return { items: rows.slice(0, HISTORY_PAGE).map(txnDto), hasMore: rows.length > HISTORY_PAGE };
}

async function unlocksOf(userId: Types.ObjectId, c: PointsConfig) {
  const rows = await StyleUnlock.find({ userId, endedAt: null, expiresAt: { $gt: new Date() } }).sort({ expiresAt: 1 }).lean<IStyleUnlock[]>();
  return rows.map((r) => unlockDto(r, c));
}

export async function getWallet(viewer: IUser): Promise<PointsWalletDTO> {
  const config = await getPointsConfig();
  const [me, unlocks, history] = await Promise.all([User.findById(viewer._id).select("points").lean<Pick<IUser, "points">>(), unlocksOf(viewer._id, config), historyOf(viewer._id)]);
  return { balance: me?.points ?? 0, allFree: isSiteAdmin(viewer), config, unlocks, history: history.items, hasMoreHistory: history.hasMore, canBuy: !!paystackConfig() };
}

export async function getHistory(viewer: IUser, before?: string) {
  return historyOf(viewer._id, before);
}

/* ------------------------------- spending ------------------------------- */

/**
 * Unlock a design for `unlockDays`, or add another `unlockDays` to one you already have (from when it would
 * have ended). Paid from your balance now.
 */
export async function unlockStyle(viewer: IUser, key: StyleKey, autoRenew?: boolean): Promise<PointsWalletDTO> {
  if (!isStyleKey(key)) throw badRequest("We don't know that design.");
  if (isSiteAdmin(viewer)) throw badRequest("Site admins wear every design free. Just pick it.");
  const c = await getPointsConfig();
  const price = stylePrice(c, key);
  if (price === 0) throw badRequest("That design is free. Just pick it.");
  rateLimit(`points-unlock:${sid(viewer._id)}`, 30, 60 * 60 * 1000);
  const label = `${styleName(key)}, ${c.unlockDays} days`;
  const balance = await move(viewer._id, -price, "unlock", label, key);
  if (balance === null) {
    const have = (await User.findById(viewer._id).select("points").lean<Pick<IUser, "points">>())?.points ?? 0;
    throw conflict(`You need ${price - have} more points to unlock this.`);
  }
  const existing = await StyleUnlock.findOne({ userId: viewer._id, key, endedAt: null }).lean<IStyleUnlock>();
  const from = Math.max(Date.now(), existing ? +existing.expiresAt : 0);
  await StyleUnlock.updateOne(
    { userId: viewer._id, key },
    { $set: { expiresAt: new Date(from + c.unlockDays * DAY_MS), source: "points", remindedFor: null, endedAt: null, ...(autoRenew !== undefined ? { autoRenew } : {}) } },
    { upsert: true },
  );
  return getWallet(viewer);
}

export async function setAutoRenew(viewer: IUser, key: string, autoRenew: boolean): Promise<PointsWalletDTO> {
  const res = await StyleUnlock.updateOne({ userId: viewer._id, key, endedAt: null, expiresAt: { $gt: new Date() } }, { $set: { autoRenew } });
  if (!res.matchedCount) throw notFound("You haven't unlocked that design.");
  return getWallet(viewer);
}

/* ------------------------------- buying ------------------------------- */

/** Start a Paystack checkout for a points pack. The browser goes to `authorizationUrl`. */
export async function buyPack(viewer: IUser, packId: string): Promise<{ authorizationUrl: string; reference: string }> {
  const c = await getPointsConfig();
  const pack = c.packs.find((p) => p.id === packId);
  if (!pack) throw badRequest("That pack isn't on sale any more.");
  if (!paystackConfig()) throw badRequest("Buying points isn't set up yet.");
  rateLimit(`points-buy:${sid(viewer._id)}`, 20, 60 * 60 * 1000);
  const reference = `kpt_${randomBytes(9).toString("hex")}`;
  await PointPurchase.create({ userId: viewer._id, packId: pack.id, points: pack.points, amount: pack.price, currency: "NGN", reference });
  const back = `${appUrl()}/settings?tab=points`;
  const data = await paystack<{ authorization_url: string }>("/transaction/initialize", {
    method: "POST",
    body: { email: viewer.email, amount: pack.price * 100, currency: "NGN", reference, callback_url: back, metadata: { purpose: "points", points: pack.points, cancel_action: back } },
  });
  return { authorizationUrl: data.authorization_url, reference };
}

/** Credit a paid pack once (the webhook and the redirect can both arrive; only the first one counts). */
async function creditPurchase(p: IPointPurchase, paidAt: Date): Promise<boolean> {
  const claimed = await PointPurchase.findOneAndUpdate({ _id: p._id, status: "pending" }, { $set: { status: "paid", paidAt } }, { returnDocument: "after" }).lean<IPointPurchase>();
  if (!claimed) return false;
  const balance = await move(claimed.userId, claimed.points, "purchase", `Bought ${claimed.points.toLocaleString("en-NG")} points`, claimed.reference);
  notify(
    [claimed.userId],
    { title: `${claimed.points.toLocaleString("en-NG")} points added`, body: `Your balance is ${(balance ?? 0).toLocaleString("en-NG")} points.`, data: { href: "/settings?tab=points" } },
    { category: "points", ref: `points:${claimed.reference}` },
  );
  return true;
}

/** Paystack's answer for a checkout (redirect or webhook): add the points if it's fully paid. */
export async function fulfilPointPurchase(reference: string, paid: { status: string; amount: number; currency: string; paid_at?: string }) {
  const p = await PointPurchase.findOne({ reference }).lean<IPointPurchase>();
  if (!p || paid.status !== "success") return;
  if (paid.currency !== p.currency || paid.amount < p.amount * 100) {
    console.warn("[points] amount mismatch", reference, paid.amount, p.amount * 100);
    return;
  }
  await creditPurchase(p, paid.paid_at ? new Date(paid.paid_at) : new Date());
}

/** Back from Paystack: check with Paystack directly (never trust the redirect alone). */
export async function verifyPointPurchase(viewer: IUser, reference: string): Promise<{ paid: boolean; points: number; wallet: PointsWalletDTO }> {
  const p = await PointPurchase.findOne({ reference }).lean<IPointPurchase>();
  if (!p || sid(p.userId) !== sid(viewer._id)) throw notFound("We couldn't find that payment.");
  if (p.status === "pending") {
    const data = await paystack<{ status: string; amount: number; currency: string; paid_at?: string }>(`/transaction/verify/${encodeURIComponent(reference)}`);
    await fulfilPointPurchase(reference, data);
  }
  const now = await PointPurchase.findById(p._id).select("status").lean<Pick<IPointPurchase, "status">>();
  return { paid: now?.status === "paid", points: p.points, wallet: await getWallet(viewer) };
}

/* ------------------------------- admins ------------------------------- */

async function findPerson(who: string) {
  const q = who.trim().replace(/^@/, "").toLowerCase();
  const user = Types.ObjectId.isValid(q) ? await User.findById(q).lean<IUser>() : await User.findOne({ handle: q }).lean<IUser>();
  if (!user) throw notFound("We couldn't find that person.");
  return user;
}

export async function adminPointsUser(who: string): Promise<AdminPointsUserDTO> {
  const user = await findPerson(who);
  const c = await getPointsConfig();
  const [unlocks, history] = await Promise.all([unlocksOf(user._id, c), historyOf(user._id)]);
  return { user: toBrief(user), balance: user.points ?? 0, hype: user.hype ?? 0, unlocks, history: history.items };
}

/** Give (+) or take (−) points by hand. Taking more than they have is refused. */
export async function adminAdjustPoints(admin: IUser, who: string, amount: number, note: string): Promise<AdminPointsUserDTO> {
  const user = await findPerson(who);
  if (!amount) throw badRequest("Enter how many points to give or take.");
  const reason = note.trim();
  const balance = await move(user._id, amount, amount > 0 ? "grant" : "revoke", reason || (amount > 0 ? "Given by Klique" : "Taken back by Klique"), null, admin._id);
  if (balance === null) throw conflict(`@${user.handle} only has ${user.points ?? 0} points.`);
  if (amount < 0) {
    notify(
      [user._id],
      { title: `${(-amount).toLocaleString("en-NG")} points were taken back`, body: reason || "A correction by Klique. Your history shows the details.", data: { href: "/settings?tab=points" } },
      { category: "points", ref: `points-revoke:${sid(user._id)}` },
    );
  }
  if (amount > 0) {
    notify(
      [user._id],
      { title: `You got ${amount.toLocaleString("en-NG")} points`, body: reason || "A gift from Klique. Spend them on a picture frame or name style.", data: { href: "/settings?tab=points" } },
      { category: "points", ref: `points-grant:${sid(user._id)}` },
    );
  }
  return adminPointsUser(sid(user._id));
}

export async function adminPointsOverview(): Promise<AdminPointsOverviewDTO> {
  const since = new Date(Date.now() - 30 * DAY_MS);
  const sum = (match: Record<string, unknown>) =>
    PointPurchase.aggregate<{ amount: number; points: number; count: number }>([{ $match: { status: "paid", ...match } }, { $group: { _id: null, amount: { $sum: "$amount" }, points: { $sum: "$points" }, count: { $sum: 1 } } }]).then((r) => r[0] ?? { amount: 0, points: 0, count: 0 });
  const [last30, all, held, activeUnlocks, recent] = await Promise.all([
    sum({ paidAt: { $gte: since } }),
    sum({}),
    User.aggregate<{ n: number }>([{ $match: { points: { $gt: 0 } } }, { $group: { _id: null, n: { $sum: "$points" } } }]).then((r) => r[0]?.n ?? 0),
    StyleUnlock.countDocuments({ expiresAt: { $gt: new Date() }, endedAt: null, source: "points" }),
    PointPurchase.find({}).sort({ createdAt: -1 }).limit(40).lean<IPointPurchase[]>(),
  ]);
  const people = await loadBriefs(recent.map((r) => r.userId));
  return {
    sales: { last30: { amount: last30.amount, points: last30.points, count: last30.count }, all: { amount: all.amount, points: all.points, count: all.count } },
    outstanding: held,
    activeUnlocks,
    recent: recent.map((r) => ({ id: sid(r._id), user: people.get(sid(r.userId)) ?? null, points: r.points, amount: r.amount, status: r.status, createdAt: r.createdAt.toISOString(), paidAt: r.paidAt?.toISOString() ?? null })),
  };
}

/* ------------------------------ lifecycle ------------------------------ */

const fieldOf = (key: string) => (key.startsWith("frame:") ? "avatarFrame" : "nameEffect");

/**
 * Runs with the reminders job:
 * - anyone wearing a paid design without an unlock (they had it before points, or a free design got a price)
 *   gets it free for one period, so nobody loses a look overnight;
 * - "ends in 3 days" once per period, unless it will renew by itself;
 * - at the end: renew from the balance if they asked to, otherwise take it off their profile.
 */
export async function runStyleLifecycle(now = new Date()): Promise<number> {
  const c = await getPointsConfig();
  let notified = 0;

  // 1. wearing a paid design without a current unlock: free for one period the first time (worn before points
  //    existed, or a free design got a price); taken off if they've had it before and it ended
  const wearing = await User.find({ $or: [{ avatarFrame: { $ne: null } }, { nameEffect: { $ne: null } }] })
    .select("email avatarFrame nameEffect")
    .limit(5000)
    .lean<Pick<IUser, "_id" | "email" | "avatarFrame" | "nameEffect">[]>()
    .then((rows) => rows.filter((u) => !isSiteAdmin(u)));
  if (wearing.length) {
    const rows = await StyleUnlock.find({ userId: { $in: wearing.map((u) => u._id) } }).select("userId key expiresAt").lean<Pick<IStyleUnlock, "userId" | "key" | "expiresAt">[]>();
    const seen = new Map(rows.map((r) => [`${sid(r.userId)}|${r.key}`, r.expiresAt]));
    const gifts: { updateOne: { filter: object; update: object; upsert: true } }[] = [];
    for (const u of wearing) {
      for (const key of [u.avatarFrame ? `frame:${u.avatarFrame}` : null, u.nameEffect ? `name:${u.nameEffect}` : null]) {
        if (!key || !isStyleKey(key) || stylePrice(c, key) === 0) continue;
        const until = seen.get(`${sid(u._id)}|${key}`);
        if (!until) {
          gifts.push({ updateOne: { filter: { userId: u._id, key }, update: { $setOnInsert: { expiresAt: new Date(+now + c.unlockDays * DAY_MS), source: "gift", autoRenew: false, remindedFor: null, endedAt: null } }, upsert: true } });
        } else if (+until <= now.getTime() - 60 * 60 * 1000) {
          // ended a while ago (step 3 had its chance): it shouldn't still be on
          await User.updateOne({ _id: u._id, [fieldOf(key)]: key.split(":")[1] }, { $set: { [fieldOf(key)]: null } });
        }
      }
    }
    if (gifts.length) await StyleUnlock.bulkWrite(gifts, { ordered: false });
  }

  // 2. ending in 3 days
  const soon = await StyleUnlock.find({ endedAt: null, expiresAt: { $gt: now, $lte: new Date(+now + REMIND_MS) } }).limit(1000).lean<IStyleUnlock[]>();
  const balances = new Map((await User.find({ _id: { $in: soon.map((s) => s.userId) } }).select("points").lean<Pick<IUser, "_id" | "points">[]>()).map((u) => [sid(u._id), u.points ?? 0]));
  for (const s of soon) {
    if (s.remindedFor && +s.remindedFor === +s.expiresAt) continue;
    if (!isStyleKey(s.key)) continue;
    const price = stylePrice(c, s.key);
    if (price === 0) continue;
    const covered = s.autoRenew && (balances.get(sid(s.userId)) ?? 0) >= price;
    const claimed = await StyleUnlock.updateOne({ _id: s._id, expiresAt: s.expiresAt, remindedFor: s.remindedFor }, { $set: { remindedFor: s.expiresAt } });
    if (!claimed.modifiedCount || covered) continue;
    notify(
      [s.userId],
      {
        title: `Your ${styleName(s.key)} ends in ${Math.max(1, Math.ceil((+s.expiresAt - +now) / DAY_MS))} days`,
        body: s.autoRenew ? `You need ${price} points for it to renew. Top up to keep it.` : `Keep it for another ${c.unlockDays} days for ${price} points.`,
        data: { href: "/settings?tab=points" },
      },
      { category: "points", ref: `style:${s.key}` },
    );
    notified++;
  }

  // 3. ended
  const ended = await StyleUnlock.find({ endedAt: null, expiresAt: { $lte: now } }).limit(1000).lean<IStyleUnlock[]>();
  for (const s of ended) {
    const key = s.key;
    const price = isStyleKey(key) ? stylePrice(c, key) : 0;
    if (s.autoRenew && price > 0) {
      // claim the renewal by moving the date first, so two runs can't both charge
      const next = new Date(Math.max(+s.expiresAt, +now - DAY_MS) + c.unlockDays * DAY_MS);
      const claimed = await StyleUnlock.updateOne({ _id: s._id, expiresAt: s.expiresAt }, { $set: { expiresAt: next, remindedFor: null, source: "points" } });
      if (!claimed.modifiedCount) continue;
      const paid = await move(s.userId, -price, "renew", `${styleName(key)}, ${c.unlockDays} more days`, key);
      if (paid !== null) {
        notify([s.userId], { title: `Renewed: ${styleName(key)}`, body: `${price} points for another ${c.unlockDays} days. ${paid} left.`, data: { href: "/settings?tab=points" } }, { category: "points", ref: `style:${key}` });
        notified++;
        continue;
      }
      // not enough points: undo the claim and let it end below
      await StyleUnlock.updateOne({ _id: s._id }, { $set: { expiresAt: s.expiresAt } });
    }
    const done = await StyleUnlock.updateOne({ _id: s._id, expiresAt: s.expiresAt, endedAt: null }, { $set: { endedAt: now, autoRenew: false } });
    if (!done.modifiedCount || price === 0) continue;
    const field = fieldOf(key);
    const owner = await User.findById(s.userId).select("email").lean<Pick<IUser, "email">>();
    if (isSiteAdmin(owner)) continue;
    const off = await User.updateOne({ _id: s.userId, [field]: key.split(":")[1] }, { $set: { [field]: null } });
    if (off.modifiedCount) {
      notify(
        [s.userId],
        { title: `Your ${styleName(key)} has ended`, body: `It's off your profile. Unlock it again for ${price} points.`, data: { href: "/settings?tab=style" } },
        { category: "points", ref: `style:${key}` },
      );
      notified++;
    }
  }
  return notified;
}
