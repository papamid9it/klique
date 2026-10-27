import "server-only";
import type { Types } from "mongoose";
import type { z } from "zod";
import { POINT_ACTIONS, pointsConfigOf, type PointAction, type PointsConfig } from "@/lib/points";
import type { PointsProgressDTO } from "@/lib/types";
import { AppSetting } from "../models/AppSetting";
import { PointAward, type IPointAward } from "../models/Points";
import { User, type IUser } from "../models/User";
import type { pointsEarningSchema } from "../validators/schemas";
import { sid } from "./helpers";

/**
 * Points: earned reputation (lib/points). `awardPoints` is the only way they're earned: each (person, action,
 * ref) pays at most once, each action has its own daily cap, and only other people's actions count. Nothing
 * ever takes points away by itself (an admin can, by hand). Buying has nothing to do with it: that's Hype.
 */

const CONFIG_KEY = "pointsEarning";
const lagosDay = (d = new Date()) => new Date(+d + 3600_000).toISOString().slice(0, 10);

export async function getPointsConfig(): Promise<PointsConfig> {
  const row = await AppSetting.findById(CONFIG_KEY).lean();
  return pointsConfigOf(row?.value);
}

export async function setPointsConfig(input: z.infer<typeof pointsEarningSchema>): Promise<PointsConfig> {
  const now = await getPointsConfig();
  const next = pointsConfigOf({ actions: { ...now.actions, ...(input.actions ?? {}) }, caps: { ...now.caps, ...(input.caps ?? {}) } });
  await AppSetting.updateOne({ _id: CONFIG_KEY }, { $set: { value: next } }, { upsert: true });
  return next;
}

let indexReady: Promise<unknown> | null = null;
const isDup = (e: unknown) => (e as { code?: number })?.code === 11000;

/**
 * Give someone points for something another person did for them (came to their event, upvoted their post...).
 * Quietly does nothing when `from` is themselves, it was already paid for this `ref`, the action is worth 0, or
 * they've hit today's cap for it (a part-award fills it up to the cap). Returns the points given.
 */
export async function awardPoints(userId: Types.ObjectId, action: PointAction, ref: string, from?: Types.ObjectId | null): Promise<number> {
  if (from && sid(from) === sid(userId)) return 0;
  const c = await getPointsConfig();
  const worth = c.actions[action];
  if (!worth) return 0;
  // the unique index is the real guard; make sure it exists, and skip the obvious repeat early
  await (indexReady ??= PointAward.init());
  if (await PointAward.exists({ userId, action, ref })) return 0;
  const day = lagosDay();
  const today = await PointAward.aggregate<{ n: number }>([{ $match: { userId, day, action } }, { $group: { _id: null, n: { $sum: "$amount" } } }]);
  const amount = Math.min(worth, Math.max(0, c.caps[action] - (today[0]?.n ?? 0)));
  if (!amount) return 0;
  try {
    await PointAward.create({ userId, action, ref, amount, day });
  } catch (e) {
    if (isDup(e)) return 0;
    throw e;
  }
  await User.updateOne({ _id: userId }, { $inc: { points: amount } });
  return amount;
}

/** Same, without holding up the request it rides on (a vote, a reaction): failures are only logged. */
export function awardPointsLater(userId: Types.ObjectId, action: PointAction, ref: string, from?: Types.ObjectId | null) {
  void awardPoints(userId, action, ref, from).catch((e) => console.error("[points] award failed", action, ref, e instanceof Error ? e.message : e));
}

/** Where someone stands: points, what each action is worth and how much of today's cap is left, recent awards. */
export async function pointsProgress(user: Pick<IUser, "_id" | "points">): Promise<PointsProgressDTO> {
  const c = await getPointsConfig();
  const [today, recent, me] = await Promise.all([
    PointAward.aggregate<{ _id: string; n: number }>([{ $match: { userId: user._id, day: lagosDay() } }, { $group: { _id: "$action", n: { $sum: "$amount" } } }]),
    PointAward.find({ userId: user._id }).sort({ createdAt: -1 }).limit(15).lean<IPointAward[]>(),
    User.findById(user._id).select("points").lean<Pick<IUser, "points">>(),
  ]);
  const used = new Map(today.map((t) => [t._id, t.n]));
  return {
    points: me?.points ?? user.points ?? 0,
    actions: POINT_ACTIONS.map((a) => ({ id: a.id, label: a.label, hint: a.hint, worth: c.actions[a.id], todayLeft: Math.max(0, c.caps[a.id] - (used.get(a.id) ?? 0)) })),
    recent: recent.map((r) => ({ action: r.action as PointAction, amount: r.amount, createdAt: r.createdAt.toISOString() })),
  };
}

/** Give (+) or take (−) points by hand (a site admin). Never below zero. */
export async function adjustPoints(userId: Types.ObjectId, amount: number): Promise<number | null> {
  const filter = amount < 0 ? { _id: userId, points: { $gte: -amount } } : { _id: userId };
  const u = await User.findOneAndUpdate(filter, { $inc: { points: amount } }, { returnDocument: "after" }).select("points").lean<Pick<IUser, "points">>();
  return u ? (u.points ?? 0) : null;
}
