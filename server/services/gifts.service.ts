import "server-only";
import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import type { z } from "zod";
import { DEFAULT_GIFTS, GIFT_MAX_PRICE, GIFT_MIN_PRICE, HYPE_NAIRA, TOPUP_MAX, TOPUP_MIN, giftConfigOf, giftHype, giftTargetKey, hypeForNaira, payoutDayFor, receiverShare, type GiftConfig, type GiftTargetType } from "@/lib/gifts";
import type { AdminGiftsReportDTO, GiftDTO, GiftEarningsDTO, GiftReceivedDTO, GiftSentDTO, GiftSummaryDTO, GiftWalletDTO, HypeEntryDTO, PayoutDTO } from "@/lib/types";
import { adminEmails, appUrl, paystackConfig } from "../env";
import { ApiError, badRequest, conflict, forbidden, notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import { AppSetting } from "../models/AppSetting";
import { Channel, ChannelMessage, type IChannel, type IChannelMessage } from "../models/Channel";
import { Community, type ICommunity } from "../models/Community";
import { FeedComment, FeedPost, type IFeedComment, type IFeedPost } from "../models/FeedPost";
import { Gift, GiftSend, HypeEntry, HypeTopup, type HypeEntryKind, type IGift, type IGiftSend, type IHypeEntry, type IHypeTopup } from "../models/Gift";
import { Payout, type IPayout, type PayoutBank } from "../models/Money";
import { Board, Topic, type IBoard, type ITopic } from "../models/Topic";
import { User, type IUser } from "../models/User";
import { spaceAccess } from "../policies/access";
import { isSiteAdmin } from "../policies/hosting";
import { GHOST, loadBriefs } from "../serializers";
import type { giftConfigSchema, giftSaveSchema, giftSendSchema, giftStoreTopupSchema, giftTopupSchema, payoutRequestSchema } from "../validators/schemas";
import { sid } from "./helpers";
import { paystack } from "./promotions.service";
import { notify } from "./push.service";
import { appleSale, googleSale, storeBillingStatus, testSalesAllowed } from "./store-billing.service";
import { createHash } from "node:crypto";

/**
 * Gifts paid with Hype (lib/gifts.ts has the rules). The balance only ever moves through `move()`: one atomic $inc on
 * the user (never below zero) plus one line in the history. Prices always come from the catalogue here, never from
 * the client. A gift is first saved as "pending" under the sender's one-off key (so the same send twice is one gift),
 * then paid for; if paying fails it's removed again.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const CONFIG_KEY = "giftConfig";
const PAGE = 30;
const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
const mask = (acct: string) => (acct.length > 4 ? `••••${acct.slice(-4)}` : acct);
const oid = (id: string) => (Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null);

/* ------------------------------ settings ------------------------------ */

export async function getGiftConfig(): Promise<GiftConfig> {
  const row = await AppSetting.findById(CONFIG_KEY).lean();
  return giftConfigOf(row?.value);
}

export async function setGiftConfig(input: z.infer<typeof giftConfigSchema>): Promise<GiftConfig> {
  const now = await getGiftConfig();
  const next = giftConfigOf({ ...now, ...input, storeFeePercent: { ...now.storeFeePercent, ...(input.storeFeePercent ?? {}) } });
  await AppSetting.updateOne({ _id: CONFIG_KEY }, { $set: { value: next } }, { upsert: true });
  return next;
}

/* ------------------------------ catalogue ------------------------------ */

let seeded = false;
/** The default gifts, once per database (an empty catalogue gets them; an admin's edits are never overwritten). */
async function ensureGifts() {
  if (seeded) return;
  const flag = "seed:gifts-v1";
  try {
    await AppSetting.create({ _id: flag, value: { at: new Date() } });
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) {
      seeded = true;
      return;
    }
    throw e;
  }
  if (!(await Gift.exists({}))) await Gift.insertMany(DEFAULT_GIFTS.map((g, i) => ({ ...g, position: i, active: true, artUrl: null })));
  seeded = true;
}

const giftDto = (g: IGift, admin = false): GiftDTO => ({ id: sid(g._id), slug: g.slug, name: g.name, emoji: g.emoji, artUrl: g.artUrl, price: g.price, hype: giftHype(g.price), ...(admin ? { active: g.active, position: g.position } : {}) });

export async function listGifts(): Promise<GiftDTO[]> {
  await ensureGifts();
  const rows = await Gift.find({ active: true }).sort({ position: 1, price: 1 }).lean<IGift[]>();
  return rows.map((g) => giftDto(g));
}

export async function adminListGifts(): Promise<GiftDTO[]> {
  await ensureGifts();
  const rows = await Gift.find({}).sort({ position: 1, price: 1 }).lean<IGift[]>();
  return rows.map((g) => giftDto(g, true));
}

const clampPrice = (n: number) => Math.min(GIFT_MAX_PRICE, Math.max(GIFT_MIN_PRICE, Math.round(n)));

