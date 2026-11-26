import "server-only";
import { Types } from "mongoose";
import type { z } from "zod";
import { MAX_CAUSES, feeOf, type MoneyConfig } from "@/lib/money";
import type { CauseDTO, CausesDTO } from "@/lib/types";
import { ApiError, badRequest, conflict, forbidden, notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import type { ICommunity } from "../models/Community";
import { Membership } from "../models/Membership";
import { DonationButton, Payment, type IDonationButton, type IPayment } from "../models/Money";
import { User, type IUser } from "../models/User";
import { isSiteAdmin } from "../policies/hosting";
import { standingOf } from "../policies/standing";
import type { causeGiveSchema, causeSchema } from "../validators/schemas";
import { moveHype } from "./gifts.service";
import { sid } from "./helpers";
import { isKlique } from "./klique.service";
import { getMoneyConfig } from "./money.service";
import { notify } from "./push.service";
import { resolveSpaceFor } from "./spaces.service";

/**
 * Causes: what a community raises Hype for (they replaced donation buttons, and live in the same collection, so the
 * money joins the community's balance and payouts as donations did). Up to 3 at once, one of them the main one,
 * shown under the community's name. Anyone who can see the community gives any whole amount of Hype (up to 100,000 at
 * once); it's a gift: never refunded. Klique keeps its share (Admin → Money), fixed when it's given, and the rest is
 * the community's, in naira at the rate set there. Causes open once a community is big and old enough (also Admin).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

export const causeDto = (b: IDonationButton): CauseDTO => ({
  id: sid(b._id),
  label: b.label || b.title,
  verb: b.verb || "Give",
  title: b.title,
  description: b.description,
  imageUrl: b.imageUrl ?? null,
  goalHype: b.goalHype ?? null,
  raisedHype: b.raisedHype ?? 0,
  supporters: b.donors,
  main: !!b.main,
});

/** Big and old enough for causes (site admins and Klique HQ aside). */
const unlockedFor = (c: Pick<ICommunity, "memberCount" | "createdAt">, cfg: MoneyConfig) => (c.memberCount ?? 0) >= cfg.causeMinMembers && Date.now() - +c.createdAt >= cfg.causeMinDays * DAY_MS;

/** Not here: explicit communities have no causes (app stores and payment companies don't allow money for them). */
const noCauses = (c: ICommunity) => !!c.explicit;
/** Klique HQ's causes support Klique itself: all of what's given is Klique's (no split, no payout). */
const toKlique = (c: ICommunity) => isKlique(c);

/** The running causes, main first (an older community with none marked main: its first). */
async function running(communityId: Types.ObjectId): Promise<IDonationButton[]> {
  const rows = await DonationButton.find({ communityId, active: true }).sort({ main: -1, position: 1, createdAt: 1 }).lean<IDonationButton[]>();
  if (rows.length && !rows.some((r) => r.main)) rows[0] = { ...rows[0], main: true };
  return rows;
}

/** The main cause and how many there are, for the community page (one query; none for groups and Klique HQ). */
export async function mainCauseOf(community: ICommunity): Promise<{ mainCause: CauseDTO | null; causeCount: number }> {
  if (noCauses(community)) return { mainCause: null, causeCount: 0 };
  const rows = await running(community._id);
  return { mainCause: rows[0] ? causeDto(rows[0]) : null, causeCount: rows.length };
}

export async function listCauses(viewer: IUser | null, slug: string): Promise<CausesDTO> {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  const cfg = await getMoneyConfig();
  const manage = !!viewer && (access.canManage || isSiteAdmin(viewer)) && !noCauses(space.community);
  const base = { canManage: manage, unlocked: !noCauses(space.community) && (toKlique(space.community) || unlockedFor(space.community, cfg) || (!!viewer && isSiteAdmin(viewer))), unlock: { members: cfg.causeMinMembers, days: cfg.causeMinDays }, feePercent: toKlique(space.community) ? 100 : cfg.causeFeePercent, max: MAX_CAUSES, toKlique: toKlique(space.community) };
  const balance = viewer ? ((await User.findById(viewer._id).select("giftHype").lean<Pick<IUser, "giftHype">>())?.giftHype ?? 0) : null;
  if (space.sub || !access.canView || noCauses(space.community)) return { ...base, items: [], balance };
  return { ...base, items: (await running(space.community._id)).map(causeDto), balance };
}

async function managed(viewer: IUser, slug: string) {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (space.sub) throw notFound("Causes live in the community, not in a group.");
  if (!access.canManage && !isSiteAdmin(viewer)) throw forbidden("Only this community's owner and admins can do that.");
  if (space.community.explicit) throw forbidden("Communities with explicit content can't have causes.");
  return space.community;
}

export async function saveCause(viewer: IUser, slug: string, input: z.infer<typeof causeSchema>, id?: string): Promise<CauseDTO> {
  const community = await managed(viewer, slug);
  const cfg = await getMoneyConfig();
  if (!id && !toKlique(community) && !unlockedFor(community, cfg) && !isSiteAdmin(viewer)) throw forbidden(`Causes open once your community has ${cfg.causeMinMembers.toLocaleString("en-NG")} members and is ${cfg.causeMinDays} days old.`);
  const set = { label: input.label, ...(input.verb ? { verb: input.verb[0].toUpperCase() + input.verb.slice(1).toLowerCase() } : {}), title: input.title, description: input.description ?? "", ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}), goalHype: input.goalHype ?? null, active: true };
  let row: IDonationButton | null;
  if (id) {
    row = Types.ObjectId.isValid(id) ? await DonationButton.findOneAndUpdate({ _id: id, communityId: community._id, active: true }, { $set: set }, { returnDocument: "after" }).lean<IDonationButton>() : null;
    if (!row) throw notFound("We couldn't find that cause.");
  } else {
    const count = await DonationButton.countDocuments({ communityId: community._id, active: true });
    if (count >= MAX_CAUSES) throw badRequest(`A community can have up to ${MAX_CAUSES} causes. End one first.`);
    row = (await DonationButton.create({ ...set, communityId: community._id, position: Date.now() })).toObject() as IDonationButton;
  }
  // one main cause: this one when asked (or when it's the only one), the others no longer
  const only = (await DonationButton.countDocuments({ communityId: community._id, active: true })) === 1;
  if (input.main || only) {
    await DonationButton.updateMany({ communityId: community._id, _id: { $ne: row._id } }, { $set: { main: false } });
    await DonationButton.updateOne({ _id: row._id }, { $set: { main: true } });
    row = { ...row, main: true };
  } else if (input.main === false && row.main) {
    await DonationButton.updateOne({ _id: row._id }, { $set: { main: false } });
    row = { ...row, main: false };
  }
  return causeDto(row);
}

