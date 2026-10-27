import { Types } from "mongoose";
import { REACTIONS, REACTION_IDS, type ReactionKind } from "@/lib/reactions";
import type { ReactionDTO } from "@/lib/types";
import { Reaction, type ReactionTarget } from "../models/Reaction";
import { sid } from "./helpers";

type Id = Types.ObjectId | string;
const ORDER = new Map<string, number>(REACTIONS.map((r, i) => [r.id, i]));

/**
 * Counts per kind for each message, plus whether `viewerId` used each one. Messages with no reactions map to [].
 * Kinds the app no longer offers are left out: their chip couldn't be tapped (the server refuses the kind).
 */
export async function summarizeReactions(targetType: ReactionTarget, ids: Id[], viewerId: Id | null): Promise<Map<string, ReactionDTO[]>> {
  const out = new Map<string, ReactionDTO[]>();
  if (!ids.length) return out;
  const rows = await Reaction.aggregate<{ _id: { t: Types.ObjectId; k: string }; n: number; mine: number }>([
    { $match: { targetType, targetId: { $in: ids.map((i) => new Types.ObjectId(sid(i))) }, kind: { $in: REACTION_IDS } } },
    { $group: { _id: { t: "$targetId", k: "$kind" }, n: { $sum: 1 }, mine: { $sum: viewerId ? { $cond: [{ $eq: ["$userId", new Types.ObjectId(sid(viewerId))] }, 1, 0] } : 0 } } },
  ]);
  for (const r of rows) {
    const key = sid(r._id.t);
    const list = out.get(key) ?? [];
    list.push({ kind: r._id.k as ReactionKind, count: r.n, mine: r.mine > 0 });
    out.set(key, list);
  }
  for (const list of out.values()) list.sort((a, b) => (ORDER.get(a.kind) ?? 99) - (ORDER.get(b.kind) ?? 99));
  return out;
}

/**
 * One reaction per person per message. Same kind again removes it; a different kind replaces it.
 * Returns the message's fresh summary.
 */
export async function toggleReaction(targetType: ReactionTarget, targetId: Id, userId: Id, kind: ReactionKind): Promise<ReactionDTO[]> {
  const who = { targetType, targetId: new Types.ObjectId(sid(targetId)), userId: new Types.ObjectId(sid(userId)) };
  const current = await Reaction.findOne(who).select("kind").lean<{ kind: string }>();
  if (current?.kind === kind) {
    await Reaction.deleteOne(who);
  } else {
    // upsert keyed on the unique (message, person) pair: atomic even when two taps race
    await Reaction.updateOne(who, { $set: { kind }, $setOnInsert: { createdAt: new Date() } }, { upsert: true }).catch((e) => {
      if ((e as { code?: number }).code !== 11000) throw e;
    });
  }
  return (await summarizeReactions(targetType, [targetId], userId)).get(sid(targetId)) ?? [];
}

export async function purgeReactions(targetType: ReactionTarget, ids: Id[]) {
  if (ids.length) await Reaction.deleteMany({ targetType, targetId: { $in: ids.map((i) => new Types.ObjectId(sid(i))) } });
}
