import "server-only";
import { Types } from "mongoose";
import { z } from "zod";
import { forbidden, notFound } from "../http/errors";
import { Channel, type IChannel } from "../models/Channel";
import { Community, type ICommunity } from "../models/Community";
import { Event, type IEvent } from "../models/Event";
import { User, type IUser } from "../models/User";
import { appUrl } from "../env";
import { can } from "../policies/access";
import { isSiteAdmin } from "../policies/hosting";
import { postWebhookMessage } from "./channels.service";
import { when } from "./events.service";
import { resolveSpaceFor } from "./spaces.service";

/**
 * Event reminders: a bot Klique runs for a community. Every Monday morning (Lagos time) it posts that week's events in a
 * room the owner picked, so members see what's coming without opening Events. A week with nothing on posts nothing.
 */

export const eventDigestSchema = z.object({ channelId: z.string().regex(/^[a-f0-9]{24}$/i).nullable() });

async function manage(viewer: IUser, slug: string) {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (space.sub) throw forbidden("Event reminders belong to the community.");
  if (!access.canManage && !can(access, "manageWebhooks") && !isSiteAdmin(viewer)) throw forbidden("Only owners and admins can set up bots.");
  return space.community;
}

export async function getEventDigest(viewer: IUser, slug: string): Promise<{ channelId: string | null; lastAt: string | null }> {
  const c = await manage(viewer, slug);
  return { channelId: c.eventDigest?.channelId ? String(c.eventDigest.channelId) : null, lastAt: c.eventDigest?.lastAt?.toISOString() ?? null };
}

export async function setEventDigest(viewer: IUser, slug: string, input: z.infer<typeof eventDigestSchema>) {
  const c = await manage(viewer, slug);
  let channelId: Types.ObjectId | null = null;
  if (input.channelId) {
    const ch = await Channel.findOne({ _id: input.channelId, communityId: c._id, subcommunityId: null }).select("_id").lean<{ _id: Types.ObjectId }>();
    if (!ch) throw notFound("That room isn't in this community.");
    channelId = ch._id;
  }
  await Community.updateOne({ _id: c._id }, { $set: { eventDigest: channelId ? { channelId, lastAt: c.eventDigest?.lastAt ?? null } : null } });
  return getEventDigest(viewer, slug);
}

const DAY = 86_400_000;
/** Monday, 9am or later, in Lagos */
function mondayMorning(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "short", hour: "numeric", hour12: false }).formatToParts(now);
  const day = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  return day === "Mon" && hour >= 9;
}

/** Runs with the reminders job (every few minutes): each community's post, once on Monday morning. */
export async function runEventDigests(now = new Date()): Promise<number> {
  if (!mondayMorning(now)) return 0;
  const due = await Community.find({ "eventDigest.channelId": { $ne: null }, $or: [{ "eventDigest.lastAt": null }, { "eventDigest.lastAt": { $lt: new Date(+now - 2 * DAY) } }] }).limit(25).lean<ICommunity[]>();
  let posted = 0;
  for (const c of due) {
    // claimed first, so two runs can't both post
    const claimed = await Community.updateOne({ _id: c._id, "eventDigest.lastAt": c.eventDigest?.lastAt ?? null }, { $set: { "eventDigest.lastAt": now } });
    if (!claimed.modifiedCount) continue;
    try {
      const [channel, owner, events] = await Promise.all([
        Channel.findOne({ _id: c.eventDigest!.channelId, communityId: c._id }).lean<IChannel>(),
        User.findById(c.ownerId).lean<IUser>(),
        Event.find({ communityId: c._id, cancelled: false, review: null, startsAt: { $gte: now, $lt: new Date(+now + 7 * DAY) } }).sort({ startsAt: 1 }).limit(10).lean<IEvent[]>(),
      ]);
      if (!channel || !owner || !events.length) continue;
      const lines = events.map((e) => `• ${when(e.startsAt, e.timeZone)} · ${e.title}${e.online ? " (online)" : e.venue ? `, ${e.venue}` : ""}\n  ${appUrl()}/events/${String(e._id)}`);
      const body = `This week in ${c.name}:\n${lines.join("\n")}`;
      const bot = { _id: c._id, name: "Event reminders", avatarUrl: null, allowMassMention: false };
      await postWebhookMessage(bot, owner, channel, body.slice(0, 1900));
      posted++;
    } catch (e) {
      console.warn("[event digest]", String(c._id), (e as Error).message);
    }
  }
  return posted;
}
