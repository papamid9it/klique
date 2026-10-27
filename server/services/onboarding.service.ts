import "server-only";
import type { Types } from "mongoose";
import type { CommunityCardDTO, OnboardingDTO } from "@/lib/types";
import { badRequest } from "../http/errors";
import { LIMITS } from "@/lib/constants";
import { Community, type ICommunity } from "../models/Community";
import { Membership } from "../models/Membership";
import { User, type IUser } from "../models/User";
import { toCommunityCards } from "../serializers";
import { kliqueId } from "./klique-id";

/**
 * Joining Klique, step by step (/welcome): pick at least 3 categories, then join at least 2 communities from
 * suggestions in those categories (your city first, then your country, then anywhere). Klique itself is
 * automatic and doesn't count. If there aren't 2 public communities left to join, they can finish anyway.
 * Until it's done the app sends them back here, existing accounts included (once).
 */

export const MIN_INTERESTS = LIMITS.minInterests;
export const MIN_COMMUNITIES = 2;
const SUGGEST = 12;

/** Top-level communities they're in, Klique aside. */
async function joinedIds(viewer: IUser): Promise<Types.ObjectId[]> {
  const k = await kliqueId();
  const rows = await Membership.find({ userId: viewer._id, subcommunityId: null, status: "active", ...(k ? { communityId: { $ne: k } } : {}) })
    .select("communityId")
    .lean<{ communityId: Types.ObjectId }[]>();
  return rows.map((r) => r.communityId);
}

/** Closest first: same city, then same country, then anywhere; busiest first within each. */
function byPlace(viewer: IUser) {
  const rank = (c: ICommunity) => (c.country === (viewer.country ?? "NG") ? (c.city === viewer.city ? 0 : 1) : 2);
  return (a: ICommunity, b: ICommunity) => rank(a) - rank(b) || b.memberCount - a.memberCount;
}

export async function onboardingState(viewer: IUser): Promise<OnboardingDTO> {
  const k = await kliqueId();
  const joined = await joinedIds(viewer);
  const notThese = { _id: { $nin: [...joined, ...(k ? [k] : [])] } };
  // public communities they could join right now (banned ones excluded)
  const banned = (await Membership.find({ userId: viewer._id, subcommunityId: null, status: "banned" }).select("communityId").lean<{ communityId: Types.ObjectId }[]>()).map((m) => m.communityId);
  const open = { privacy: "public" as const, official: { $ne: true }, $and: [notThese, { _id: { $nin: banned } }] };

  const interests = viewer.interests ?? [];
  const matching = interests.length ? await Community.find({ ...open, interest: { $in: interests } }).limit(200).lean<ICommunity[]>() : [];
  let picks = matching.sort(byPlace(viewer)).slice(0, SUGGEST);
  let widened = false;
  // too few in their categories: widen to any public community
  if (picks.length < MIN_COMMUNITIES + 2) {
    const more = await Community.find({ ...open, _id: { $nin: [...joined, ...(k ? [k] : []), ...banned, ...picks.map((c) => c._id)] } }).limit(200).lean<ICommunity[]>();
    if (more.length) widened = picks.length < MIN_COMMUNITIES;
    picks = [...picks, ...more.sort(byPlace(viewer))].slice(0, SUGGEST);
  }
  // also show the ones they've already joined (so the count makes sense), first
  const already = joined.length ? await Community.find({ _id: { $in: joined } }).lean<ICommunity[]>() : [];
  const cards: CommunityCardDTO[] = await toCommunityCards([...already, ...picks], viewer);

  // can they finish? enough joined, or nothing (enough) left to join
  const joinable = await Community.countDocuments(open);
  const needed = Math.min(MIN_COMMUNITIES, joined.length + joinable);
  return {
    interests,
    minInterests: MIN_INTERESTS,
    joined: joined.length,
    needed,
    widened,
    suggestions: cards,
    done: !!viewer.onboardedAt,
  };
}

export async function setOnboardingInterests(viewer: IUser, interests: string[]): Promise<OnboardingDTO> {
  const unique = [...new Set(interests)];
  if (unique.length < MIN_INTERESTS) throw badRequest(`Pick at least ${MIN_INTERESTS}.`);
  await User.updateOne({ _id: viewer._id }, { $set: { interests: unique } });
  return onboardingState({ ...viewer, interests: unique } as IUser);
}

export async function completeOnboarding(viewer: IUser): Promise<OnboardingDTO> {
  if ((viewer.interests ?? []).length < MIN_INTERESTS) throw badRequest(`Pick at least ${MIN_INTERESTS} categories first.`);
  const state = await onboardingState(viewer);
  if (state.joined < state.needed) throw badRequest(`Join at least ${state.needed} ${state.needed === 1 ? "community" : "communities"} to continue.`);
  const now = new Date();
  await User.updateOne({ _id: viewer._id, onboardedAt: null }, { $set: { onboardedAt: now } });
  return { ...state, done: true };
}
