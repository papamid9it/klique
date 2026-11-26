import "server-only";
import type { Types } from "mongoose";
import { PLAN_NAMES, type PlanId } from "@/lib/plans";
import type { LimitsDTO } from "@/lib/types";
import { badRequest, notFound } from "../http/errors";
import { Community } from "../models/Community";
import { Membership } from "../models/Membership";
import { User, type IUser } from "../models/User";
import { isSiteAdmin } from "../policies/hosting";
import { logAction } from "./admin.service";
import { sid } from "./helpers";
import { kliqueId } from "./klique-id";
import { notify } from "./push.service";
import { getPlanConfig, kliqueUsage, monthStart, planOf } from "./subscriptions.service";

/**
 * Plan limits as people see them, and the extras a site admin can give someone on top (Admin → People). An extra lasts
 * a month from when it's given: extra kliques can be used for that month; extra communities must be made or joined in
 * that month, and what was made or joined with them stays (limits are only checked when you make or join).
 */

export type ExtraKind = "kliqueStart" | "kliqueIn" | "communityCreate" | "communityJoin";
export const EXTRA_KINDS: ExtraKind[] = ["kliqueStart", "kliqueIn", "communityCreate", "communityJoin"];
const EXTRA_LABEL: Record<ExtraKind, (n: number) => string> = {
  kliqueStart: (n) => `${n} extra ${n === 1 ? "klique" : "kliques"} to start`,
  kliqueIn: (n) => `${n} more ${n === 1 ? "klique" : "kliques"} to be in at once`,
  communityCreate: (n) => `${n} more ${n === 1 ? "community" : "communities"} to make`,
  communityJoin: (n) => `${n} more ${n === 1 ? "community" : "communities"} to join`,
};
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/** An extra still running for this person (0 when none, or it's over). */
export function extraOf(u: Pick<IUser, "extraLimits">, kind: ExtraKind): number {
  const e = u.extraLimits?.[kind];
  return e && +new Date(e.until) > Date.now() ? e.n : 0;
}

/** What to do for more, by plan: Free → Lite or Pro, Lite → Pro, Pro → ask the Klique Team (Help & feedback). */
export function moreFor(plan: PlanId): string {
  return plan === "free" ? " Get Lite or Pro for more." : plan === "lite" ? " Get Pro for more." : " Need more? Ask the Klique Team in Help & feedback.";
}
export const planName = (plan: PlanId) => PLAN_NAMES[plan];

/** The start of next month (Lagos), when the monthly klique starts come back. */
function nextMonth(): Date {
  const start = monthStart();
  const d = new Date(+start + 40 * 24 * 60 * 60 * 1000);
  return monthStart(d);
}

/** What someone may still do: kliques and communities, by their plan plus extras. */
export async function limitsFor(viewer: IUser): Promise<LimitsDTO> {
  const plan = planOf(viewer);
  const [c, usage, hq] = await Promise.all([getPlanConfig(), kliqueUsage(viewer._id), kliqueId()]);
  const [owned, joined] = await Promise.all([
    Community.countDocuments({ ownerId: viewer._id, official: { $ne: true } }),
    Membership.countDocuments({ userId: viewer._id, subcommunityId: null, status: "active", ...(hq ? { communityId: { $ne: hq } } : {}) }),
  ]);
  const inMax = c.join[plan];
  return {
    plan,
    nextPlan: plan === "free" ? "lite" : plan === "lite" ? "pro" : null,
    unlimited: isSiteAdmin(viewer),
    kliques: { started: usage.started, startMax: c.create[plan] + extraOf(viewer, "kliqueStart"), inNow: usage.inNow, inMax: inMax === null ? null : inMax + extraOf(viewer, "kliqueIn"), resetsAt: nextMonth().toISOString() },
    communities: { owned, ownMax: c.communitiesCreate[plan] + extraOf(viewer, "communityCreate"), joined, joinMax: c.communitiesJoin[plan] + extraOf(viewer, "communityJoin") },
    extras: EXTRA_KINDS.flatMap((kind) => {
      const e = viewer.extraLimits?.[kind];
      return e && +new Date(e.until) > Date.now() ? [{ kind, n: e.n, until: new Date(e.until).toISOString() }] : [];
    }),
  };
}

/**
 * A site admin gives someone extra (on top of their plan) for a month, or takes it away (n = 0). They're told; it's
 * in the audit log.
 */
export async function setExtraLimit(admin: IUser, userId: string, kind: ExtraKind, n: number) {
  const u = await User.findById(userId).select("_id handle displayName").lean<Pick<IUser, "_id" | "handle" | "displayName">>();
  if (!u) throw notFound("We couldn't find that person.");
  if (!EXTRA_KINDS.includes(kind)) throw badRequest("Pick what to give.");
  const until = new Date(Date.now() + MONTH_MS);
  await User.updateOne({ _id: u._id }, n > 0 ? { $set: { [`extraLimits.${kind}`]: { n, until } } } : { $unset: { [`extraLimits.${kind}`]: 1 } });
  await logAction(admin, n > 0 ? "user.extra_limit" : "user.extra_limit_remove", "user", u._id as Types.ObjectId, `@${u.handle}`, n > 0 ? `${EXTRA_LABEL[kind](n)} until ${until.toISOString().slice(0, 10)}` : kind, `/?profile=${u.handle}`);
  if (n > 0) {
    const when = until.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Africa/Lagos" });
    notify([u._id], { title: "A gift from the Klique Team", body: `You have ${EXTRA_LABEL[kind](n)}, until ${when}.`, data: { href: kind.startsWith("klique") ? "/kliques" : "/communities" } }, { category: "admin", ref: `extra:${sid(u._id)}:${kind}` });
  }
  return { kind, n: n > 0 ? n : 0, until: n > 0 ? until.toISOString() : null };
}
