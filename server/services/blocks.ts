import type { Types } from "mongoose";
import { Block } from "../models/Safety";
import { Membership } from "../models/Membership";

type Id = Types.ObjectId | string;

export async function blockedByMe(viewerId: Id, otherId: Id): Promise<boolean> {
  return !!(await Block.exists({ blockerId: viewerId, blockedId: otherId }));
}

/** True if either person has blocked the other. */
export async function blockedEitherWay(a: Id, b: Id): Promise<boolean> {
  return !!(await Block.exists({
    $or: [
      { blockerId: a, blockedId: b },
      { blockerId: b, blockedId: a },
    ],
  }));
}

/** Ids the viewer has blocked OR who have blocked the viewer — hidden from search and people lists. */
export async function hiddenUserIds(viewerId: Id | null): Promise<Types.ObjectId[]> {
  if (!viewerId) return [];
  const rows = await Block.find({ $or: [{ blockerId: viewerId }, { blockedId: viewerId }] })
    .select("blockerId blockedId")
    .lean<{ blockerId: Types.ObjectId; blockedId: Types.ObjectId }[]>();
  const me = String(viewerId);
  return rows.map((r) => (String(r.blockerId) === me ? r.blockedId : r.blockerId));
}

/** Do the two people share at least one community (not subcommunity) membership? */
export async function shareCommunity(a: Id, b: Id): Promise<boolean> {
  const mine = await Membership.find({ userId: a, status: "active", subcommunityId: null })
    .select("communityId")
    .lean<{ communityId: Types.ObjectId }[]>();
  if (!mine.length) return false;
  return !!(await Membership.exists({
    userId: b,
    status: "active",
    subcommunityId: null,
    communityId: { $in: mine.map((m) => m.communityId) },
  }));
}
