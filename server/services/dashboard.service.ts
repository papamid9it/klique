import "server-only";
import type { Types } from "mongoose";
import type { CommunityDashboardDTO } from "@/lib/types";
import { forbidden } from "../http/errors";
import { FeedPost } from "../models/FeedPost";
import { Membership } from "../models/Membership";
import { MembershipRequest } from "../models/MembershipRequest";
import { Event } from "../models/Event";
import type { IUser } from "../models/User";
import { isSiteAdmin } from "../policies/hosting";
import { pendingEvents } from "./events.service";
import { resolveSpaceFor } from "./spaces.service";

const DAY = 24 * 60 * 60 * 1000;
const lagosDay = (d: Date) => new Date(+d + 3600_000).toISOString().slice(0, 10);

/**
 * The owner's dashboard for a community (owners, admins and site admins): members and how fast it's growing,
 * what's waiting on them (members' events to approve, join requests), and this week's activity. Money (donations,
 * contributions, payouts) joins it once Paystack payouts are on.
 */
export async function communityDashboard(viewer: IUser, slug: string): Promise<CommunityDashboardDTO> {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (!access.canManage && !isSiteAdmin(viewer)) throw forbidden("Only this community's owner and admins see its dashboard.");
  const c = space.community;
  const now = Date.now();
  const since30 = new Date(now - 30 * DAY);
  const since7 = new Date(now - 7 * DAY);
  const where = { communityId: c._id as Types.ObjectId, subcommunityId: null, status: "active" as const };

  const [joins, pending, requests, posts7, upcoming] = await Promise.all([
    Membership.aggregate<{ _id: string; n: number }>([
      { $match: { ...where, createdAt: { $gte: since30 } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Africa/Lagos" } }, n: { $sum: 1 } } },
    ]),
    pendingEvents(viewer, c._id),
    c.privacy === "private" ? MembershipRequest.countDocuments({ communityId: c._id, subcommunityId: null, status: "pending" }) : Promise.resolve(0),
    FeedPost.countDocuments({ communityId: c._id, createdAt: { $gte: since7 } }),
    Event.countDocuments({ communityId: c._id, cancelled: false, review: null, startsAt: { $gte: new Date(now) } }),
  ]);

  const byDay = new Map(joins.map((j) => [j._id, j.n]));
  const days = Array.from({ length: 30 }, (_, i) => lagosDay(new Date(now - (29 - i) * DAY)));
  const perDay = days.map((day) => ({ day, joined: byDay.get(day) ?? 0 }));
  const new30 = perDay.reduce((t, d) => t + d.joined, 0);
  const new7 = perDay.slice(-7).reduce((t, d) => t + d.joined, 0);

  return {
    members: { total: c.memberCount, new7, new30, perDay },
    pendingEvents: pending,
    pendingRequests: requests,
    activity: { posts7, upcomingEvents: upcoming },
  };
}
