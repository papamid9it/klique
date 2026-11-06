import "server-only";
import { Types } from "mongoose";
import type { GrowthStatsDTO } from "@/lib/types";
import { remember } from "../cache";
import { forbidden } from "../http/errors";
import { Channel, ChannelMessage } from "../models/Channel";
import { User, type IUser } from "../models/User";
import { isSiteAdmin } from "../policies/hosting";
import { loadBriefs } from "../serializers";
import { resolveSpaceFor } from "./spaces.service";
import { planOf } from "./subscriptions.service";

const DAY = 86_400_000;
const LAGOS = "Africa/Lagos";
const NOTHING: GrowthStatsDTO = { tier: "none", activeMembers: 0, activeShare: 0, messages7: 0, messagesLast7: 0, topChannels: [] };
const lagosDay = (d: Date) => new Date(+d + 3_600_000).toISOString().slice(0, 10);

/**
 * Growth stats, for a community's owner and admins, by the owner's plan (a site admin always sees everything). Only
 * counts: nobody's words are read, and a group's private chat isn't included. Worked out at most every 10 minutes.
 */
export async function communityGrowth(viewer: IUser, slug: string): Promise<GrowthStatsDTO> {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (!access.canManage && !isSiteAdmin(viewer)) throw forbidden("Only this community's owner and admins see its stats.");
  const c = space.community;
  const owner = await User.findById(c.ownerId).select("plan planUntil email").lean<Pick<IUser, "plan" | "planUntil" | "email">>();
  const plan = isSiteAdmin(viewer) ? "pro" : owner ? planOf(owner) : "free";
  if (plan === "free") return NOTHING;
  return remember("growth", `${String(c._id)}:${plan}`, 600, () => work(c._id, c.memberCount, plan));
}

async function work(communityId: Types.ObjectId, memberCount: number, plan: "lite" | "pro"): Promise<GrowthStatsDTO> {
  const now = Date.now();
  const channels = await Channel.find({ communityId, subcommunityId: null, topicId: null, parentChannelId: null }).select("name").lean<{ _id: Types.ObjectId; name: string }[]>();
  const since = (days: number) => Types.ObjectId.createFromTime(Math.floor((now - days * DAY) / 1000));
  const [row] = await ChannelMessage.aggregate<{
    authors: { _id: Types.ObjectId; n: number }[];
    channels: { _id: Types.ObjectId; n: number }[];
    week: { n: number }[];
    lastWeek: { n: number }[];
    days: { _id: string; n: number }[];
    hours: { _id: number; n: number }[];
    weekdays: { _id: number; n: number }[];
  }>([
    // the indexes on channel and _id: an _id starts with the moment it was made
    { $match: { channelId: { $in: channels.map((x) => x._id) }, _id: { $gte: since(30) }, deletedAt: null } },
    // only what's counted: every message in 30 days goes through this
    { $project: { authorId: 1, channelId: 1, at: { $toDate: "$_id" } } },
    {
      $facet: {
        authors: [{ $group: { _id: "$authorId", n: { $sum: 1 } } }, { $sort: { n: -1 } }],
        channels: [{ $group: { _id: "$channelId", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: plan === "pro" ? 5 : 3 }],
        week: [{ $match: { _id: { $gte: since(7) } } }, { $count: "n" }],
        lastWeek: [{ $match: { _id: { $gte: since(14), $lt: since(7) } } }, { $count: "n" }],
        days: [{ $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$at", timezone: LAGOS } }, n: { $sum: 1 } } }],
        hours: [{ $group: { _id: { $hour: { date: "$at", timezone: LAGOS } }, n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 3 }],
        weekdays: [{ $group: { _id: { $subtract: [{ $dayOfWeek: { date: "$at", timezone: LAGOS } }, 1] }, n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 3 }],
      },
    },
  ]);
  // bots don't count as members being active
  const bots = new Set((await User.find({ _id: { $in: row.authors.map((a) => a._id) }, bot: { $ne: null } }).select("_id").lean<{ _id: Types.ObjectId }[]>()).map((u) => String(u._id)));
  const people = row.authors.filter((a) => !bots.has(String(a._id)));
  const nameOf = new Map(channels.map((x) => [String(x._id), x.name]));
  const base: GrowthStatsDTO = {
    tier: plan,
    activeMembers: people.length,
    activeShare: memberCount ? Math.min(100, Math.round((people.length / memberCount) * 100)) : 0,
    messages7: row.week[0]?.n ?? 0,
    messagesLast7: row.lastWeek[0]?.n ?? 0,
    topChannels: row.channels.map((x) => ({ name: nameOf.get(String(x._id)) ?? "channel", messages: x.n })),
  };
  if (plan === "lite") return base;
  const byDay = new Map(row.days.map((d) => [d._id, d.n]));
  const top = people.slice(0, 5);
  const briefs = await loadBriefs(top.map((a) => a._id));
  return {
    ...base,
    messagesPerDay: Array.from({ length: 30 }, (_, i) => {
      const day = lagosDay(new Date(now - (29 - i) * DAY));
      return { day, count: byDay.get(day) ?? 0 };
    }),
    bestHours: row.hours.map((h) => ({ hour: h._id, messages: h.n })),
    bestDays: row.weekdays.map((d) => ({ day: d._id, messages: d.n })),
    topMembers: top.flatMap((a) => {
      const user = briefs.get(String(a._id));
      return user ? [{ user, messages: a.n }] : [];
    }),
  };
}
