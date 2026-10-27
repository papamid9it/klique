import "server-only";
import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import type { z } from "zod";
import { isAnimatedPicture } from "@/lib/cosmetics";
import { isStyleKey, styleName, stylePrice, walletConfigOf, wornKeys, type StyleKey, type WalletConfig, type Worn } from "@/lib/wallet";
import type { AdminHypeOverviewDTO, AdminWalletUserDTO, HypeTxnDTO, HypeWalletDTO, StyleUnlockDTO } from "@/lib/types";
import { appUrl, paystackConfig } from "../env";
import { badRequest, conflict, notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import { AppSetting } from "../models/AppSetting";
import { HypePurchase, HypeTxn, StyleUnlock, type HypeTxnKind, type IHypePurchase, type IHypeTxn, type IStyleUnlock } from "../models/Wallet";
import { ProfileEffect } from "../models/ProfileEffect";
import { User, type IUser } from "../models/User";
import { loadBriefs, toBrief } from "../serializers";
import type { walletConfigSchema } from "../validators/schemas";
import { isSiteAdmin } from "../policies/hosting";
import { sid } from "./helpers";
import { deleteUploads } from "./media.service";
import { paystack } from "./promotions.service";
import { notify } from "./push.service";

/**
 * Hype, the currency you buy. Picture frames and name styles cost Hype to wear, for `unlockDays` at a time (your
 * picture and banner are always free). Hype comes from packs bought on Paystack and from admins, never from
 * anything you do (that's points: points.service). The balance only ever moves through `move()`: one atomic $inc
 * on the user (never below zero) plus one line in the history. Prices always come from the admin's settings
 * here, never from the browser.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const CONFIG_KEY = "walletConfig";
const REMIND_MS = 3 * DAY_MS;
const HISTORY_PAGE = 30;

/* ------------------------------ settings ------------------------------ */

export async function getWalletConfig(): Promise<WalletConfig> {
  const row = await AppSetting.findById(CONFIG_KEY).lean();
  return walletConfigOf(row?.value);
}

export async function setWalletConfig(input: z.infer<typeof walletConfigSchema>): Promise<WalletConfig> {
  const now = await getWalletConfig();
  if (input.packs && new Set(input.packs.map((p) => p.id)).size !== input.packs.length) throw badRequest("Two packs have the same id.");
  const next = walletConfigOf({
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
 * Add (+) or take (−) Hype, and write it in the history. Taking never goes below zero: it returns null when
 * the balance is too low, and nothing changes.
 */
async function move(userId: Types.ObjectId, amount: number, kind: HypeTxnKind, note: string, ref: string | null = null, byId: Types.ObjectId | null = null): Promise<number | null> {
  const filter = amount < 0 ? { _id: userId, hype: { $gte: -amount } } : { _id: userId };
  const u = await User.findOneAndUpdate(filter, { $inc: { hype: amount } }, { returnDocument: "after" }).select("hype").lean<Pick<IUser, "hype">>();
  if (!u) return null;
  const balance = u.hype ?? 0;
  await HypeTxn.create({ userId, amount, balanceAfter: balance, kind, note, ref, byId });
  return balance;
}

/** May this person wear this design right now? Free designs: always. Otherwise: an unexpired unlock. */
export async function canWear(userId: Types.ObjectId, key: StyleKey, config?: WalletConfig): Promise<boolean> {
  const c = config ?? (await getWalletConfig());
  if (stylePrice(c, key) === 0) return true;
  return !!(await StyleUnlock.exists({ userId, key, endedAt: null, expiresAt: { $gt: new Date() } }));
}

/** Throws when the profile patch puts on a design they haven't unlocked (keeping what they already wear is fine). */
export async function assertCanWear(viewer: IUser, patch: Worn) {
  // site admins (ADMIN_EMAILS) wear everything free
  if (isSiteAdmin(viewer)) return;
  const has = (k: keyof Worn) => patch[k] !== undefined;
  const next: Worn = Object.fromEntries((["avatarFrame", "nameEffect", "profileTheme", "profileEffect", "avatarUrl", "bannerUrl"] as const).map((k) => [k, has(k) ? patch[k] || null : (viewer[k] ?? null)]));
  const before = new Set(wornKeys(viewer));
  const added = wornKeys(next).filter((k) => !before.has(k) || (k === "anim:profile" && ((has("avatarUrl") && patch.avatarUrl !== viewer.avatarUrl) || (has("bannerUrl") && patch.bannerUrl !== viewer.bannerUrl))));
  if (!added.length) return;
  const c = await getWalletConfig();
  for (const key of added) {
    if (!(await canWear(viewer._id, key, c))) throw conflict(`Unlock the ${styleName(key)} first (${stylePrice(c, key)} Hype for ${c.unlockDays} days).`);
  }
}

/* ------------------------------- shapes ------------------------------- */

const unlockDto = (u: IStyleUnlock, c: WalletConfig): StyleUnlockDTO => ({
  key: u.key,
  name: styleName(u.key),
  expiresAt: u.expiresAt.toISOString(),
  autoRenew: u.autoRenew,
  source: u.source,
  price: isStyleKey(u.key) ? stylePrice(c, u.key) : 0,
});

const txnDto = (t: IHypeTxn): HypeTxnDTO => ({ id: sid(t._id), amount: t.amount, balanceAfter: t.balanceAfter, kind: t.kind, note: t.note, createdAt: t.createdAt.toISOString() });

async function historyOf(userId: Types.ObjectId, before?: string) {
  const q: Record<string, unknown> = { userId };
  if (before) q.createdAt = { $lt: new Date(before) };
  const rows = await HypeTxn.find(q).sort({ createdAt: -1, _id: -1 }).limit(HISTORY_PAGE + 1).lean<IHypeTxn[]>();
  return { items: rows.slice(0, HISTORY_PAGE).map(txnDto), hasMore: rows.length > HISTORY_PAGE };
}

async function unlocksOf(userId: Types.ObjectId, c: WalletConfig) {
  const rows = await StyleUnlock.find({ userId, endedAt: null, expiresAt: { $gt: new Date() } }).sort({ expiresAt: 1 }).lean<IStyleUnlock[]>();
  return rows.map((r) => unlockDto(r, c));
}

export async function getWallet(viewer: IUser): Promise<HypeWalletDTO> {
  const config = await getWalletConfig();
  const [me, unlocks, history] = await Promise.all([User.findById(viewer._id).select("hype").lean<Pick<IUser, "hype">>(), unlocksOf(viewer._id, config), historyOf(viewer._id)]);
  return { balance: me?.hype ?? 0, allFree: isSiteAdmin(viewer), config, unlocks, history: history.items, hasMoreHistory: history.hasMore, canBuy: !!paystackConfig() };
}

export async function getHistory(viewer: IUser, before?: string) {
  return historyOf(viewer._id, before);
}

/* ------------------------------- spending ------------------------------- */

/**
 * Unlock a design for `unlockDays`, or add another `unlockDays` to one you already have (from when it would
 * have ended). Paid from your balance now.
 */
export async function unlockStyle(viewer: IUser, key: StyleKey, autoRenew?: boolean): Promise<HypeWalletDTO> {
  if (!isStyleKey(key)) throw badRequest("We don't know that design.");
  if (isSiteAdmin(viewer)) throw badRequest("Site admins wear every design free. Just pick it.");
  // profile effects are uploaded by site admins: it has to be one people can pick
  if (key.startsWith("effect:") && !(await ProfileEffect.exists({ slug: key.slice(7), active: true }))) throw badRequest("That profile effect isn't available.");
  const c = await getWalletConfig();
  const price = stylePrice(c, key);
  if (price === 0) throw badRequest("That design is free. Just pick it.");
  rateLimit(`points-unlock:${sid(viewer._id)}`, 30, 60 * 60 * 1000);
  const label = `${styleName(key)}, ${c.unlockDays} days`;
  const balance = await move(viewer._id, -price, "unlock", label, key);
  if (balance === null) {
    const have = (await User.findById(viewer._id).select("hype").lean<Pick<IUser, "hype">>())?.hype ?? 0;
    throw conflict(`You need ${price - have} more Hype to unlock this.`);
  }
  const existing = await StyleUnlock.findOne({ userId: viewer._id, key, endedAt: null }).lean<IStyleUnlock>();
  const from = Math.max(Date.now(), existing ? +existing.expiresAt : 0);
  await StyleUnlock.updateOne(
    { userId: viewer._id, key },
    { $set: { expiresAt: new Date(from + c.unlockDays * DAY_MS), source: "hype", remindedFor: null, endedAt: null, ...(autoRenew !== undefined ? { autoRenew } : {}) } },
    { upsert: true },
  );
  return getWallet(viewer);
}

export async function setAutoRenew(viewer: IUser, key: string, autoRenew: boolean): Promise<HypeWalletDTO> {
  const res = await StyleUnlock.updateOne({ userId: viewer._id, key, endedAt: null, expiresAt: { $gt: new Date() } }, { $set: { autoRenew } });
  if (!res.matchedCount) throw notFound("You haven't unlocked that design.");
  return getWallet(viewer);
}

/* ------------------------------- buying ------------------------------- */

/** Start a Paystack checkout for a Hype pack. The browser goes to `authorizationUrl`. */
export async function buyPack(viewer: IUser, packId: string): Promise<{ authorizationUrl: string; reference: string }> {
  const c = await getWalletConfig();
  const pack = c.packs.find((p) => p.id === packId);
  if (!pack) throw badRequest("That pack isn't on sale any more.");
  if (!paystackConfig()) throw badRequest("Buying Hype isn't set up yet.");
  rateLimit(`points-buy:${sid(viewer._id)}`, 20, 60 * 60 * 1000);
  const reference = `kpt_${randomBytes(9).toString("hex")}`;
  await HypePurchase.create({ userId: viewer._id, packId: pack.id, hype: pack.hype, amount: pack.price, currency: "NGN", reference });
  const back = `${appUrl()}/settings?tab=hype`;
  const data = await paystack<{ authorization_url: string }>("/transaction/initialize", {
    method: "POST",
    body: { email: viewer.email, amount: pack.price * 100, currency: "NGN", reference, callback_url: back, metadata: { purpose: "hype", hype: pack.hype, cancel_action: back } },
  });
  return { authorizationUrl: data.authorization_url, reference };
}

/** Credit a paid pack once (the webhook and the redirect can both arrive; only the first one counts). */
async function creditPurchase(p: IHypePurchase, paidAt: Date): Promise<boolean> {
  const claimed = await HypePurchase.findOneAndUpdate({ _id: p._id, status: "pending" }, { $set: { status: "paid", paidAt } }, { returnDocument: "after" }).lean<IHypePurchase>();
  if (!claimed) return false;
  const balance = await move(claimed.userId, claimed.hype, "purchase", `Bought ${claimed.hype.toLocaleString("en-NG")} Hype`, claimed.reference);
  notify(
    [claimed.userId],
    { title: `${claimed.hype.toLocaleString("en-NG")} Hype added`, body: `Your balance is ${(balance ?? 0).toLocaleString("en-NG")} Hype.`, data: { href: "/settings?tab=hype" } },
    { category: "points", ref: `hype:${claimed.reference}` },
  );
  return true;
}

/** Paystack's answer for a checkout (redirect or webhook): add the Hype if it's fully paid. */
export async function fulfilHypePurchase(reference: string, paid: { status: string; amount: number; currency: string; paid_at?: string }) {
  const p = await HypePurchase.findOne({ reference }).lean<IHypePurchase>();
  if (!p || paid.status !== "success") return;
  if (paid.currency !== p.currency || paid.amount < p.amount * 100) {
    console.warn("[hype] amount mismatch", reference, paid.amount, p.amount * 100);
    return;
  }
  await creditPurchase(p, paid.paid_at ? new Date(paid.paid_at) : new Date());
}

/** Back from Paystack: check with Paystack directly (never trust the redirect alone). */
export async function verifyHypePurchase(viewer: IUser, reference: string): Promise<{ paid: boolean; hype: number; wallet: HypeWalletDTO }> {
  const p = await HypePurchase.findOne({ reference }).lean<IHypePurchase>();
  if (!p || sid(p.userId) !== sid(viewer._id)) throw notFound("We couldn't find that payment.");
  if (p.status === "pending") {
    const data = await paystack<{ status: string; amount: number; currency: string; paid_at?: string }>(`/transaction/verify/${encodeURIComponent(reference)}`);
    await fulfilHypePurchase(reference, data);
  }
  const now = await HypePurchase.findById(p._id).select("status").lean<Pick<IHypePurchase, "status">>();
  return { paid: now?.status === "paid", hype: p.hype, wallet: await getWallet(viewer) };
}

/* ------------------------------- admins ------------------------------- */

async function findPerson(who: string) {
  const q = who.trim().replace(/^@/, "").toLowerCase();
  const user = Types.ObjectId.isValid(q) ? await User.findById(q).lean<IUser>() : await User.findOne({ handle: q }).lean<IUser>();
  if (!user) throw notFound("We couldn't find that person.");
  return user;
}

export async function adminWalletUser(who: string): Promise<AdminWalletUserDTO> {
  const user = await findPerson(who);
  const c = await getWalletConfig();
  const [unlocks, history] = await Promise.all([unlocksOf(user._id, c), historyOf(user._id)]);
  return { user: toBrief(user), hype: user.hype ?? 0, points: user.points ?? 0, unlocks, history: history.items };
}

/** Give (+) or take (−) Hype by hand. Taking more than they have is refused. */
export async function adminAdjustHype(admin: IUser, who: string, amount: number, note: string): Promise<AdminWalletUserDTO> {
  const user = await findPerson(who);
  if (!amount) throw badRequest("Enter how much Hype to give or take.");
  const reason = note.trim();
  const balance = await move(user._id, amount, amount > 0 ? "grant" : "revoke", reason || (amount > 0 ? "Given by Klique" : "Taken back by Klique"), null, admin._id);
  if (balance === null) throw conflict(`@${user.handle} only has ${user.hype ?? 0} Hype.`);
  if (amount < 0) {
    notify(
      [user._id],
      { title: `${(-amount).toLocaleString("en-NG")} Hype was taken back`, body: reason || "A correction by Klique. Your history shows the details.", data: { href: "/settings?tab=hype" } },
      { category: "points", ref: `hype-revoke:${sid(user._id)}` },
    );
  }
  if (amount > 0) {
    notify(
      [user._id],
      { title: `You got ${amount.toLocaleString("en-NG")} Hype`, body: reason || "A gift from Klique. Spend it on a picture frame or name style.", data: { href: "/settings?tab=hype" } },
      { category: "points", ref: `hype-grant:${sid(user._id)}` },
    );
  }
  return adminWalletUser(sid(user._id));
}

export async function adminHypeOverview(): Promise<AdminHypeOverviewDTO> {
  const since = new Date(Date.now() - 30 * DAY_MS);
  const sum = (match: Record<string, unknown>) =>
    HypePurchase.aggregate<{ amount: number; hype: number; count: number }>([{ $match: { status: "paid", ...match } }, { $group: { _id: null, amount: { $sum: "$amount" }, hype: { $sum: "$hype" }, count: { $sum: 1 } } }]).then((r) => r[0] ?? { amount: 0, hype: 0, count: 0 });
  const [last30, all, held, activeUnlocks, recent] = await Promise.all([
    sum({ paidAt: { $gte: since } }),
    sum({}),
    User.aggregate<{ n: number }>([{ $match: { hype: { $gt: 0 } } }, { $group: { _id: null, n: { $sum: "$hype" } } }]).then((r) => r[0]?.n ?? 0),
    StyleUnlock.countDocuments({ expiresAt: { $gt: new Date() }, endedAt: null, source: "hype" }),
    HypePurchase.find({}).sort({ createdAt: -1 }).limit(40).lean<IHypePurchase[]>(),
  ]);
  const people = await loadBriefs(recent.map((r) => r.userId));
  return {
    sales: { last30: { amount: last30.amount, hype: last30.hype, count: last30.count }, all: { amount: all.amount, hype: all.hype, count: all.count } },
    outstanding: held,
    activeUnlocks,
    recent: recent.map((r) => ({ id: sid(r._id), user: people.get(sid(r.userId)) ?? null, hype: r.hype, amount: r.amount, status: r.status, createdAt: r.createdAt.toISOString(), paidAt: r.paidAt?.toISOString() ?? null })),
  };
}

/* ------------------------------ lifecycle ------------------------------ */

/**
 * Take a design off someone's profile (it ended): only if they still wear that one. An animated picture or banner
 * is removed (there's no still copy of a GIF to fall back to).
 */
async function takeOff(userId: Types.ObjectId, key: string): Promise<boolean> {
  const [kind, id] = key.split(":");
  const one = async (filter: object, set: object) => (await User.updateOne({ _id: userId, ...filter }, { $set: set })).modifiedCount > 0;
  if (kind === "frame") return one({ avatarFrame: id }, { avatarFrame: null });
  if (kind === "name") return one({ nameEffect: id }, { nameEffect: null });
  if (kind === "theme") return one({ profileTheme: { $ne: null } }, { profileTheme: null });
  if (kind === "effect") return one({ profileEffect: id }, { profileEffect: null });
  if (kind === "anim") {
    const u = await User.findById(userId).select("avatarUrl bannerUrl").lean<Pick<IUser, "avatarUrl" | "bannerUrl">>();
    const set: Record<string, null> = {};
    if (isAnimatedPicture(u?.avatarUrl)) set.avatarUrl = null;
    if (isAnimatedPicture(u?.bannerUrl)) set.bannerUrl = null;
    if (!Object.keys(set).length) return false;
    await User.updateOne({ _id: userId }, { $set: set });
    deleteUploads([set.avatarUrl === null ? (u?.avatarUrl ?? null) : null, set.bannerUrl === null ? (u?.bannerUrl ?? null) : null]);
    return true;
  }
  return false;
}

/**
 * Runs with the reminders job:
 * - anyone wearing a paid design without an unlock (they had it before unlocks existed, or a free design got a price)
 *   gets it free for one period, so nobody loses a look overnight;
 * - "ends in 3 days" once per period, unless it will renew by itself;
 * - at the end: renew from the balance if they asked to, otherwise take it off their profile.
 */
export async function runStyleLifecycle(now = new Date()): Promise<number> {
  const c = await getWalletConfig();
  let notified = 0;

  // custom display name styles are gone: anyone still wearing one goes back to a plain name, and those unlocks end
  await User.updateMany({ nameEffect: /^style:/ }, { $set: { nameEffect: null } });
  await StyleUnlock.updateMany({ key: "style:custom", endedAt: null }, { $set: { endedAt: now, autoRenew: false } });

  // 1. wearing a paid design without a current unlock: free for one period the first time (worn before unlocks
  //    existed, or a free design got a price); taken off if they've had it before and it ended
  const wearing = await User.find({ $or: [{ avatarFrame: { $ne: null } }, { nameEffect: { $ne: null } }, { profileTheme: { $ne: null } }, { profileEffect: { $ne: null } }, { avatarUrl: /\.gif($|[?#])/i }, { bannerUrl: /\.gif($|[?#])/i }] })
    .select("email avatarFrame nameEffect profileTheme profileEffect avatarUrl bannerUrl")
    .limit(5000)
    .lean<Pick<IUser, "_id" | "email" | "avatarFrame" | "nameEffect" | "profileTheme" | "profileEffect" | "avatarUrl" | "bannerUrl">[]>()
    .then((rows) => rows.filter((u) => !isSiteAdmin(u)));
  if (wearing.length) {
    const rows = await StyleUnlock.find({ userId: { $in: wearing.map((u) => u._id) } }).select("userId key expiresAt").lean<Pick<IStyleUnlock, "userId" | "key" | "expiresAt">[]>();
    const seen = new Map(rows.map((r) => [`${sid(r.userId)}|${r.key}`, r.expiresAt]));
    const gifts: { updateOne: { filter: object; update: object; upsert: true } }[] = [];
    for (const u of wearing) {
      for (const key of wornKeys(u)) {
        if (stylePrice(c, key) === 0) continue;
        const until = seen.get(`${sid(u._id)}|${key}`);
        if (!until) {
          gifts.push({ updateOne: { filter: { userId: u._id, key }, update: { $setOnInsert: { expiresAt: new Date(+now + c.unlockDays * DAY_MS), source: "gift", autoRenew: false, remindedFor: null, endedAt: null } }, upsert: true } });
        } else if (+until <= now.getTime() - 60 * 60 * 1000) {
          // ended a while ago (step 3 had its chance): it shouldn't still be on
          await takeOff(u._id, key);
        }
      }
    }
    if (gifts.length) await StyleUnlock.bulkWrite(gifts, { ordered: false });
  }

  // 2. ending in 3 days
  const soon = await StyleUnlock.find({ endedAt: null, expiresAt: { $gt: now, $lte: new Date(+now + REMIND_MS) } }).limit(1000).lean<IStyleUnlock[]>();
  const balances = new Map((await User.find({ _id: { $in: soon.map((s) => s.userId) } }).select("hype").lean<Pick<IUser, "_id" | "hype">[]>()).map((u) => [sid(u._id), u.hype ?? 0]));
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
        body: s.autoRenew ? `You need ${price} Hype for it to renew. Top up to keep it.` : `Keep it for another ${c.unlockDays} days for ${price} Hype.`,
        data: { href: "/settings?tab=hype" },
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
      const claimed = await StyleUnlock.updateOne({ _id: s._id, expiresAt: s.expiresAt }, { $set: { expiresAt: next, remindedFor: null, source: "hype" } });
      if (!claimed.modifiedCount) continue;
      const paid = await move(s.userId, -price, "renew", `${styleName(key)}, ${c.unlockDays} more days`, key);
      if (paid !== null) {
        notify([s.userId], { title: `Renewed: ${styleName(key)}`, body: `${price} Hype for another ${c.unlockDays} days. ${paid} left.`, data: { href: "/settings?tab=hype" } }, { category: "points", ref: `style:${key}` });
        notified++;
        continue;
      }
      // not enough Hype: undo the claim and let it end below
      await StyleUnlock.updateOne({ _id: s._id }, { $set: { expiresAt: s.expiresAt } });
    }
    const done = await StyleUnlock.updateOne({ _id: s._id, expiresAt: s.expiresAt, endedAt: null }, { $set: { endedAt: now, autoRenew: false } });
    if (!done.modifiedCount || price === 0) continue;
    const owner = await User.findById(s.userId).select("email").lean<Pick<IUser, "email">>();
    if (isSiteAdmin(owner)) continue;
    if (await takeOff(s.userId, key)) {
      notify(
        [s.userId],
        { title: `Your ${styleName(key)} has ended`, body: key === "anim:profile" ? `Your animated picture or banner is off your profile. Unlock it again for ${price} Hype, or upload a still one.` : `It's off your profile. Unlock it again for ${price} Hype.`, data: { href: "/settings?tab=style" } },
        { category: "points", ref: `style:${key}` },
      );
      notified++;
    }
  }
  return notified;
}
