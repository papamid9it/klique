import { dropFriendship } from "./friends.service";
import { FeedPost } from "../models/FeedPost";
import type { Types } from "mongoose";
import type { z } from "zod";
import type { BlockedUserDTO } from "@/lib/types";
import { badRequest, notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import { Channel, ChannelMember, ChannelMessage, type IChannel, type IChannelMessage } from "../models/Channel";
import { Community, type ICommunity } from "../models/Community";
import { Conversation } from "../models/Conversation";
import { Ad } from "../models/Ad";
import { Event, type IEvent } from "../models/Event";
import { Message, type IMessage } from "../models/Message";
import { Post, type IPost } from "../models/Post";
import { Block, Report } from "../models/Safety";
import { Subcommunity, type ISubcommunity } from "../models/Subcommunity";
import { User, type IUser } from "../models/User";
import { canSeeChannel, canViewEvent, spaceAccess } from "../policies/access";
import { toBrief } from "../serializers";
import type { reportSchema } from "../validators/schemas";
import { sid } from "./helpers";

/* ------------------------------ blocking ---------------------------- */

export async function blockUser(viewer: IUser, handle: string) {
  const target = await User.findOne({ handle }).select("_id").lean<{ _id: Types.ObjectId }>();
  if (!target) throw notFound("We couldn't find anyone with that handle.");
  if (sid(target._id) === sid(viewer._id)) throw badRequest("You can't block yourself.");
  await Block.updateOne({ blockerId: viewer._id, blockedId: target._id }, {}, { upsert: true });
  await dropFriendship(viewer._id, target._id); // blocking ends any friendship or pending request
  return { blocked: true };
}

export async function unblockUser(viewer: IUser, handle: string) {
  const target = await User.findOne({ handle }).select("_id").lean<{ _id: Types.ObjectId }>();
  if (!target) throw notFound("We couldn't find anyone with that handle.");
  await Block.deleteOne({ blockerId: viewer._id, blockedId: target._id });
  return { blocked: false };
}

export async function listBlocked(viewer: IUser): Promise<BlockedUserDTO[]> {
  const rows = await Block.find({ blockerId: viewer._id }).sort({ createdAt: -1 }).limit(200).lean<{ blockedId: Types.ObjectId; createdAt: Date }[]>();
  const users = await User.find({ _id: { $in: rows.map((r) => r.blockedId) } })
    .select("handle displayName avatarUrl avatarFrame nameEffect country city")
    .lean<IUser[]>();
  const map = new Map(users.map((u) => [sid(u._id), u]));
  return rows.flatMap((r) => {
    const u = map.get(sid(r.blockedId));
    return u ? [{ user: toBrief(u), blockedAt: r.createdAt.toISOString() }] : [];
  });
}

/* ------------------------------ reporting --------------------------- */

/**
 * You can only report what you are allowed to see. This also stops the report
 * endpoint being used to probe whether a private thing exists.
 */
export async function createReport(viewer: IUser, input: z.infer<typeof reportSchema>) {
  rateLimit(`report:${sid(viewer._id)}`, 10, 60 * 60 * 1000);
  let communityId: Types.ObjectId | null = null;

  switch (input.targetType) {
    case "user": {
      const u = await User.exists({ _id: input.targetId });
      if (!u) throw notFound();
      if (input.targetId === sid(viewer._id)) throw badRequest("You can't report yourself.");
      break;
    }
    case "post": {
      const post = await Post.findById(input.targetId).lean<IPost>();
      if (!post) throw notFound();
      const space = await loadSpace(post.communityId, post.subcommunityId);
      if (!(await spaceAccess(space, viewer)).canView) throw notFound();
      communityId = post.communityId;
      break;
    }
    case "ad": {
      if (!(await Ad.exists({ _id: input.targetId }))) throw notFound();
      break;
    }
    case "feedPost": {
      const post = await FeedPost.findById(input.targetId).select("communityId authorId").lean<{ communityId: Types.ObjectId; authorId: Types.ObjectId }>();
      if (!post) throw notFound();
      const space = await loadSpace(post.communityId, null);
      if (!(await spaceAccess(space, viewer)).canView) throw notFound();
      if (sid(post.authorId) === sid(viewer._id)) throw badRequest("You can't report yourself.");
      communityId = post.communityId;
      break;
    }
    case "event": {
      const event = await Event.findById(input.targetId).lean<IEvent>();
      if (!event || !(await canViewEvent(event, viewer))) throw notFound();
      communityId = event.communityId;
      break;
    }
    case "community": {
      const community = await Community.findById(input.targetId).lean<ICommunity>();
      if (!community) throw notFound();
      const access = await spaceAccess({ community, sub: null }, viewer);
      if (!access.canView && community.privacy === "private") throw notFound();
      communityId = community._id;
      break;
    }
    case "subcommunity": {
      const sub = await Subcommunity.findById(input.targetId).lean<ISubcommunity>();
      if (!sub) throw notFound();
      const space = await loadSpace(sub.communityId, sub._id);
      const access = await spaceAccess(space, viewer);
      if (!access.canView) throw notFound();
      communityId = sub.communityId;
      break;
    }
    case "channelMessage": {
      const msg = await ChannelMessage.findById(input.targetId).lean<IChannelMessage>();
      if (!msg || msg.deletedAt) throw notFound();
      const channel = await Channel.findById(msg.channelId).lean<IChannel>();
      if (!channel) throw notFound();
      const space = await loadSpace(channel.communityId, channel.subcommunityId ?? null);
      const access = await spaceAccess(space, viewer);
      const invited = channel.visibility === "invite" && !!(await ChannelMember.exists({ channelId: channel._id, userId: viewer._id }));
      if (!canSeeChannel(channel, access, invited)) throw notFound();
      if (sid(msg.authorId) === sid(viewer._id)) throw badRequest("You can't report yourself.");
      communityId = channel.communityId;
      break;
    }
    case "message": {
      const msg = await Message.findById(input.targetId).lean<IMessage>();
      if (!msg) throw notFound();
      // Only a participant can report a message — and not their own.
      const mine = await Conversation.exists({ _id: msg.conversationId, participants: viewer._id });
      if (!mine || sid(msg.senderId) === sid(viewer._id)) throw notFound();
      break;
    }
  }

  // a minor or something shared without consent: hidden at once until an admin decides, top of their queue;
  // anything from an 18+ community comes next
  const urgent = input.reason === "minor";
  if (urgent) await hidePendingReview(input.targetType, input.targetId);
  const priority = urgent ? 2 : communityId && (await Community.exists({ _id: communityId, adult: true })) ? 1 : 0;
  try {
    await Report.create({
      reporterId: viewer._id,
      targetType: input.targetType,
      targetId: input.targetId,
      communityId,
      reason: input.reason,
      details: input.details ?? "",
      priority,
    });
  } catch (err) {
    // Same person reporting the same thing twice while the first is still open: treat as success.
    if ((err as { code?: number }).code !== 11000) throw err;
  }
  return { reported: true };
}

/** Hide a reported post or message until an admin decides (dismissing the report shows it again). */
async function hidePendingReview(targetType: string, targetId: string) {
  const set = { $set: { hiddenAt: new Date() } };
  if (targetType === "feedPost") await FeedPost.updateOne({ _id: targetId, hiddenAt: null }, set);
  if (targetType === "channelMessage") await ChannelMessage.updateOne({ _id: targetId, hiddenAt: null }, set);
  if (targetType === "message") await Message.updateOne({ _id: targetId, hiddenAt: null }, set);
}

/** A dismissed report: whatever it hid comes back. */
export async function unhideAfterReview(targetType: string, targetId: Types.ObjectId) {
  const unset = { $set: { hiddenAt: null } };
  if (targetType === "feedPost") await FeedPost.updateOne({ _id: targetId }, unset);
  if (targetType === "channelMessage") await ChannelMessage.updateOne({ _id: targetId }, unset);
  if (targetType === "message") await Message.updateOne({ _id: targetId }, unset);
}

async function loadSpace(communityId: Types.ObjectId, subId: Types.ObjectId | null) {
  const community = await Community.findById(communityId).lean<ICommunity>();
  if (!community) throw notFound();
  const sub = subId ? await Subcommunity.findById(subId).lean<ISubcommunity>() : null;
  if (subId && !sub) throw notFound();
  return { community, sub };
}
