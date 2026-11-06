import "server-only";
import type { Types } from "mongoose";
import { LIMITS } from "@/lib/constants";
import { PLAN_NAMES, type PlanId } from "@/lib/plans";
import { ApiError } from "../http/errors";
import { Community } from "../models/Community";
import { Membership } from "../models/Membership";
import { Subcommunity } from "../models/Subcommunity";
import type { IUser } from "../models/User";
import { isSiteAdmin } from "../policies/hosting";
import { kliqueId } from "./klique-id";
import { getPlanConfig, planOf } from "./subscriptions.service";

/**
 * Plan limits on communities (lib/plans, Admin → Plans): how many you may own, how many you may be in (Klique HQ
 * doesn't count). Site admins have none.
 * Going down a plan never takes anything away: communities, memberships and groups you already have keep working
 * for everyone in them; you just can't create or join more until you're back under your plan's limit.
 */

const more = (plan: PlanId) => (plan === "pro" ? "" : ` Upgrade to ${plan === "free" ? "Lite or Pro" : "Pro"} for more: see /pricing.`);
const keep = " Everything you already have keeps working.";
const limit = (message: string) => new ApiError(403, message, { code: "plan_limit" });

async function planAndConfig(viewer: IUser) {
  return { plan: planOf(viewer), c: await getPlanConfig() };
}

/** Throws when they already own as many communities as their plan allows. */
export async function assertCanCreateCommunity(viewer: IUser) {
  if (isSiteAdmin(viewer)) return;
  const { plan, c } = await planAndConfig(viewer);
  const max = c.communitiesCreate[plan];
  const owned = await Community.countDocuments({ ownerId: viewer._id, official: { $ne: true } });
  if (owned >= max) throw limit(`You own ${owned} ${owned === 1 ? "community" : "communities"}; ${PLAN_NAMES[plan]} allows ${max}.${keep}${more(plan)}`);
}

/** Throws when they're already in as many communities as their plan allows (Klique HQ doesn't count). */
export async function assertCanJoinCommunity(viewer: IUser, communityId: Types.ObjectId) {
  if (isSiteAdmin(viewer)) return;
  const hq = await kliqueId();
  if (hq && String(hq) === String(communityId)) return;
  const { plan, c } = await planAndConfig(viewer);
  const max = c.communitiesJoin[plan];
  const inNow = await Membership.countDocuments({ userId: viewer._id, subcommunityId: null, status: "active", ...(hq ? { communityId: { $ne: hq } } : {}) });
  if (inNow >= max) throw limit(`You're in ${inNow} communities; ${PLAN_NAMES[plan]} allows ${max}. Leave one to join another.${more(plan)}`);
}

/** Throws when the community already has all the groups it can have. */
export async function assertCanCreateGroup(communityId: Types.ObjectId) {
  const max = LIMITS.groupsPerCommunity;
  const have = await Subcommunity.countDocuments({ communityId });
  if (have >= max) throw new ApiError(409, `A community can have ${max} groups, and this one has ${have}. Delete one to start another.`, { code: "group_limit" });
}
