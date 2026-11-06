import "server-only";
import type { Types } from "mongoose";
import { PLAN_NAMES } from "@/lib/plans";
import type { IUser } from "../models/User";
import { isSiteAdmin } from "../policies/hosting";
import { getPlanConfig, kliqueUsage, planOf, proHosts } from "./subscriptions.service";

/**
 * How many kliques someone may start a month and be in at once (their plan's limits, lib/plans), and whose kliques
 * come first in "Kliques for you" (Lite and Pro hosts). Site admins have no limits.
 */

const upgrade = (plan: string) => (plan === "pro" ? "" : ` Upgrade to ${plan === "free" ? "Lite or Pro" : "Pro"} for more.`);

/** Why they can't start another klique this month, in words (with how to get more); null when they can. */
export async function kliqueCreateBlock(viewer: IUser): Promise<string | null> {
  if (isSiteAdmin(viewer)) return null;
  const [config, usage] = await Promise.all([getPlanConfig(), kliqueUsage(viewer._id)]);
  const plan = planOf(viewer);
  const max = config.create[plan];
  if (usage.started < max) return null;
  return `You've started ${max} ${max === 1 ? "klique" : "kliques"} this month, the ${PLAN_NAMES[plan]} plan's limit.${upgrade(plan)}`;
}

/** Why they can't be in another klique right now, in words (with how to get more); null when they can. */
export async function kliqueJoinBlock(viewer: IUser): Promise<string | null> {
  if (isSiteAdmin(viewer)) return null;
  const [config, usage] = await Promise.all([getPlanConfig(), kliqueUsage(viewer._id)]);
  const plan = planOf(viewer);
  const max = config.join[plan];
  if (max === null || usage.inNow < max) return null;
  return `You're in ${max} ${max === 1 ? "klique" : "kliques"} already, the ${PLAN_NAMES[plan]} plan's limit. Leave one, or upgrade${plan === "free" ? " to Lite or Pro" : " to Pro"} to join more.`;
}

/** Hosts whose kliques are first in "Kliques for you" (Lite and Pro). */
export async function kliqueBoost(hostIds: Types.ObjectId[]): Promise<Set<string>> {
  return proHosts(hostIds);
}
