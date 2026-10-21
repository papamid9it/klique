import "server-only";
import type { Types } from "mongoose";
import type { z } from "zod";
import { rankFor, ranksConfigOf, type HypeAction, type RanksConfig } from "@/lib/ranks";
import type { RankProgressDTO } from "@/lib/types";
import { AppSetting } from "../models/AppSetting";
import { HypeAward, type IHypeAward } from "../models/Hype";
import { User, type IUser } from "../models/User";
import type { ranksConfigSchema } from "../validators/schemas";
import { sid } from "./helpers";
import { earnPoints } from "./points.service";
import { notify } from "./push.service";

/**
 * Hype and ranks. `awardHype` is the only way Hype is earned: each (person, action, ref) pays at most once, a
 * day's total is capped, and crossing a rank's line pays that rank's points and sends "You ranked up". Ranks
 * never go down. Buying points has nothing to do with any of this.
 */

const CONFIG_KEY = "ranksConfig";
const lagosDay = (d = new Date()) => new Date(+d + 3600_000).toISOString().slice(0, 10);

export async function getRanksConfig(): Promise<RanksConfig> {
  const row = await AppSetting.findById(CONFIG_KEY).lean();
  return ranksConfigOf(row?.value);
}

export async function setRanksConfig(input: z.infer<typeof ranksConfigSchema>): Promise<RanksConfig> {
  const now = await getRanksConfig();
  const next = ranksConfigOf({ ...now, ...input, actions: { ...now.actions, ...(input.actions ?? {}) } });
  await AppSetting.updateOne({ _id: CONFIG_KEY }, { $set: { value: next } }, { upsert: true });
  return next;
}

let indexReady: Promise<unknown> | null = null;
const isDup = (e: unknown) => (e as { code?: number })?.code === 11000;

/**
 * Give someone Hype for something they did. Quietly does nothing when it was already paid for this `ref`, the
 * action is worth 0, or they've hit today's cap (a part-award fills it up to the cap). Returns the Hype given.
 */
export async function awardHype(userId: Types.ObjectId, action: HypeAction, ref: string): Promise<number> {
  const c = await getRanksConfig();
  const worth = c.actions[action];
  if (!worth) return 0;
  // the unique index is the real guard; make sure it exists, and skip the obvious repeat early
  await (indexReady ??= HypeAward.init());
  if (await HypeAward.exists({ userId, action, ref })) return 0;
  const day = lagosDay();
  const today = await HypeAward.aggregate<{ n: number }>([{ $match: { userId, day } }, { $group: { _id: null, n: { $sum: "$amount" } } }]);
  const room = Math.max(0, c.dailyCap - (today[0]?.n ?? 0));
  const amount = Math.min(worth, room);
  if (!amount) return 0;
  try {
    await HypeAward.create({ userId, action, ref, amount, day });
  } catch (e) {
    if (isDup(e)) return 0;
    throw e;
  }
  const u = await User.findOneAndUpdate({ _id: userId }, { $inc: { hype: amount } }, { new: true }).select("hype rank").lean<Pick<IUser, "_id" | "hype" | "rank">>();
  if (u) await checkRankUp(u, c);
  return amount;
}

/** Crossed into a higher rank: record it (once, even with two awards racing), pay its points, say so. */
async function checkRankUp(u: Pick<IUser, "_id" | "hype" | "rank">, c: RanksConfig) {
  const from = u.rank ?? 1;
  const to = rankFor(c, u.hype ?? 0);
  if (to <= from) return;
  const claimed = await User.updateOne({ _id: u._id, rank: from }, { $set: { rank: to } });
  if (!claimed.modifiedCount) return;
  let points = 0;
  for (let r = from + 1; r <= to; r++) {
    const spec = c.ranks[r - 1];
    if (spec?.points) {
      points += spec.points;
      await earnPoints(u._id, spec.points, `Reached ${spec.name}`, `rank:${r}`);
    }
  }
  const name = c.ranks[to - 1]?.name ?? `Rank ${to}`;
  const next = c.ranks[to];
  notify(
    [u._id],
    {
      title: `You ranked up to ${name}`,
      body: `${points ? `+${points.toLocaleString("en-NG")} points to spend on frames and name styles. ` : ""}${next ? `${(next.hype - (u.hype ?? 0)).toLocaleString("en-NG")} Hype to ${next.name}.` : "That's the top rank."}`,
      data: { href: "/settings?tab=points" },
    },
    { category: "points", ref: `rank:${sid(u._id)}` },
  );
}

/** Where someone stands: rank, Hype, what the next rank needs, today's room, and how they earned it lately. */
export async function rankProgress(user: Pick<IUser, "_id" | "hype" | "rank">): Promise<RankProgressDTO> {
  const c = await getRanksConfig();
  const hype = user.hype ?? 0;
  const rank = Math.max(user.rank ?? 1, rankFor(c, hype));
  const [today, recent] = await Promise.all([
    HypeAward.aggregate<{ n: number }>([{ $match: { userId: user._id, day: lagosDay() } }, { $group: { _id: null, n: { $sum: "$amount" } } }]),
    HypeAward.find({ userId: user._id }).sort({ createdAt: -1 }).limit(15).lean<IHypeAward[]>(),
  ]);
  return {
    rank,
    name: c.ranks[rank - 1]?.name ?? `Rank ${rank}`,
    hype,
    current: c.ranks[rank - 1]?.hype ?? 0,
    next: c.ranks[rank] ? { name: c.ranks[rank].name, hype: c.ranks[rank].hype, points: c.ranks[rank].points } : null,
    todayLeft: Math.max(0, c.dailyCap - (today[0]?.n ?? 0)),
    recent: recent.map((r) => ({ action: r.action as HypeAction, amount: r.amount, createdAt: r.createdAt.toISOString() })),
  };
}