export async function adminSaveGift(input: z.infer<typeof giftSaveSchema>, id?: string): Promise<GiftDTO> {
  const set = { name: input.name, emoji: input.emoji || "🎁", artUrl: input.artUrl || null, price: clampPrice(input.price), active: input.active, ...(input.position !== undefined ? { position: input.position } : {}) };
  if (id) {
    const g = await Gift.findByIdAndUpdate(oid(id), { $set: set }, { returnDocument: "after" }).lean<IGift>();
    if (!g) throw notFound("That gift doesn't exist.");
    return giftDto(g, true);
  }
  const base = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "gift";
  const slug = (await Gift.exists({ slug: base })) ? `${base}-${randomBytes(3).toString("hex")}` : base;
  const last = await Gift.findOne({}).sort({ position: -1 }).select("position").lean<Pick<IGift, "position">>();
  const g = await Gift.create({ ...set, slug, position: input.position ?? (last?.position ?? 0) + 1 });
  return giftDto(g.toObject() as IGift, true);
}

/** Gifts already sent keep their copy of the name and picture, so a gift can be removed at any time. */
export async function adminDeleteGift(id: string) {
  const r = await Gift.deleteOne({ _id: oid(id) });
  if (!r.deletedCount) throw notFound("That gift doesn't exist.");
  return { deleted: true };
}

export async function adminReorderGifts(ids: string[]) {
  await Promise.all(ids.map((id, i) => Gift.updateOne({ _id: oid(id) }, { $set: { position: i } })));
  return adminListGifts();
}

/* ------------------------------- balance ------------------------------- */

/** Add (+) or take (−) Hype and write it in the history. Taking never goes below zero: null when there's too little. */
async function move(userId: Types.ObjectId, amount: number, kind: HypeEntryKind, note: string, ref: string | null = null, byId: Types.ObjectId | null = null): Promise<number | null> {
  const filter = amount < 0 ? { _id: userId, giftHype: { $gte: -amount } } : { _id: userId };
  const u = await User.findOneAndUpdate(filter, { $inc: { giftHype: amount } }, { returnDocument: "after" }).select("giftHype").lean<Pick<IUser, "giftHype">>();
  if (!u) return null;
  const balance = u.giftHype ?? 0;
  await HypeEntry.create({ userId, amount, balanceAfter: balance, kind, note, ref, byId });
  return balance;
}

const entryDto = (e: IHypeEntry): HypeEntryDTO => ({ id: sid(e._id), amount: e.amount, balanceAfter: e.balanceAfter, kind: e.kind, note: e.note, createdAt: e.createdAt.toISOString() });