/** Ending a cause that's been given to only hides it, so what was given stays on the record. */
export async function endCause(viewer: IUser, slug: string, id: string) {
  const community = await managed(viewer, slug);
  const b = Types.ObjectId.isValid(id) ? await DonationButton.findOne({ _id: id, communityId: community._id }).lean<IDonationButton>() : null;
  if (!b) throw notFound("We couldn't find that cause.");
  if (await Payment.exists({ buttonId: b._id })) await DonationButton.updateOne({ _id: b._id }, { $set: { active: false, main: false } });
  else await DonationButton.deleteOne({ _id: b._id });
  return { ended: true };
}

/**
 * Give Hype to a cause. The gift is written first under the giver's one-off key (the same give twice is one gift),
 * then the Hype leaves their balance; if they haven't enough, the gift is removed again and they're told (402, code
 * not_enough_hype: the apps offer Hype packs).
 */
export async function giveToCause(viewer: IUser, slug: string, id: string, input: z.infer<typeof causeGiveSchema>): Promise<{ balance: number; cause: CauseDTO }> {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (space.sub || !access.canView || noCauses(space.community)) throw notFound("We couldn't find that cause.");
  const community = space.community;
  if (access.role === "owner") throw badRequest("You can't give to your own community's cause.");
  // restricted or suspended by Klique: causes are paused
  if (standingOf(community)) throw forbidden(`${community.name}'s causes are paused by Klique for now.`);
  const cause = Types.ObjectId.isValid(id) ? await DonationButton.findOne({ _id: id, communityId: community._id, active: true }).lean<IDonationButton>() : null;
  if (!cause) throw notFound("That cause has ended.");
  const reference = `kcs_${sid(viewer._id)}_${input.clientKey}`.slice(0, 120);
  const done = await Payment.findOne({ reference }).lean<IPayment>();
  const balanceNow = async () => (await User.findById(viewer._id).select("giftHype").lean<Pick<IUser, "giftHype">>())?.giftHype ?? 0;
  if (done?.status === "paid") return { balance: await balanceNow(), cause: causeDto((await DonationButton.findById(cause._id).lean<IDonationButton>()) ?? cause) };
  rateLimit(`cause-give:${sid(viewer._id)}`, 60, 60 * 60 * 1000);

  const cfg = await getMoneyConfig();
  const amount = Math.max(1, Math.round(input.hype * cfg.causeNairaPerHype));
  // Klique HQ's causes support Klique itself: all of it is Klique's, so nothing builds up to pay out
  const feePercent = toKlique(community) ? 100 : cfg.causeFeePercent;
  const fee = Math.min(amount, feeOf(amount, feePercent));
  let row: IPayment;
  try {
    row = (
      await Payment.create({ kind: "donation", communityId: community._id, buttonId: cause._id, userId: viewer._id, amount, feePercent, fee, net: amount - fee, hype: input.hype, message: input.anonymous ? "anonymous" : "", reference, status: "pending" })
    ).toObject() as IPayment;
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) throw conflict("That gift is already on its way.");
    throw e;
  }
  const balance = await moveHype(viewer._id, -input.hype, "cause", `Gift to ${cause.label || cause.title}`, `cause:${sid(row._id)}`);
  if (balance === null) {
    await Payment.deleteOne({ _id: row._id, status: "pending" });
    throw new ApiError(402, `You need ${input.hype.toLocaleString("en-NG")} Hype for that.`, { code: "not_enough_hype" });
  }
  const first = !(await Payment.exists({ buttonId: cause._id, userId: viewer._id, status: "paid" }));
  await Payment.updateOne({ _id: row._id }, { $set: { status: "paid", paidAt: new Date() } });
  const after = await DonationButton.findOneAndUpdate({ _id: cause._id }, { $inc: { raisedHype: input.hype, raised: amount, ...(first ? { donors: 1 } : {}) } }, { returnDocument: "after" }).lean<IDonationButton>();

  // the people who run it hear about it, bundled; the giver gets a thank-you
  const who = input.anonymous ? "Someone" : viewer.displayName;
  const staff = await Membership.find({ communityId: community._id, subcommunityId: null, status: "active", role: { $in: ["owner", "admin"] } }).select("userId").lean<{ userId: Types.ObjectId }[]>();
  notify(
    staff.map((m) => m.userId),
    { title: `${who} gave ${input.hype.toLocaleString("en-NG")} Hype to ${cause.title}`, body: toKlique(community) ? "Thank you from the Klique Team." : `${naira(amount - fee)} for ${community.name}, after Klique's share.`, data: { href: `/communities/${community.slug}?view=dashboard&d=money` } },
    { ...(input.anonymous ? {} : { actorId: viewer._id }), category: "admin", groupKey: `cause:${sid(cause._id)}`, many: (n) => `${n} gifts to ${cause.title}`, ref: `money:${sid(community._id)}` },
  );
  notify([viewer._id], { title: `Thank you for supporting ${community.name}`, body: `${input.hype.toLocaleString("en-NG")} Hype to ${cause.title}.`, data: { href: `/communities/${community.slug}` } }, { category: "community", ref: `receipt:${reference}` });
  return { balance, cause: causeDto(after ?? cause) };
}
