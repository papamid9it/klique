import "server-only";
import type { Types } from "mongoose";
import { PLAN_NAMES } from "@/lib/plans";
import type { IUser } from "../models/User";
import { isSiteAdmin } from "../policies/hosting";
import { getPlanConfig, kliqueUsage, planOf, proHosts } from "./subscriptions.service";
import { extraOf, moreFor } from "./limits.service";

/**
 * How many kliques someone may start a month and be in at once (their plan's limits, lib/plans), and whose kliques
 * come first in "Kliques for you" (Lite and Pro hosts). Site admins have no limits.
 */



/** Why they can't start another klique this month, in words (with how to get more); null when they can. */
export async function kliqueCreateBlock(viewer: IUser): Promise<string | null> {
  if (isSiteAdmin(viewer)) return null;
  const [config, usage] = await Promise.all([getPlanConfig(), kliqueUsage(viewer._id)]);
  const plan = planOf(viewer);
  // the plan's, plus any extra the Klique Team gave them this month
  const max = config.create[plan] + extraOf(viewer, "kliqueStart");
  if (usage.started < max) return null;
  return `You've started ${max} ${max === 1 ? "klique" : "kliques"} this month, your limit on ${PLAN_NAMES[plan]}. You can start more on the 1st.${moreFor(plan)}`;
}

/** Why they can't be in another klique right now, in words (with how to get more); null when they can. */
export async function kliqueJoinBlock(viewer: IUser): Promise<string | null> {
  if (isSiteAdmin(viewer)) return null;
  const [config, usage] = await Promise.all([getPlanConfig(), kliqueUsage(viewer._id)]);
  const plan = planOf(viewer);
  const base = config.join[plan];
  if (base === null) return null;
  const max = base + extraOf(viewer, "kliqueIn");
  if (usage.inNow < max) return null;
  return `You're in ${max} ${max === 1 ? "klique" : "kliques"} already, the most on ${PLAN_NAMES[plan]} at once. Leave one to join this.${moreFor(plan)}`;
}

/** Hosts whose kliques are first in "Kliques for you" (Lite and Pro). */
export async function kliqueBoost(hostIds: Types.ObjectId[]): Promise<Set<string>> {
  return proHosts(hostIds);
}