/** Ties an in-app Hype purchase to one person (a UUID: the only shape Apple accepts). */
export function hypeStoreToken(userId: string): string {
  const h = createHash("sha256").update(`klique-hype:${userId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export async function getGiftWallet(viewer: IUser, before?: string): Promise<GiftWalletDTO> {
  const config = await getGiftConfig();
  const q: Record<string, unknown> = { userId: viewer._id };
  if (before) q.createdAt = { $lt: new Date(before) };
  const [me, rows] = await Promise.all([User.findById(viewer._id).select("giftHype").lean<Pick<IUser, "giftHype">>(), HypeEntry.find(q).sort({ createdAt: -1, _id: -1 }).limit(PAGE + 1).lean<IHypeEntry[]>()]);
  const store = storeBillingStatus();
  return {
    balance: me?.giftHype ?? 0,
    hypeNaira: HYPE_NAIRA,
    webPacks: config.webPacks.map((n) => ({ naira: n, hype: hypeForNaira(n) })),
    customMin: TOPUP_MIN,
    customMax: TOPUP_MAX,
    canBuyWeb: !!paystackConfig(),
    store: { apple: store.apple, google: store.google, accountToken: hypeStoreToken(sid(viewer._id)), packs: config.storePacks },
    history: rows.slice(0, PAGE).map(entryDto),
    hasMore: rows.length > PAGE,
  };
}

/* ------------------------------- top-ups ------------------------------- */

/** A website top-up: a pack or any amount up to ₦500,000. Paystack checkout; the Hype lands once it's paid. */
export async function startTopup(viewer: IUser, input: z.infer<typeof giftTopupSchema>): Promise<{ authorizationUrl: string; reference: string }> {
  rateLimit(`hype-topup:${sid(viewer._id)}`, 20, 60 * 60 * 1000);
  if (!paystackConfig()) throw badRequest("Buying Hype isn't set up yet.");
  const config = await getGiftConfig();
  const amount = Math.round(input.amount);
  if (amount < TOPUP_MIN || amount > TOPUP_MAX) throw new ApiError(422, `Top up between ${naira(TOPUP_MIN)} and ${naira(TOPUP_MAX)}.`, { errors: { amount: "Out of range" } });
  if (amount % HYPE_NAIRA) throw new ApiError(422, `Use a multiple of ₦${HYPE_NAIRA} (1 Hype is ₦${HYPE_NAIRA}).`, { errors: { amount: "Multiple of 10" } });
  const reference = `khy_${randomBytes(9).toString("hex")}`;
  const pack = config.webPacks.includes(amount) ? `web_${amount}` : "custom";
  await HypeTopup.create({ userId: viewer._id, platform: "web", hype: hypeForNaira(amount), amount, storeFee: 0, pack, reference });
  const back = `${appUrl()}/settings?tab=hype&hype_ref=${reference}`;
  const data = await paystack<{ authorization_url: string }>("/transaction/initialize", {
    method: "POST",
    body: { email: viewer.email, amount: amount * 100, currency: "NGN", reference, callback_url: back, metadata: { purpose: "gift-hype", hype: hypeForNaira(amount), cancel_action: back } },
  });
  return { authorizationUrl: data.authorization_url, reference };
}

/** Credit a paid top-up once (the webhook, the redirect and the app can all arrive; only the first counts). */
async function credit(t: IHypeTopup) {
  const claimed = await HypeTopup.findOneAndUpdate({ _id: t._id, status: "pending" }, { $set: { status: "paid", paidAt: new Date() } }, { returnDocument: "after" }).lean<IHypeTopup>();
  if (!claimed) return false;
  const where = claimed.platform === "web" ? "" : claimed.platform === "apple" ? " in the app (Apple)" : " in the app (Google)";
  await move(claimed.userId, claimed.hype, "topup", `Bought ${claimed.hype.toLocaleString("en-NG")} Hype${where}`, claimed.reference);
  notify([claimed.userId], { title: `${claimed.hype.toLocaleString("en-NG")} Hype added`, body: "Send gifts to posts and comments you love.", data: { href: "/settings?tab=hype" } }, { category: "gifts", ref: `hype:${claimed.reference}` });
  return true;
}

/** Paystack's answer for a checkout (redirect or webhook): add the Hype if it's fully paid. */
export async function fulfilTopup(reference: string, paid: { status: string; amount: number; currency: string }) {
  const t = await HypeTopup.findOne({ reference }).lean<IHypeTopup>();
  if (!t || t.status === "paid" || paid.status !== "success") return;
  if (paid.currency !== "NGN" || paid.amount < t.amount * 100) {
    console.warn("[gift-hype] amount mismatch", reference, paid.amount, t.amount * 100);
    return;
  }
  await credit(t);
}

export async function verifyTopup(viewer: IUser, reference: string): Promise<{ paid: boolean; hype: number; balance: number }> {
  const t = await HypeTopup.findOne({ reference, userId: viewer._id }).lean<IHypeTopup>();
  if (!t) throw notFound("We couldn't find that payment.");
  if (t.status !== "paid" && paystackConfig()) {
    const data = await paystack<{ status: string; amount: number; currency: string }>(`/transaction/verify/${encodeURIComponent(reference)}`);
    await fulfilTopup(reference, data);
  }
  const after = await HypeTopup.findById(t._id).select("status").lean<Pick<IHypeTopup, "status">>();
  const me = await User.findById(viewer._id).select("giftHype").lean<Pick<IUser, "giftHype">>();
  return { paid: after?.status === "paid", hype: t.hype, balance: me?.giftHype ?? 0 };
}

/** How a store purchase is checked; swapped out in tests so they never call Apple or Google. */
type SaleCheck = (input: z.infer<typeof giftStoreTopupSchema>) => Promise<{ id: string; productId: string; accountToken: string | null; test: boolean; refunded: boolean; pending: boolean }>;
let checkSale: SaleCheck = (input) => (input.platform === "apple" ? appleSale(input.transactionId) : googleSale(input.productId, input.purchaseToken));
/** tests only */
export const setSaleCheckForTests = (fn: SaleCheck | null) => {
  checkSale = fn ?? ((input) => (input.platform === "apple" ? appleSale(input.transactionId) : googleSale(input.productId, input.purchaseToken)));
};

/**
 * A Hype pack bought in the phone app: ask the store what it really was, then credit it once per store transaction.
 * The phone only finishes (consumes) the purchase once this succeeds. Safe to call again for the same purchase.
 */
export async function storeTopup(viewer: IUser, input: z.infer<typeof giftStoreTopupSchema>): Promise<{ balance: number; hype: number }> {
  rateLimit(`hype-store:${sid(viewer._id)}`, 60, 60 * 60 * 1000);
  const sale = await checkSale(input);
  if (sale.test && !testSalesAllowed()) throw new ApiError(402, "That was a test purchase, so it can't add Hype.", { code: "store_test" });
  if (sale.refunded) throw new ApiError(402, "That purchase was refunded.", { code: "store_refunded" });
  if (sale.pending) throw new ApiError(409, "Your payment is still going through. Your Hype lands once it's done.", { code: "store_pending" });
  if (sale.accountToken && sale.accountToken !== hypeStoreToken(sid(viewer._id))) throw new ApiError(409, "That purchase was made by a different account.", { code: "store_other_account" });
  const config = await getGiftConfig();
  const pack = config.storePacks.find((p) => p.productId === sale.productId);
  if (!pack) throw new ApiError(409, "That purchase isn't a Hype pack.", { code: "store_unknown" });
  const reference = `${input.platform}:${sale.id}`;
  const existing = await HypeTopup.findOne({ reference }).lean<IHypeTopup>();
  if (existing && sid(existing.userId) !== sid(viewer._id)) throw new ApiError(409, "That purchase was already used.", { code: "store_used" });
  let row = existing;
  if (!row) {
    try {
      const fee = Math.round((pack.price * config.storeFeePercent[input.platform]) / 100);
      row = (await HypeTopup.create({ userId: viewer._id, platform: input.platform, hype: pack.hype, amount: pack.price, storeFee: fee, pack: pack.productId, reference, test: sale.test })).toObject() as IHypeTopup;
    } catch (e) {
      if ((e as { code?: number })?.code !== 11000) throw e;
      row = await HypeTopup.findOne({ reference }).lean<IHypeTopup>();
    }
  }
  if (row && row.status === "pending") await credit(row);
  const me = await User.findById(viewer._id).select("giftHype").lean<Pick<IUser, "giftHype">>();
  return { balance: me?.giftHype ?? 0, hype: pack.hype };
}

/* ------------------------------- targets ------------------------------- */

type Target = { authorId: Types.ObjectId; community: ICommunity; href: string; label: string };

/** What a gift is for: who gets it, where it lives, and a link to it. Throws when it can't take gifts. */
async function resolveTarget(type: GiftTargetType, id: string): Promise<Target> {
  const _id = oid(id);
  if (!_id) throw notFound("We couldn't find that.");
  let authorId: Types.ObjectId | null = null;
  let communityId: Types.ObjectId | null = null;
  let href = "";
  let label = "";
  if (type === "post") {
    const p = await FeedPost.findById(_id).select("authorId communityId hiddenAt").lean<IFeedPost>();
    if (!p || p.hiddenAt) throw notFound("That post is gone.");
    ({ authorId, communityId } = p);
    href = `/p/${id}`;
    label = "your post";
  } else if (type === "comment") {
    const c = await FeedComment.findById(_id).select("authorId communityId postId deletedAt").lean<IFeedComment>();
    if (!c || c.deletedAt) throw notFound("That comment is gone.");
    ({ authorId, communityId } = c);
    href = `/p/${sid(c.postId)}`;
    label = "your comment";
  } else if (type === "topic" || type === "reply") {
    let topic: ITopic | null;
    let msgId: string | null = null;
    if (type === "topic") topic = await Topic.findById(_id).lean<ITopic>();
    else {
      const m = await ChannelMessage.findById(_id).select("authorId channelId deletedAt").lean<IChannelMessage>();
      if (!m || m.deletedAt || !m.authorId) throw notFound("That reply is gone.");
      const ch = await Channel.findById(m.channelId).select("topicId").lean<IChannel>();
      // gifts are for board replies only, never ordinary chat
      if (!ch?.topicId) throw badRequest("Gifts can only be sent to board replies, not chat messages.");
      topic = await Topic.findById(ch.topicId).lean<ITopic>();
      authorId = m.authorId;
      msgId = id;
    }
    if (!topic) throw notFound("That board post is gone.");
    authorId ??= topic.authorId;
    communityId = topic.communityId;
    const [c, b] = await Promise.all([Community.findById(topic.communityId).select("slug").lean<Pick<ICommunity, "slug">>(), topic.boardId ? Board.findById(topic.boardId).select("slug").lean<Pick<IBoard, "slug">>() : null]);
    href = `/communities/${c?.slug}?view=topics&b=${b?.slug ?? ""}&t=${sid(topic._id)}${msgId ? `&m=${msgId}` : ""}`;
    label = type === "topic" ? "your board post" : "your reply";
  } else throw badRequest("Gifts can't go there.");
  if (!authorId) throw badRequest("That can't take gifts.");
  const community = communityId ? await Community.findById(communityId).lean<ICommunity>() : null;
  if (!community) throw notFound("That community is gone.");
  if (community.explicit || community.adult) throw badRequest("Gifts aren't available in this community.");
  return { authorId, community, href, label };
}

/* ------------------------------- sending ------------------------------- */

export async function sendGift(viewer: IUser, input: z.infer<typeof giftSendSchema>): Promise<{ balance: number; summary: GiftSummaryDTO }> {
  const config = await getGiftConfig();
  if (!config.enabled) throw badRequest("Gifts are switched off for now.");
  // the same send twice (a retry on bad network) is one gift
  const again = await GiftSend.findOne({ fromId: viewer._id, clientKey: input.clientKey }).lean<IGiftSend>();
  if (again?.status === "sent") return { balance: (await User.findById(viewer._id).select("giftHype").lean<Pick<IUser, "giftHype">>())?.giftHype ?? 0, summary: (await summarise([{ type: again.target.type, id: sid(again.target.id) }]))[giftTargetKey({ type: again.target.type, id: sid(again.target.id) })] };
  rateLimit(`gift:${sid(viewer._id)}`, 120, 60 * 60 * 1000);
  const gift = oid(input.giftId) ? await Gift.findOne({ _id: oid(input.giftId), active: true }).lean<IGift>() : null;
  if (!gift) throw notFound("That gift isn't available any more.");
  const t = await resolveTarget(input.target.type, input.target.id);
  if (sid(t.authorId) === sid(viewer._id)) throw badRequest("You can't send a gift to yourself.");
  const access = await spaceAccess({ community: t.community, sub: null }, viewer);
  if (!access.canView) throw forbidden("You can't see that.");
  const receiver = await User.findById(t.authorId).select("_id suspendedAt").lean<Pick<IUser, "_id" | "suspendedAt">>();
  if (!receiver || receiver.suspendedAt) throw badRequest("They can't get gifts right now.");

  const hype = giftHype(gift.price);
  const toReceiver = receiverShare(gift.price, config.receiverPercent);
  let row: IGiftSend;
  try {
    row = (
      await GiftSend.create({
        fromId: viewer._id,
        toId: t.authorId,
        giftId: gift._id,
        giftName: gift.name,
        emoji: gift.emoji,
        artUrl: gift.artUrl,
        price: gift.price,
        hype,
        target: { type: input.target.type, id: new Types.ObjectId(input.target.id) },
        communityId: t.community._id,
        anonymous: !!input.anonymous,
        clientKey: input.clientKey,
        receiverAmount: toReceiver,
        kliqueAmount: gift.price - toReceiver,
        holdUntil: new Date(Date.now() + config.holdDays * DAY_MS),
      })
    ).toObject() as IGiftSend;
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) throw conflict("That gift is already on its way.");
    throw e;
  }
  const balance = await move(viewer._id, -hype, "gift", `${gift.name} gift`, `gift:${sid(row._id)}`);
  if (balance === null) {
    await GiftSend.deleteOne({ _id: row._id, status: "pending" });
    throw new ApiError(402, `You need ${hype.toLocaleString("en-NG")} Hype for a ${gift.name}. Top up in Settings, Hype.`, { code: "not_enough_hype" });
  }
  await GiftSend.updateOne({ _id: row._id }, { $set: { status: "sent" } });

  const who = input.anonymous ? "Someone" : viewer.displayName;
  notify([t.authorId], { title: `${who} sent you a ${gift.name} ${gift.emoji}`, body: `On ${t.label}. You earn ${naira(toReceiver)}.`, data: { href: t.href } }, { category: "gifts", ref: `gift:${input.target.type}:${input.target.id}`, ...(input.anonymous ? {} : { actorId: viewer._id }) });
  return { balance, summary: (await summarise([input.target]))[giftTargetKey(input.target)] };
}

/* ------------------------------- showing ------------------------------- */

/** Gifts on each item: one line per kind of gift with a count (🌹×3 👑×1), most valuable first. Never says who. */
async function summarise(targets: { type: GiftTargetType; id: string }[]): Promise<Record<string, GiftSummaryDTO>> {
  const ok = targets.filter((t) => oid(t.id));
  const out: Record<string, GiftSummaryDTO> = Object.fromEntries(targets.map((t) => [giftTargetKey(t), { total: 0, items: [] }]));
  if (!ok.length) return out;
  const rows = await GiftSend.aggregate<{ _id: { type: GiftTargetType; id: Types.ObjectId; giftId: Types.ObjectId }; count: number; price: number; name: string; emoji: string; artUrl: string | null }>([
    { $match: { status: "sent", $or: ok.map((t) => ({ "target.type": t.type, "target.id": oid(t.id) })) } },
    { $group: { _id: { type: "$target.type", id: "$target.id", giftId: "$giftId" }, count: { $sum: 1 }, price: { $max: "$price" }, name: { $last: "$giftName" }, emoji: { $last: "$emoji" }, artUrl: { $last: "$artUrl" } } },
  ]);
  for (const r of rows) {
    const s = out[`${r._id.type}:${sid(r._id.id)}`];
    if (!s) continue;
    s.total += r.count;
    s.items.push({ giftId: sid(r._id.giftId), name: r.name, emoji: r.emoji, artUrl: r.artUrl, count: r.count, price: r.price });
  }
  for (const s of Object.values(out)) s.items.sort((a, b) => b.price - a.price);
  return out;
}

export async function giftSummaries(raw: string): Promise<Record<string, GiftSummaryDTO>> {
  const targets = raw
    .split(",")
    .slice(0, 100)
    .map((k) => k.split(":"))
    .filter(([type, id]) => ["post", "comment", "topic", "reply"].includes(type) && !!id)
    .map(([type, id]) => ({ type: type as GiftTargetType, id }));
  return summarise(targets);
}

/** The catalogue plus your balance, for the gift tray. */
export async function giftTray(viewer: IUser) {
  const [gifts, me, config] = await Promise.all([listGifts(), User.findById(viewer._id).select("giftHype").lean<Pick<IUser, "giftHype">>(), getGiftConfig()]);
  return { gifts, balance: me?.giftHype ?? 0, enabled: config.enabled, hypeNaira: HYPE_NAIRA };
}

/* ------------------------------- earnings ------------------------------- */

async function receivedDtos(rows: IGiftSend[], viewerIsSender: boolean, admin = false): Promise<(GiftReceivedDTO & GiftSentDTO)[]> {
  const people = await loadBriefs(rows.flatMap((r) => [r.fromId, r.toId]));
  return rows.map((r) => ({
    id: sid(r._id),
    giftName: r.giftName,
    emoji: r.emoji,
    artUrl: r.artUrl,
    price: r.price,
    hype: r.hype,
    earned: r.receiverAmount,
    anonymous: r.anonymous,
    // an anonymous gift is "Someone" to everyone but its sender (and site admins)
    from: r.anonymous && !viewerIsSender && !admin ? null : (people.get(sid(r.fromId)) ?? GHOST),
    to: people.get(sid(r.toId)) ?? GHOST,
    target: { type: r.target.type, id: sid(r.target.id) },
    createdAt: r.createdAt.toISOString(),
    holdUntil: r.holdUntil.toISOString(),
    paidOut: !!r.payoutId,
  }));
}

async function payoutsOf(userId: Types.ObjectId): Promise<PayoutDTO[]> {
  const rows = await Payout.find({ kind: "gifts", requestedById: userId }).sort({ createdAt: -1 }).limit(24).lean<IPayout[]>();
  return rows.map((r) => ({ id: sid(r._id), amount: r.amount, status: r.status, bank: { bankName: r.bank.bankName, accountName: r.bank.accountName, bankCode: r.bank.bankCode, accountNumber: mask(r.bank.accountNumber) }, reference: r.reference, note: r.note, createdAt: r.createdAt.toISOString(), decidedAt: r.decidedAt?.toISOString() ?? null, kind: "gifts", dueOn: r.dueOn?.toISOString() ?? null }));
}

/** Settings → Earnings: what your gifts earned, what's on hold, available, asked for and paid, and the history. */
export async function getEarnings(viewer: IUser, before?: string): Promise<GiftEarningsDTO> {
  const config = await getGiftConfig();
  const now = new Date();
  const rejected = await Payout.find({ kind: "gifts", requestedById: viewer._id, status: "rejected" }).distinct("_id");
  const [agg] = await GiftSend.aggregate<{ earned: number; onHold: number; available: number; claimed: number }>([
    { $match: { toId: viewer._id, status: "sent" } },
    {
      $group: {
        _id: null,
        earned: { $sum: "$receiverAmount" },
        onHold: { $sum: { $cond: [{ $and: [{ $gt: ["$holdUntil", now] }, { $or: [{ $eq: ["$payoutId", null] }, { $in: ["$payoutId", rejected] }] }] }, "$receiverAmount", 0] } },
        available: { $sum: { $cond: [{ $and: [{ $lte: ["$holdUntil", now] }, { $or: [{ $eq: ["$payoutId", null] }, { $in: ["$payoutId", rejected] }] }] }, "$receiverAmount", 0] } },
      },
    },
  ]);
  const payouts = await payoutsOf(viewer._id);
  const requested = payouts.filter((p) => p.status === "requested").reduce((t, p) => t + p.amount, 0);
  const paid = payouts.filter((p) => p.status === "paid").reduce((t, p) => t + p.amount, 0);
  const q: Record<string, unknown> = { toId: viewer._id, status: "sent" };
  if (before) q.createdAt = { $lt: new Date(before) };
  const rows = await GiftSend.find(q).sort({ createdAt: -1 }).limit(PAGE + 1).lean<IGiftSend[]>();
  const me = await User.findById(viewer._id).select("payoutBank").lean<Pick<IUser, "payoutBank">>();
  const bank = me?.payoutBank ?? null;
  const waiting = payouts.find((p) => p.status === "requested") ?? null;
  const available = agg?.available ?? 0;
  return {
    receiverPercent: config.receiverPercent,
    holdDays: config.holdDays,
    minPayout: config.minPayout,
    totals: { earned: agg?.earned ?? 0, onHold: agg?.onHold ?? 0, available, requested, paid },
    nextPayoutOn: (waiting?.dueOn ?? payoutDayFor(now).toISOString()),
    waiting,
    payouts,
    history: await receivedDtos(rows.slice(0, PAGE), false),
    hasMore: rows.length > PAGE,
    bank: bank ? { bankName: bank.bankName, accountName: bank.accountName, bankCode: bank.bankCode, accountNumber: mask(bank.accountNumber) } : null,
    canRequest: !waiting && available >= config.minPayout,
  };
}

/** Gifts you sent (anonymous ones still show who to, and that they were anonymous). */
export async function giftsSent(viewer: IUser, before?: string): Promise<{ items: GiftSentDTO[]; hasMore: boolean }> {
  const q: Record<string, unknown> = { fromId: viewer._id, status: "sent" };
  if (before) q.createdAt = { $lt: new Date(before) };
  const rows = await GiftSend.find(q).sort({ createdAt: -1 }).limit(PAGE + 1).lean<IGiftSend[]>();
  return { items: await receivedDtos(rows.slice(0, PAGE), true), hasMore: rows.length > PAGE };
}

/**
 * Ask for everything available to be paid to a bank account. Requests made by the end of a month are paid on the 3rd
 * of the next month. One request at a time; the account name comes from the bank when Paystack is set up.
 */
export async function requestGiftPayout(viewer: IUser, input: z.infer<typeof payoutRequestSchema>): Promise<GiftEarningsDTO> {
  rateLimit(`gift-payout:${sid(viewer._id)}`, 5, DAY_MS);
  if (await Payout.exists({ kind: "gifts", requestedById: viewer._id, status: "requested" })) throw conflict("There's already a payout waiting. You can ask again once it's paid.");
  const config = await getGiftConfig();
  const me = await User.findById(viewer._id).select("payoutBank").lean<Pick<IUser, "payoutBank">>();
  let bank: PayoutBank;
  if (input.useSaved && me?.payoutBank) bank = me.payoutBank;
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
    await User.updateOne({ _id: viewer._id }, { $set: { payoutBank: bank } });
  }
  const now = new Date();
  const releasable = await Payout.find({ kind: "gifts", requestedById: viewer._id, status: "rejected" }).distinct("_id");
  const eligible = await GiftSend.find({ toId: viewer._id, status: "sent", holdUntil: { $lte: now }, $or: [{ payoutId: null }, { payoutId: { $in: releasable } }] }).select("_id receiverAmount").lean<Pick<IGiftSend, "_id" | "receiverAmount">[]>();
  const amount = eligible.reduce((t, g) => t + g.receiverAmount, 0);
  if (amount < config.minPayout) throw badRequest(`The smallest payout is ${naira(config.minPayout)}. You have ${naira(amount)} available.`);
  const dueOn = payoutDayFor(now);
  const payout = await Payout.create({ kind: "gifts", communityId: null, requestedById: viewer._id, amount, bank, dueOn });
  await GiftSend.updateMany({ _id: { $in: eligible.map((g) => g._id) } }, { $set: { payoutId: payout._id } });
  return getEarnings(viewer);
}

/** After an admin marks a gifts payout paid or turns it down (money.service decidePayout). */
export async function afterPayoutDecision(p: IPayout, admin: IUser) {
  if (p.status === "rejected") await GiftSend.updateMany({ payoutId: p._id }, { $set: { payoutId: null } });
  notify(
    [p.requestedById],
    p.status === "paid"
      ? { title: `${naira(p.amount)} gift earnings paid to ${p.bank.bankName}`, body: `Transfer reference ${p.reference}.`, data: { href: "/settings?tab=earnings" } }
      : { title: "Your gift earnings payout was turned down", body: p.note, data: { href: "/settings?tab=earnings" } },
    { actorId: admin._id, category: "gifts", ref: `payout:${sid(p._id)}` },
  );
}

/**
 * The 3rd of each month (cron): every gifts payout requested by the end of last month is due today. It's listed for
 * admins (Admin → Payouts) and its owner hears it's being paid. Running it twice lists nothing twice.
 */
export async function monthlyGiftPayouts(now = new Date()): Promise<{ listed: number; amount: number }> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const due = await Payout.find({ kind: "gifts", status: "requested", listedAt: null, createdAt: { $lt: monthStart } }).lean<IPayout[]>();
  if (!due.length) return { listed: 0, amount: 0 };
  await Payout.updateMany({ _id: { $in: due.map((p) => p._id) } }, { $set: { listedAt: now } });
  const amount = due.reduce((t, p) => t + p.amount, 0);
  for (const p of due) notify([p.requestedById], { title: `Your ${naira(p.amount)} gift earnings are being paid today`, body: `To ${p.bank.bankName} ${mask(p.bank.accountNumber)}.`, data: { href: "/settings?tab=earnings" } }, { category: "gifts", ref: `payout:${sid(p._id)}` });
  const admins = await User.find({ email: { $in: [...adminEmails()] } }).select("_id").lean<{ _id: Types.ObjectId }[]>();
  notify(admins.map((a) => a._id), { title: `${due.length} gift ${due.length === 1 ? "payout" : "payouts"} due today`, body: `${naira(amount)} in all. Admin, Payouts.`, data: { href: "/admin/payouts" } }, { category: "admin", ref: "gift-payouts" });
  return { listed: due.length, amount };
}

/* ------------------------------- admins ------------------------------- */

export async function adminGrantHype(admin: IUser, userId: string, amount: number, note: string) {
  const u = oid(userId) ? await User.findById(oid(userId)).select("_id").lean() : null;
  if (!u) throw notFound("No such person.");
  const balance = await move(u._id as Types.ObjectId, Math.round(amount), amount >= 0 ? "grant" : "revoke", note || (amount >= 0 ? "Given by Klique" : "Taken back by Klique"), null, admin._id);
  if (balance === null) throw badRequest("They don't have that much Hype.");
  return { balance };
}

type Range = { from?: string; to?: string };
const rangeOf = (r: Range) => {
  const q: Record<string, Date> = {};
  if (r.from) q.$gte = new Date(r.from);
  if (r.to) q.$lt = new Date(+new Date(r.to) + DAY_MS);
  return Object.keys(q).length ? q : null;
};

/**
 * Admin → Gifts: Hype bought (₦ and count by day or month, by platform), who bought, gifts sent (with anonymous
 * senders shown, for fraud and refund checks), and Klique's share against what receivers are owed and were paid.
 */
export async function adminGiftsReport(r: Range & { group?: "day" | "month" }): Promise<AdminGiftsReportDTO> {
  const when = rangeOf(r);
  const paidQ: Record<string, unknown> = { status: "paid", ...(when ? { paidAt: when } : {}) };
  const sentQ: Record<string, unknown> = { status: "sent", ...(when ? { createdAt: when } : {}) };
  const fmt = r.group === "month" ? "%Y-%m" : "%Y-%m-%d";
  const [byPlatform, series, purchases, sends, split, paidOut] = await Promise.all([
    HypeTopup.aggregate<{ _id: string; amount: number; fee: number; hype: number; count: number }>([{ $match: paidQ }, { $group: { _id: "$platform", amount: { $sum: "$amount" }, fee: { $sum: "$storeFee" }, hype: { $sum: "$hype" }, count: { $sum: 1 } } }]),
    HypeTopup.aggregate<{ _id: string; amount: number; count: number }>([{ $match: paidQ }, { $group: { _id: { $dateToString: { format: fmt, date: "$paidAt" } }, amount: { $sum: "$amount" }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    HypeTopup.find(paidQ).sort({ paidAt: -1 }).limit(300).lean<IHypeTopup[]>(),
    GiftSend.find(sentQ).sort({ createdAt: -1 }).limit(300).lean<IGiftSend[]>(),
    GiftSend.aggregate<{ value: number; receivers: number; klique: number; count: number }>([{ $match: sentQ }, { $group: { _id: null, value: { $sum: "$price" }, receivers: { $sum: "$receiverAmount" }, klique: { $sum: "$kliqueAmount" }, count: { $sum: 1 } } }]),
    Payout.aggregate<{ _id: string; amount: number }>([{ $match: { kind: "gifts", ...(when ? { createdAt: when } : {}) } }, { $group: { _id: "$status", amount: { $sum: "$amount" } } }]),
  ]);
  const people = await loadBriefs([...purchases.map((p) => p.userId), ...sends.flatMap((s) => [s.fromId, s.toId])]);
  const communities = new Map((await Community.find({ _id: { $in: sends.flatMap((s) => (s.communityId ? [s.communityId] : [])) } }).select("slug name").lean<Pick<ICommunity, "_id" | "slug" | "name">[]>()).map((c) => [sid(c._id), c]));
  const s = split[0];
  const paid = paidOut.find((x) => x._id === "paid")?.amount ?? 0;
  const requested = paidOut.find((x) => x._id === "requested")?.amount ?? 0;
  return {
    bought: {
      total: { amount: byPlatform.reduce((t, x) => t + x.amount, 0), count: byPlatform.reduce((t, x) => t + x.count, 0), hype: byPlatform.reduce((t, x) => t + x.hype, 0), storeFees: byPlatform.reduce((t, x) => t + x.fee, 0) },
      byPlatform: (["web", "apple", "google"] as const).map((p) => {
        const x = byPlatform.find((y) => y._id === p);
        return { platform: p, amount: x?.amount ?? 0, fees: x?.fee ?? 0, count: x?.count ?? 0, hype: x?.hype ?? 0 };
      }),
      series: series.map((x) => ({ period: x._id, amount: x.amount, count: x.count })),
    },
    purchases: purchases.map((p) => ({ id: sid(p._id), user: people.get(sid(p.userId)) ?? GHOST, platform: p.platform, pack: p.pack, hype: p.hype, amount: p.amount, storeFee: p.storeFee, reference: p.reference, test: p.test, paidAt: (p.paidAt ?? p.createdAt).toISOString() })),
    sends: sends.map((g) => {
      const c = g.communityId ? communities.get(sid(g.communityId)) : null;
      return { id: sid(g._id), from: people.get(sid(g.fromId)) ?? GHOST, to: people.get(sid(g.toId)) ?? GHOST, anonymous: g.anonymous, gift: { name: g.giftName, emoji: g.emoji }, price: g.price, receiverAmount: g.receiverAmount, kliqueAmount: g.kliqueAmount, target: { type: g.target.type, id: sid(g.target.id) }, community: c ? { slug: c.slug, name: c.name } : null, createdAt: g.createdAt.toISOString() };
    }),
    split: { giftValue: s?.value ?? 0, count: s?.count ?? 0, klique: s?.klique ?? 0, receivers: s?.receivers ?? 0, receiversPaid: paid, receiversRequested: requested, receiversOwed: Math.max(0, (s?.receivers ?? 0) - paid) },
  };
}

/** CSV of the purchases or the gifts sent, with the same filters. */
export async function adminGiftsCsv(kind: "purchases" | "sends", r: Range): Promise<string> {
  const rep = await adminGiftsReport({ ...r });
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  if (kind === "purchases") return ["date,user,handle,platform,pack,hype,amount_naira,store_fee_naira,reference,test", ...rep.purchases.map((p) => [p.paidAt, p.user.displayName, p.user.handle, p.platform, p.pack, p.hype, p.amount, p.storeFee, p.reference, p.test].map(esc).join(","))].join("\n");
  return ["date,from,from_handle,anonymous,to,to_handle,gift,price_naira,receiver_naira,klique_naira,target,community", ...rep.sends.map((g) => [g.createdAt, g.from.displayName, g.from.handle, g.anonymous, g.to.displayName, g.to.handle, g.gift.name, g.price, g.receiverAmount, g.kliqueAmount, `${g.target.type}:${g.target.id}`, g.community?.name ?? ""].map(esc).join(","))].join("\n");
}

/** Site admins see anonymous senders; everyone else never does. */
export const canSeeAnonymous = (u: IUser | null) => isSiteAdmin(u);
