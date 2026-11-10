import { VOICE_ENABLED, slowModeLabel } from "@/lib/constants";
import { isSiteAdmin } from "../policies/hosting";
import { SignJWT } from "jose";
import { deleteUploads } from "./media.service";
import { assertStickerUrl, noteStickerUse } from "./stickers.service";
import { livekitConfig } from "../env";
import { previewOf, toReplyRef } from "./replies";
import { type ReactionKind } from "@/lib/reactions";
import { GOOD_REACTIONS } from "@/lib/points";
import { summarizeReactions, toggleReaction } from "./reactions";
import { Types } from "mongoose";
import type { z } from "zod";
import type {
  ReactionDTO,
  ChannelCategoryDTO,
  ChannelDTO,
  ChannelGroupDTO,
  ChannelMessageDTO,
  VoiceJoinDTO,
  ChannelsDTO,
  ChatPage,
  StaffDTO,
  UserBrief,
  ThreadDTO,
} from "@/lib/types";
import { ApiError, badRequest, forbidden, notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import {
  Channel,
  ChannelCategory,
  ChannelMember,
  ChannelMessage,
  ChannelRead,
  ensureChannelIndexes,
  type IChannel,
  type IChannelCategory,
  type RoleOverride,
  type IChannelMember,
  type IChannelMessage,
  type IChannelRead,
} from "../models/Channel";
import { Community } from "../models/Community";
import { Membership, type IMembership } from "../models/Membership";
import { Subcommunity, type ISubcommunity } from "../models/Subcommunity";
import { User, type IUser } from "../models/User";
import { assertNotPostBanned,
  assertCanView,
  canPostInChannel,
  canSeeChannel,
  subAccessFrom,
  type Space,
  type SpaceAccess,
} from "../policies/access";
import { loadBriefs, toBrief } from "../serializers";
import type { categorySchema, categoryUpdateSchema, channelCreateSchema, channelUpdateSchema, chatListQuery, roleOverridesSchema } from "../validators/schemas";
import { CommunityRole } from "../models/CommunityRole";
import { hiddenUserIds } from "./blocks";
import { escapeRegex, sid, slugify } from "./helpers";
import { awardPointsLater } from "./points.service";
import { notify } from "./push.service";
import { emitChannel, emitTopic } from "./realtime";
import { Board, Topic, TopicComment, TopicFollow, type ITopic, type ITopicComment } from "../models/Topic";
import { mentionBriefs, resolveMentions } from "./mentions";
import { extractMassMention } from "@/lib/mentions";
import { createPoll, deletePoll, pollPreview } from "./polls.service";
import type { pollInput } from "../validators/schemas";
import { logModDelete } from "./admin-audit";
import { Webhook } from "../models/Webhook";
import { assertNotTimedOut, assertPerm, can } from "../policies/access";
import { standings } from "./roles.service";
import { cardPreview, cardWords, type CardButton, type MessageCard } from "@/lib/cards";
import { checkAutoMod } from "./automod.service";
import { normalizeEmoji } from "./emoji.service";
import { EMOJI_TOKEN } from "@/lib/emoji-tokens";

const MAX_CHANNELS = 50;
const MAX_CATEGORIES = 15;
const MAX_PINS = 25;
const PAGE = 50;
const NEW_LIMIT = 100;
const ZERO_ID = new Types.ObjectId("000000000000000000000000");

const scopeOf = (space: Space) => ({ communityId: space.community._id, subcommunityId: space.sub?._id ?? null });

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

const DEFAULTS: { category: string; channels: { name: string; topic: string; type: IChannel["type"] }[] }[] = [
  { category: "Info", channels: [{ name: "announcements", topic: "Official updates from the admins.", type: "announcement" }] },
  {
    category: "Chat",
    channels: [
      { name: "general", topic: "Say hi, talk about anything.", type: "text" },
      { name: "meetups", topic: "Plan sessions, rides and hangs.", type: "text" },
    ],
  },
];

/**
 * A community gets a starter set of channels exactly once. `channelsReady` is flipped atomically,
 * so concurrent requests can't double-seed and deleting channels never brings them back.
 */
export async function ensureDefaultChannels(communityId: Types.ObjectId, ownerId: Types.ObjectId) {
  await ensureChannelIndexes();
  const won = await Community.updateOne({ _id: communityId, channelsReady: { $ne: true } }, { channelsReady: true });
  if (!won.modifiedCount) return;
  let position = 0;
  for (const group of DEFAULTS) {
    const cat = await ChannelCategory.findOneAndUpdate({ communityId, name: group.category }, { $setOnInsert: { position: position++ } }, { upsert: true, returnDocument: "after" });
    let i = 0;
    for (const ch of group.channels) {
      await Channel.updateOne(
        { communityId, subcommunityId: null, slug: slugify(ch.name) },
        { $setOnInsert: { name: ch.name, topic: ch.topic, type: ch.type, visibility: "all", categoryId: cat._id, position: i++, createdById: ownerId } },
        { upsert: true },
      );
    }
  }
}

/** A group starts with #announcements and #general (no categories inside groups). */
export async function ensureDefaultGroupChannels(subId: Types.ObjectId, communityId: Types.ObjectId, ownerId: Types.ObjectId) {
  await ensureChannelIndexes();
  const won = await Subcommunity.updateOne({ _id: subId, channelsReady: { $ne: true } }, { channelsReady: true });
  if (!won.modifiedCount) return;
  const list = [
    { name: "announcements", topic: "Updates from the group's admins.", type: "announcement" as const },
    { name: "general", topic: "Chat with the group.", type: "text" as const },
  ];
  for (const [position, ch] of list.entries()) {
    await Channel.updateOne(
      { communityId, subcommunityId: subId, slug: slugify(ch.name) },
      { $setOnInsert: { name: ch.name, topic: ch.topic, type: ch.type, visibility: "all", categoryId: null, position, createdById: ownerId } },
      { upsert: true },
    );
  }
}

/* ------------------------------------------------------------------ */
/* Serializers                                                         */
/* ------------------------------------------------------------------ */

const toOverrides = (list: RoleOverride[] | undefined) => (list ?? []).map((o) => ({ roleId: sid(o.roleId), view: o.view ?? null, post: o.post ?? null }));
const toCategory = (c: IChannelCategory): ChannelCategoryDTO => ({ id: sid(c._id), name: c.name, position: c.position, ...(c.overrides?.length ? { overrides: toOverrides(c.overrides) } : {}) });

interface DtoCtx {
  access: SpaceAccess;
  readBy: Map<string, IChannelRead>;
  invited: Set<string>;
  mentionCounts: Map<string, number>;
  /** unread messages per channel (not counting your own), capped at 99 */
  unreadCounts?: Map<string, number>;
  memberCounts?: Map<string, number>;
  /** a site admin: never held back by slow mode */
  siteAdmin?: boolean;
  /** the community lets members use @everyone / @here (owners and admins always can) */
  membersMass?: boolean;
  /** how many people are in the space (for "This will notify N people") */
  audience?: number;
}

/** Owners, admins and site admins post without waiting. */
const slowModeExempt = (access: SpaceAccess, siteAdmin: boolean) => access.canManage || siteAdmin;

function toChannel(c: IChannel, ctx: DtoCtx): ChannelDTO {
  const last = c.lastMessageId ? sid(c.lastMessageId) : null;
  const readId = ctx.readBy.get(sid(c._id))?.lastReadMessageId;
  const read = readId ? sid(readId) : null;
  const invited = ctx.invited.has(sid(c._id));
  return {
    id: sid(c._id),
    slug: c.slug,
    name: c.name,
    topic: c.topic,
    type: c.type,
    visibility: c.visibility,
    categoryId: c.categoryId ? sid(c.categoryId) : null,
    position: c.position,
    lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
    unread: ctx.access.isMember && !!last && (!read || last > read),
    unreadCount: ctx.access.isMember && !!last && (!read || last > read) ? (ctx.unreadCounts?.get(sid(c._id)) ?? 1) : 0,
    ...(ctx.readBy.get(sid(c._id))?.muted ? { muted: true } : {}),
    canPost: canPostInChannel(c, ctx.access, invited),
    ...(ctx.access.timedOutUntil ? { timedOutUntil: ctx.access.timedOutUntil } : {}),
    ...(ctx.access.needsRules ? { needsRules: true } : {}),
    ...(ctx.access.perms?.includes("manageChannels") && c.overrides?.length ? { overrides: toOverrides(c.overrides) } : {}),
    mentions: ctx.mentionCounts.get(sid(c._id)) ?? 0,
    ...(ctx.memberCounts?.has(sid(c._id)) ? { memberCount: ctx.memberCounts.get(sid(c._id)) } : {}),
    slowModeSec: c.slowModeSec ?? 0,
    slowModeExempt: slowModeExempt(ctx.access, !!ctx.siteAdmin),
    // Discord's "Mention @everyone, @here and all roles"
    canMassMention: ctx.access.isMember && (ctx.access.canManage || !!ctx.siteAdmin || !!ctx.membersMass || !!ctx.access.perms?.includes("mentionEveryone")),
    audience: c.visibility === "invite" ? (ctx.memberCounts?.get(sid(c._id)) ?? ctx.audience ?? 0) : (ctx.audience ?? 0),
  };
}

/**
 * Unread @mentions per channel for this viewer (capped, and only for channels that have unread). With
 * `unreadOut`, also how many messages are unread in each (other people's, capped at 99).
 */
async function countMentions(viewerId: Types.ObjectId, channels: IChannel[], readBy: Map<string, IChannelRead>, unreadOut?: Map<string, number>, suppressEveryone = false): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const unread = channels
    .filter((c) => {
      const last = c.lastMessageId ? sid(c.lastMessageId) : null;
      const read = readBy.get(sid(c._id))?.lastReadMessageId;
      return !!last && (!read || last > sid(read));
    })
    .slice(0, 40);
  await Promise.all(
    unread.map(async (c) => {
      const after = readBy.get(sid(c._id))?.lastReadMessageId ?? ZERO_ID;
      const [n, u] = await Promise.all([
        // @mentions of you, and @everyone (unless you suppress it in this community; @here already lists who it pinged)
        ChannelMessage.countDocuments({ channelId: c._id, deletedAt: null, _id: { $gt: after }, authorId: { $ne: viewerId }, ...(suppressEveryone ? { mentions: viewerId } : { $or: [{ mentions: viewerId }, { massMention: "everyone" }] }) }, { limit: 99 }),
        unreadOut ? ChannelMessage.countDocuments({ channelId: c._id, authorId: { $ne: viewerId }, deletedAt: null, _id: { $gt: after } }, { limit: 99 }) : 0,
      ]);
      if (n) out.set(sid(c._id), n);
      if (unreadOut) unreadOut.set(sid(c._id), u);
    }),
  );
  return out;
}

/* ------------------------------------------------------------------ */
/* Channels & categories                                               */
/* ------------------------------------------------------------------ */

async function invitedSet(viewer: IUser | null, communityId: Types.ObjectId): Promise<Set<string>> {
  if (!viewer) return new Set();
  const rows = await ChannelMember.find({ userId: viewer._id, communityId }).select("channelId").lean<Pick<IChannelMember, "channelId">[]>();
  return new Set(rows.map((r) => sid(r.channelId)));
}

export async function listChannels(viewer: IUser | null, space: Space, access: SpaceAccess): Promise<ChannelsDTO> {
  assertCanView(access, "this space's channels");
  const communityId = space.community._id;
  if (space.sub) await ensureDefaultGroupChannels(space.sub._id, communityId, space.sub.ownerId);
  else await ensureDefaultChannels(communityId, space.community.ownerId);

  const scope = scopeOf(space);
  const [categories, channels, reads, invited] = await Promise.all([
    space.sub ? Promise.resolve<IChannelCategory[]>([]) : ChannelCategory.find({ communityId }).sort({ position: 1, createdAt: 1 }).lean<IChannelCategory[]>(),
    Channel.find({ ...scope, topicId: null, parentChannelId: null }).sort({ position: 1, createdAt: 1 }).lean<IChannel[]>(),
    viewer && access.isMember ? ChannelRead.find({ userId: viewer._id, communityId }).lean<IChannelRead[]>() : Promise.resolve<IChannelRead[]>([]),
    invitedSet(viewer, communityId),
  ]);
  const readBy = new Map(reads.map((r) => [sid(r.channelId), r]));
  const visible = channels.filter((c) => canSeeChannel(c, access, invited.has(sid(c._id))) && (VOICE_ENABLED || c.type !== "voice"));
  const unreadCounts = new Map<string, number>();
  const suppress = viewer ? !!(await Membership.findOne({ userId: viewer._id, communityId, subcommunityId: null }).select("suppressEveryone").lean<Pick<IMembership, "suppressEveryone">>())?.suppressEveryone : false;
  const mentionCounts = viewer && access.isMember ? await countMentions(viewer._id, visible, readBy, unreadCounts, suppress) : new Map<string, number>();
  const memberCounts = access.canManage ? await guestCounts(visible) : undefined;
  const siteAdmin = !!viewer && isSiteAdmin(viewer);
  const membersMass = !!space.community.membersMassMention;
  const ctx: DtoCtx = { access, readBy, invited, mentionCounts, unreadCounts, memberCounts, siteAdmin, membersMass, audience: space.sub ? space.sub.memberCount : space.community.memberCount };

  // The groups you're in (community list only), each with the channels you can see.
  const groups: ChannelGroupDTO[] = [];
  if (!space.sub && viewer) {
    const subMs = await Membership.find({ userId: viewer._id, communityId, subcommunityId: { $ne: null }, status: "active" }).lean<IMembership[]>();
    // the community's owner and site admins see all of them, in or not
    const overseer = siteAdmin || access.role === "owner";
    if (subMs.length || overseer) {
      const subs = await Subcommunity.find(overseer ? { communityId } : { _id: { $in: subMs.map((m) => m.subcommunityId) } }).sort({ createdAt: 1 }).lean<ISubcommunity[]>();
      const parentM = await Membership.findOne({ userId: viewer._id, communityId, subcommunityId: null }).lean<IMembership>();
      // a new group's first two channels, once (skipped for every group that already has them: no write per request)
      await Promise.all(subs.filter((sub) => !sub.channelsReady).map((sub) => ensureDefaultGroupChannels(sub._id, communityId, sub.ownerId)));
      const subChannels = await Channel.find({ communityId, subcommunityId: { $in: subs.map((s) => s._id) }, topicId: null }).sort({ position: 1, createdAt: 1 }).lean<IChannel[]>();
      for (const sub of subs) {
        const m = subMs.find((x) => sid(x.subcommunityId!) === sid(sub._id)) ?? null;
        const gAccess = subAccessFrom(space.community, parentM, m, isSiteAdmin(viewer), viewer.points ?? 0);
        const rows = subChannels.filter((c) => sid(c.subcommunityId!) === sid(sub._id) && canSeeChannel(c, gAccess, invited.has(sid(c._id))) && (VOICE_ENABLED || c.type !== "voice"));
        const gUnread = new Map<string, number>();
        // nothing is unread in a group you're only looking in on
        const gMentions = m ? await countMentions(viewer._id, rows, readBy, gUnread, suppress) : new Map<string, number>();
        const gCounts = gAccess.canManage ? await guestCounts(rows) : undefined;
        groups.push({
          id: sid(sub._id),
          slug: sub.slug,
          name: sub.name,
          visibility: sub.visibility,
          role: gAccess.role,
          channels: rows.map((c) => toChannel(c, { access: gAccess, readBy, invited, mentionCounts: gMentions, unreadCounts: gUnread, memberCounts: gCounts, siteAdmin, membersMass, audience: sub.memberCount })),
        });
      }
    }
  }

  return { categories: categories.map(toCategory), channels: visible.map((c) => toChannel(c, ctx)), groups };
}

async function guestCounts(channels: IChannel[]): Promise<Map<string, number>> {
  const ids = channels.filter((c) => c.visibility === "invite").map((c) => c._id);
  if (!ids.length) return new Map();
  const rows = await ChannelMember.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { channelId: { $in: ids } } }, { $group: { _id: "$channelId", n: { $sum: 1 } } }]);
  return new Map(rows.map((r) => [sid(r._id), r.n]));
}

/** Load a channel the viewer may see. Hidden ones look like they don't exist. */
async function loadChannel(viewer: IUser | null, space: Space, access: SpaceAccess, channelSlug: string): Promise<{ channel: IChannel; invited: boolean }> {
  assertCanView(access, "this channel");
  const found = await Channel.findOne({ ...scopeOf(space), slug: channelSlug.toLowerCase() }).lean<IChannel>();
  if (!found) throw notFound("We couldn't find that channel.");
  // a thread follows its channel: whoever can see the channel sees the thread (and anyone who may post there, or
  // in an announcement channel any member, may reply in it)
  let channel = found;
  let guestOf = found._id;
  if (found.parentChannelId) {
    const parent = await Channel.findById(found.parentChannelId).lean<IChannel>();
    if (!parent) throw notFound("We couldn't find that thread.");
    channel = { ...found, visibility: parent.visibility, overrides: parent.overrides, categoryOverrides: parent.categoryOverrides, type: parent.type === "voice" ? "voice" : "text" };
    guestOf = parent._id;
  }
  const invited = !!viewer && channel.visibility === "invite" && !!(await ChannelMember.exists({ channelId: guestOf, userId: viewer._id }));
  if (!canSeeChannel(channel, access, invited)) throw notFound("We couldn't find that channel.");
  return { channel, invited };
}

/** A channel someone may post in (for slash commands): the same checks as sending a message. */
export async function channelForPost(viewer: IUser, space: Space, access: SpaceAccess, channelSlug: string): Promise<{ channel: IChannel }> {
  assertNotTimedOut(access);
  const { channel, invited } = await loadChannel(viewer, space, access, channelSlug);
  if (!canPostInChannel(channel, access, invited)) throw forbidden("You can't post here.");
  return { channel };
}

/** The channel someone may type in (they could post there): for the "is typing…" line. */
export async function typingChannel(viewer: IUser, space: Space, access: SpaceAccess, channelSlug: string): Promise<IChannel> {
  const { channel, invited } = await loadChannel(viewer, space, access, channelSlug);
  if (!canPostInChannel(channel, access, invited)) throw forbidden("You can't post here.");
  return channel;
}

async function uniqueChannelSlug(space: Space, name: string, ignore?: Types.ObjectId) {
  const base = slugify(name);
  for (let i = 0; i < 25; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const hit = await Channel.findOne({ ...scopeOf(space), slug: candidate }).select("_id").lean<{ _id: Types.ObjectId }>();
    if (!hit || (ignore && sid(hit._id) === sid(ignore))) return candidate;
  }
  throw badRequest("Try a more distinctive channel name.");
}

async function assertCategory(space: Space, categoryId: string | null | undefined) {
  if (!categoryId) return null;
  if (space.sub) throw badRequest("Channels inside a group can't have categories.");
  const cat = await ChannelCategory.findOne({ _id: categoryId, communityId: space.community._id }).select("_id").lean<{ _id: Types.ObjectId }>();
  if (!cat) throw badRequest("That category doesn't exist.");
  return cat._id;
}

/** Every id must be an active member of this very space: you can't invite outsiders into a private channel. */
async function assertSpaceMembers(space: Space, userIds: string[]): Promise<Types.ObjectId[]> {
  const unique = [...new Set(userIds)];
  if (!unique.length) return [];
  const rows = await Membership.find({ ...scopeOf(space), userId: { $in: unique }, status: "active" }).select("userId").lean<Pick<IMembership, "userId">[]>();
  if (rows.length !== unique.length) throw badRequest("You can only add people who are members here.");
  return rows.map((r) => r.userId);
}

export async function createChannel(viewer: IUser, space: Space, access: SpaceAccess, input: z.infer<typeof channelCreateSchema>): Promise<ChannelDTO> {
  assertPerm(access, "manageChannels", "manage channels");
  if (input.type === "voice" && !VOICE_ENABLED) throw badRequest("Voice channels are coming soon.");
  await ensureChannelIndexes();
  rateLimit(`channel-create:${sid(viewer._id)}`, 20, 60 * 60 * 1000);
  const scope = scopeOf(space);
  if ((await Channel.countDocuments(scope)) >= MAX_CHANNELS) throw badRequest(`This space can have up to ${MAX_CHANNELS} channels.`);

  const categoryId = await assertCategory(space, input.categoryId);
  const guests = input.visibility === "invite" ? await assertSpaceMembers(space, input.memberIds ?? []) : [];
  const position = await Channel.countDocuments({ ...scope, categoryId });
  const doc = await Channel.create({
    ...scope,
    categoryId,
    slug: await uniqueChannelSlug(space, input.name),
    name: input.name,
    topic: input.topic ?? "",
    type: input.type,
    visibility: input.visibility,
    position,
    createdById: viewer._id,
  });
  if (guests.length) {
    await ChannelMember.insertMany(guests.map((userId) => ({ channelId: doc._id, userId, ...scope, addedById: viewer._id })), { ordered: false });
  }
  return toChannel(doc.toObject(), { access, readBy: new Map(), invited: new Set(), mentionCounts: new Map(), memberCounts: access.canManage && input.visibility === "invite" ? new Map([[sid(doc._id), guests.length]]) : undefined });
}

export async function updateChannel(viewer: IUser, space: Space, access: SpaceAccess, channelSlug: string, patch: z.infer<typeof channelUpdateSchema>): Promise<ChannelDTO> {
  assertPerm(access, "manageChannels", "manage channels");
  const { channel } = await loadChannel(viewer, space, access, channelSlug);
  const set: Partial<IChannel> = {};
  if (patch.name !== undefined && patch.name !== channel.name) {
    set.name = patch.name;
    set.slug = await uniqueChannelSlug(space, patch.name, channel._id);
  }
  if (patch.topic !== undefined) set.topic = patch.topic;
  if (patch.type === "voice" && !VOICE_ENABLED) throw badRequest("Voice channels are coming soon.");
  if (patch.type !== undefined) set.type = patch.type;
  if (patch.visibility !== undefined) set.visibility = patch.visibility;
  if (patch.categoryId !== undefined) {
    set.categoryId = await assertCategory(space, patch.categoryId);
    // it takes on its new category's role overrides
    const cat = set.categoryId ? await ChannelCategory.findById(set.categoryId).select("overrides").lean<Pick<IChannelCategory, "overrides">>() : null;
    set.categoryOverrides = cat?.overrides ?? [];
  }
  if (patch.overrides !== undefined) set.overrides = await cleanOverrides(space, patch.overrides);
  if (patch.slowModeSec !== undefined) set.slowModeSec = patch.slowModeSec;
  await Channel.updateOne({ _id: channel._id }, set);
  // open chats and channel lists pick the change up (slow mode, name, who can post) without a reload
  emitChannel(channel.communityId, channel._id);
  const next = await Channel.findById(channel._id).lean<IChannel>();
  const counts = await guestCounts([next!]);
  return toChannel(next!, { access, readBy: new Map(), invited: new Set(), mentionCounts: new Map(), memberCounts: counts });
}

export async function deleteChannel(viewer: IUser, space: Space, access: SpaceAccess, channelSlug: string) {
  assertPerm(access, "manageChannels", "manage channels");
  const { channel } = await loadChannel(viewer, space, access, channelSlug);
  // its threads go with it
  const threads = await Channel.find({ parentChannelId: channel._id }).select("_id").lean<{ _id: Types.ObjectId }[]>();
  if (threads.length) {
    const ids = threads.map((t) => t._id);
    await Promise.all([ChannelMessage.deleteMany({ channelId: { $in: ids } }), ChannelRead.deleteMany({ channelId: { $in: ids } }), Channel.deleteMany({ _id: { $in: ids } })]);
  }
  const withFiles = await ChannelMessage.find({ channelId: channel._id, "images.0": { $exists: true } }).select("images").lean<{ images: string[] }[]>();
  deleteUploads(withFiles.flatMap((m) => m.images));
  await Promise.all([
    ChannelMessage.deleteMany({ channelId: channel._id }),
    ChannelRead.deleteMany({ channelId: channel._id }),
    ChannelMember.deleteMany({ channelId: channel._id }),
    Webhook.deleteMany({ channelId: channel._id }),
    Channel.deleteOne({ _id: channel._id }),
  ]);
  return { deleted: true };
}

export async function createCategory(space: Space, access: SpaceAccess, input: z.infer<typeof categorySchema>): Promise<ChannelCategoryDTO> {
  assertPerm(access, "manageChannels", "manage channels");
  if (space.sub) throw badRequest("Groups don't use categories.");
  const communityId = space.community._id;
  if ((await ChannelCategory.countDocuments({ communityId })) >= MAX_CATEGORIES) throw badRequest(`A community can have up to ${MAX_CATEGORIES} categories.`);
  const position = await ChannelCategory.countDocuments({ communityId });
  const doc = await ChannelCategory.create({ communityId, name: input.name, position });
  return toCategory(doc.toObject());
}

export async function renameCategory(space: Space, access: SpaceAccess, categoryId: string, input: z.infer<typeof categoryUpdateSchema>) {
  assertPerm(access, "manageChannels", "manage channels");
  const set: Partial<IChannelCategory> = {};
  if (input.name) set.name = input.name;
  if (input.overrides) set.overrides = await cleanOverrides(space, input.overrides);
  const cat = await ChannelCategory.findOneAndUpdate({ _id: categoryId, communityId: space.community._id }, { $set: set }, { returnDocument: "after" }).lean<IChannelCategory>();
  if (!cat) throw notFound("We couldn't find that category.");
  // its channels carry a copy, so checks don't need the category
  if (input.overrides) {
    await Channel.updateMany({ communityId: space.community._id, categoryId: cat._id }, { $set: { categoryOverrides: cat.overrides ?? [] } });
    emitChannel(space.community._id, cat._id);
  }
  return toCategory(cat);
}

/** Overrides for roles that exist in this community, at most one per role; empty ones dropped. */
async function cleanOverrides(space: Space, list: z.infer<typeof roleOverridesSchema>): Promise<RoleOverride[]> {
  const ids = await CommunityRole.find({ communityId: space.community._id, _id: { $in: list.map((o) => o.roleId) } }).distinct("_id");
  const ok = new Set(ids.map(String));
  const seen = new Set<string>();
  return list.filter((o) => ok.has(o.roleId) && !seen.has(o.roleId) && (o.view || o.post) && seen.add(o.roleId)).map((o) => ({ roleId: new Types.ObjectId(o.roleId), view: o.view, post: o.post }));
}

/** Channels inside a deleted category are kept and become uncategorised. */
export async function deleteCategory(space: Space, access: SpaceAccess, categoryId: string) {
  assertPerm(access, "manageChannels", "manage channels");
  const res = await ChannelCategory.deleteOne({ _id: categoryId, communityId: space.community._id });
  if (!res.deletedCount) throw notFound("We couldn't find that category.");
  await Channel.updateMany({ communityId: space.community._id, categoryId }, { categoryId: null });
  return { deleted: true };
}

/* ------------------------------------------------------------------ */
/* Private channel guest list                                          */
/* ------------------------------------------------------------------ */

async function loadPrivateChannel(viewer: IUser, space: Space, access: SpaceAccess, channelSlug: string) {
  assertPerm(access, "manageChannels", "manage channels");
  const { channel } = await loadChannel(viewer, space, access, channelSlug);
  if (channel.visibility !== "invite") throw badRequest("Only private channels have a guest list.");
  return channel;
}

export async function listChannelMembers(viewer: IUser, space: Space, access: SpaceAccess, channelSlug: string): Promise<UserBrief[]> {
  const channel = await loadPrivateChannel(viewer, space, access, channelSlug);
  const rows = await ChannelMember.find({ channelId: channel._id }).sort({ createdAt: 1 }).limit(200).lean<IChannelMember[]>();
  const briefs = await loadBriefs(rows.map((r) => r.userId));
  return rows.flatMap((r) => {
    const b = briefs.get(sid(r.userId));
    return b ? [b] : [];
  });
}

export async function addChannelMember(viewer: IUser, space: Space, access: SpaceAccess, channelSlug: string, userId: string) {
  const channel = await loadPrivateChannel(viewer, space, access, channelSlug);
  if ((await ChannelMember.countDocuments({ channelId: channel._id })) >= 200) throw badRequest("A private channel can have up to 200 guests.");
  const [uid] = await assertSpaceMembers(space, [userId]);
  await ChannelMember.updateOne({ channelId: channel._id, userId: uid }, { $setOnInsert: { ...scopeOf(space), addedById: viewer._id } }, { upsert: true });
  return { added: true };
}

export async function removeChannelMember(viewer: IUser, space: Space, access: SpaceAccess, channelSlug: string, userId: string) {
  const channel = await loadPrivateChannel(viewer, space, access, channelSlug);
  await ChannelMember.deleteOne({ channelId: channel._id, userId });
  return { removed: true };
}

/* ------------------------------------------------------------------ */
/* Member search (picker + @mention autocomplete)                      */
/* ------------------------------------------------------------------ */

/** Active members of the space whose handle or name starts with `q`. Members only; blocked people are left out. */
export async function searchSpaceMembers(viewer: IUser, space: Space, access: SpaceAccess, q: string | undefined, only?: Types.ObjectId[]): Promise<UserBrief[]> {
  if (!access.isMember) throw forbidden("Join to see who's in here.");
  rateLimit(`member-search:${sid(viewer._id)}`, 120, 60_000);
  const hidden = await hiddenUserIds(viewer._id);
  const rx = q ? new RegExp(`^${escapeRegex(q)}`, "i") : null;
  const users = await User.find({
    ...(rx ? { $or: [{ handle: rx }, { displayName: rx }] } : {}),
    _id: { $nin: [...hidden, viewer._id] },
  })
    .select("handle displayName avatarUrl avatarFrame nameEffect plan planUntil email country city")
    .limit(400)
    .lean<IUser[]>();
  const memberRows = await Membership.find({ ...scopeOf(space), status: "active", userId: { $in: users.map((u) => u._id) } }).select("userId").lean<Pick<IMembership, "userId">[]>();
  const memberSet = new Set(memberRows.map((m) => sid(m.userId)));
  const onlySet = only ? new Set(only.map(sid)) : null;
  return users
    .filter((u) => memberSet.has(sid(u._id)) && (!onlySet || onlySet.has(sid(u._id))))
    .sort((a, b) => a.handle.localeCompare(b.handle))
    .slice(0, 8)
    .map(toBrief);
}

/** Who can be tagged in this channel: its readers (for a private channel: guests + owners/admins). */
export async function mentionable(viewer: IUser, space: Space, access: SpaceAccess, channelSlug: string, q: string | undefined): Promise<UserBrief[]> {
  const { channel } = await loadChannel(viewer, space, access, channelSlug);
  let only: Types.ObjectId[] | undefined;
  if (channel.visibility === "invite") {
    const [guests, managers] = await Promise.all([
      ChannelMember.find({ channelId: channel._id }).select("userId").lean<Pick<IChannelMember, "userId">[]>(),
      Membership.find({ ...scopeOf(space), status: "active", role: { $in: ["owner", "admin"] } }).select("userId").lean<Pick<IMembership, "userId">[]>(),
    ]);
    only = [...guests, ...managers].map((r) => r.userId);
  } else if (channel.visibility === "managers") {
    const managers = await Membership.find({ ...scopeOf(space), status: "active", role: { $in: ["owner", "admin"] } }).select("userId").lean<Pick<IMembership, "userId">[]>();
    only = managers.map((r) => r.userId);
  }
  return searchSpaceMembers(viewer, space, access, q, only);
}

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

type ListQuery = z.infer<typeof chatListQuery>;

async function toMessages(rows: IChannelMessage[], viewer: IUser | null, access: SpaceAccess, space: Space): Promise<ChannelMessageDTO[]> {
  const [authors, mentionMap, reactionMap] = await Promise.all([
    loadBriefs(rows.map((r) => r.authorId)),
    mentionBriefs(rows.flatMap((r) => r.mentions ?? [])),
    summarizeReactions("channel", rows.filter((r) => !r.deletedAt).map((r) => r._id), viewer?._id ?? null),
  ]);
  // the authors' standing in the community: their name colour (highest coloured role), and their rank, since you
  // may only delete messages from people below you (with "Delete messages")
  const standing = await standings(space.community._id, rows.map((r) => r.authorId));
  const mayDelete = can(access, "deleteMessages");
  const me = viewer ? sid(viewer._id) : "";
  // the messages these rows answer (same channel only), with who wrote them
  const replyIds = [...new Set(rows.map((r) => (r.replyToId ? sid(r.replyToId) : "")).filter(Boolean))];
  const replyRows = replyIds.length ? await ChannelMessage.find({ _id: { $in: replyIds }, channelId: rows[0].channelId }).lean<IChannelMessage[]>() : [];
  const replyAuthors = await loadBriefs(replyRows.map((r) => r.authorId));
  const replyMap = new Map(replyRows.map((r) => [sid(r._id), toReplyRef(r, r.webhook?.name ?? replyAuthors.get(sid(r.authorId))?.displayName ?? "Someone")]));
  return rows.flatMap((raw) => {
    // hidden pending review reads as removed
    const r = raw.hiddenAt && !raw.deletedAt ? { ...raw, deletedAt: raw.hiddenAt } : raw;
    // a webhook's message shows the webhook's own name and picture (no profile behind it)
    const bot = r.webhook ? { id: `webhook-${sid(r.webhook.id)}`, handle: "", displayName: r.webhook.name, avatarUrl: r.webhook.avatarUrl ?? null, country: "", city: "" as UserBrief["city"] } : null;
    const author = bot ?? authors.get(sid(r.authorId));
    if (!author) return [];
    const authorRank = standing.get(sid(r.authorId))?.rank ?? 0;
    const canEdit = !bot && !!viewer && !r.deletedAt && !r.sticker && !r.stickerUrl && !r.pollId && sid(r.authorId) === me && access.isMember;
    const canDelete =
      !!viewer &&
      !r.deletedAt &&
      (bot ? isSiteAdmin(viewer) || mayDelete : sid(r.authorId) === me ? access.isMember : isSiteAdmin(viewer) || (mayDelete && authorRank < (access.rank ?? 0)));
    const mentions = r.deletedAt ? [] : (r.mentions ?? []).flatMap((id) => mentionMap.get(sid(id)) ?? []);
    return [
      {
        id: sid(r._id),
        channelId: sid(r.channelId),
        body: r.deletedAt ? "" : r.body,
        sticker: r.deletedAt ? null : (r.sticker ?? null),
        stickerUrl: r.deletedAt ? null : (r.stickerUrl ?? null),
        images: r.deletedAt ? [] : (r.images ?? []),
        replyTo: r.deletedAt || !r.replyToId ? null : (replyMap.get(sid(r.replyToId)) ?? null),
        pinned: !r.deletedAt && !!r.pinnedAt,
        canPin: !!viewer && !r.deletedAt && access.canManage,
        reactions: r.deletedAt ? [] : (reactionMap.get(sid(r._id)) ?? []),
        deleted: !!r.deletedAt,
        createdAt: r.createdAt.toISOString(),
        editedAt: r.deletedAt || !r.editedAt ? null : r.editedAt.toISOString(),
        author,
        canEdit,
        canDelete,
        mentions,
        mentionsMe: !!me && (mentions.some((m) => m.id === me) || (!r.deletedAt && r.massMention === "everyone" && sid(r.authorId) !== me)),
        massMention: r.deletedAt ? null : (r.massMention ?? null),
        pollId: r.deletedAt || !r.pollId ? null : sid(r.pollId),
        ...(bot ? { bot: true } : {}),
        ...(r.cards?.length && !r.deletedAt ? { cards: r.cards } : {}),
        ...(r.thread && !r.deletedAt ? { thread: { slug: r.thread.slug, name: r.thread.name, count: r.thread.count ?? 0, lastAt: r.thread.lastAt?.toISOString() ?? null, lastBy: r.thread.lastBy ?? null } } : {}),
        ...(!bot && standing.get(sid(r.authorId))?.color ? { color: standing.get(sid(r.authorId))!.color } : {}),
        ...(!bot && standing.get(sid(r.authorId))?.badge ? { roleBadge: standing.get(sid(r.authorId))!.badge! } : {}),
      },
    ];
  });
}

/**
 * Newest page first-load, older pages via `before`, new messages via `after`.
 * Always returned oldest → newest so the client can render or prepend directly.
 */
export async function listMessages(viewer: IUser | null, space: Space, access: SpaceAccess, channelSlug: string, q: ListQuery): Promise<ChatPage> {
  // the channel, and the people you've blocked (or who blocked you), side by side
  const [{ channel }, hidden] = await Promise.all([loadChannel(viewer, space, access, channelSlug), hiddenUserIds(viewer?._id ?? null)]);
  const base: Record<string, unknown> = { channelId: channel._id };
  if (hidden.length) base.authorId = { $nin: hidden };

  if (q.after) {
    const rows = await ChannelMessage.find({ ...base, _id: { $gt: new Types.ObjectId(q.after) } })
      .sort({ _id: 1 })
      .limit(NEW_LIMIT + 1)
      .lean<IChannelMessage[]>();
    return { items: await toMessages(rows.slice(0, NEW_LIMIT), viewer, access, space), hasMore: rows.length > NEW_LIMIT };
  }

  const filter = q.before ? { ...base, _id: { $lt: new Types.ObjectId(q.before) } } : base;
  const rows = await ChannelMessage.find(filter)
    .sort({ _id: -1 })
    .limit(PAGE + 1)
    .lean<IChannelMessage[]>();
  const page = rows.slice(0, PAGE).reverse();
  return { items: await toMessages(page, viewer, access, space), hasMore: rows.length > PAGE };
}

export async function postMessage(viewer: IUser, space: Space, access: SpaceAccess, channelSlug: string, input: { body: string; sticker?: string; stickerUrl?: string; images?: string[]; replyToId?: string; poll?: z.infer<typeof pollInput>; /** only bots: the chat routes don't accept these from people */ cards?: MessageCard[] }): Promise<ChannelMessageDTO> {
  assertNotTimedOut(access);
  const { sticker, images = [], replyToId } = input;
  const stickerUrl = input.stickerUrl && !sticker ? assertStickerUrl(input.stickerUrl) : null;
  const { channel, invited } = await loadChannel(viewer, space, access, channelSlug);
  // replies on a board post live in its chat: stopped from Boards means these too, not ordinary chat
  if (channel.topicId) assertNotPostBanned(access);
  // custom emoji: :name: shortcuts, and only emoji they may use here
  const body = await normalizeEmoji(viewer, channel.communityId, input.body);
  if (!canPostInChannel(channel, access, invited)) {
    if (access.banned) throw forbidden("You can't post here.");
    if (!access.isMember) throw forbidden("Join to chat.");
    throw forbidden("Only owners and admins can post in this channel.");
  }
  rateLimit(`chat:${sid(viewer._id)}`, 20, 15_000);
  // AutoMod: the community's rules (blocks throw with the reason)
  await checkAutoMod(space, viewer, access, { text: input.poll ? `${input.poll.question} ${input.poll.answers.map((a) => a.text).join(" ")}` : [body, cardWords(input.cards)].filter(Boolean).join("\n"), channelId: channel._id, where: `#${channel.name}` });
  await assertSlowMode(viewer, access, channel);

  const mentions = await resolveMentions(viewer, channel, body);
  // @everyone / @here (and @all / @channel): only owners, admins, site admins, and members where the community allows
  // it; anyone else's just sends as words. Rate-limited, and never in a post's reply thread.
  const massWanted = !input.poll && !channel.topicId ? extractMassMention(body) : null;
  const mayMass = access.canManage || isSiteAdmin(viewer) || can(access, "mentionEveryone") || !!space.community.membersMassMention;
  let massMention: "everyone" | "here" | null = null;
  let massIds: Types.ObjectId[] = [];
  if (massWanted && mayMass) {
    rateLimit(`mass-mention:${sid(viewer._id)}`, 6, 60 * 60 * 1000);
    massIds = await massAudience(channel, massWanted);
    massMention = massWanted;
    // @here lists exactly who it pinged (so it only counts for them); @everyone counts for every reader
    if (massWanted === "here") for (const id of massIds) if (!mentions.some((m) => sid(m) === sid(id))) mentions.push(id);
  }
  const replyTarget = replyToId ? await ChannelMessage.findOne({ _id: replyToId, channelId: channel._id }).select("_id authorId").lean<{ _id: Types.ObjectId; authorId: Types.ObjectId }>() : null;
  // a poll rides on its own message (anything else sent with it is dropped)
  const poll = input.poll ? await createPoll(viewer, { scope: "channel", targetId: channel._id, communityId: channel.communityId }, input.poll) : null;
  const doc = poll
    ? await ChannelMessage.create({ channelId: channel._id, communityId: channel.communityId, authorId: viewer._id, body: "", images: [], pollId: poll._id, replyToId: replyTarget?._id ?? null, mentions: [] })
    : await ChannelMessage.create({ channelId: channel._id, communityId: channel.communityId, authorId: viewer._id, body, sticker: sticker ?? null, stickerUrl, images, replyToId: replyTarget?._id ?? null, mentions, massMention, ...(input.cards?.length ? { cards: input.cards } : {}) });
  noteStickerUse(viewer._id, stickerUrl);
  await Promise.all([
    Channel.updateOne({ _id: channel._id }, { lastMessageId: doc._id, lastMessageAt: doc.createdAt }),
    ChannelRead.updateOne({ userId: viewer._id, channelId: channel._id }, { $set: { lastReadMessageId: doc._id, communityId: channel.communityId } }, { upsert: true }),
  ]);
  emitChannel(channel.communityId, channel._id);
  const post = channel.topicId ? await Topic.findById(channel.topicId).select("_id title boardId communityId").lean<Pick<ITopic, "_id" | "title" | "boardId" | "communityId">>() : null;
  const href = post ? `${await postHref(space, post)}&m=${sid(doc._id)}` : null;
  // a reply in a thread: the message it hangs off counts it, and its channel's chat updates
  if (channel.parentChannelId && channel.threadOf) {
    await ChannelMessage.updateOne({ _id: channel.threadOf }, { $inc: { "thread.count": 1 }, $set: { "thread.lastAt": doc.createdAt, "thread.lastBy": viewer.displayName } });
    emitChannel(channel.communityId, channel.parentChannelId);
  }
  const where = post ? `"${post.title}"` : channel.parentChannelId ? `the thread "${channel.name}"` : `#${channel.name}`;
  // Phones hear about it only when it is for them: an @mention or an answer to their message.
  const targets = await notMuted([...new Map([...(mentions ?? []), ...massIds, ...(replyTarget ? [replyTarget.authorId] : [])].map((id) => [sid(id), id])).values()].filter((id) => sid(id) !== sid(viewer._id)), channel);
  const said = poll ? pollPreview(poll.question) : previewOf({ body, sticker, stickerUrl, images, cards: input.cards });
  notify(targets, {
    title: `${viewer.displayName} in ${where}`,
    body: said,
    // tapping it opens this very message
    data: href ? { href } : channel.parentChannelId ? { href: `/communities/${space.community.slug}?th=${channel.slug}&m=${sid(doc._id)}` } : { type: "channel", communitySlug: space.community.slug, channelSlug: channel.slug, messageId: sid(doc._id), ...(space.sub ? { subSlug: space.sub.slug } : {}) },
  }, { actorId: viewer._id, category: "mentions", groupKey: `chat:${sid(channel._id)}`, many: (n) => `${n} mentions and replies in ${where}`, ref: `channel:${sid(channel._id)}` });
  if (post && href) await onPostReply(viewer, post, href, said, targets);
  const out = (await toMessages([doc.toObject()], viewer, access, space))[0];
  // bots in the community hear about it (not the bot that sent it)
  void import("./bots.service").then((b) => b.emitBotEvent(channel.communityId, "message.create", { channel: { id: sid(channel._id), slug: channel.slug, name: channel.name, threadOf: channel.parentChannelId ? sid(channel.parentChannelId) : null }, message: { id: out.id, body: out.body, author: out.author, replyTo: out.replyTo?.id ?? null, mentions: out.mentions, ...(out.cards ? { cards: out.cards } : {}) } }, { except: viewer._id, channel, content: true }));
  return out;
}

/**
 * A channel webhook posts a message (server/services/webhooks.service checked the secret, the channel and limits):
 * words and cards, through the same pipeline as people's messages (live update, @mentions, unread counts), shown under
 * the webhook's name with a BOT tag. @everyone / @here only ping when the webhook is allowed to; @handle mentions
 * resolve like the community owner's would (the message is filed under the owner).
 */
export async function postWebhookMessage(hook: { _id: Types.ObjectId; name: string; avatarUrl: string | null; allowMassMention: boolean }, owner: IUser, channel: IChannel, body: string, name?: string, avatarUrl?: string | null, cards?: MessageCard[]): Promise<{ id: string }> {
  const mentions = await resolveMentions(owner, channel, body);
  const massWanted = hook.allowMassMention && !channel.topicId ? extractMassMention(body) : null;
  let massMention: "everyone" | "here" | null = null;
  let massIds: Types.ObjectId[] = [];
  if (massWanted) {
    rateLimit(`mass-mention:webhook:${sid(hook._id)}`, 6, 60 * 60 * 1000);
    massIds = await massAudience(channel, massWanted);
    massMention = massWanted;
    if (massWanted === "here") for (const id of massIds) if (!mentions.some((m) => sid(m) === sid(id))) mentions.push(id);
  }
  const shown = { id: hook._id, name: (name || hook.name).slice(0, 80), avatarUrl: avatarUrl ?? hook.avatarUrl ?? null };
  const doc = await ChannelMessage.create({ channelId: channel._id, communityId: channel.communityId, authorId: owner._id, body, images: [], mentions, massMention, webhook: shown, ...(cards?.length ? { cards } : {}) });
  await Channel.updateOne({ _id: channel._id }, { lastMessageId: doc._id, lastMessageAt: doc.createdAt });
  emitChannel(channel.communityId, channel._id);
  const targets = await notMuted([...new Map([...mentions, ...massIds].map((id) => [sid(id), id])).values()], channel);
  if (targets.length) {
    const community = await Community.findById(channel.communityId).select("slug").lean<{ slug: string }>();
    const sub = channel.subcommunityId ? await Subcommunity.findById(channel.subcommunityId).select("slug").lean<{ slug: string }>() : null;
    notify(targets, { title: `${shown.name} in #${channel.name}`, body: previewOf({ body, sticker: null, stickerUrl: null, images: [], cards }), data: { type: "channel", communitySlug: community?.slug ?? "", channelSlug: channel.slug, ...(sub ? { subSlug: sub.slug } : {}) } }, { category: "mentions", groupKey: `chat:${sid(channel._id)}`, many: (n) => `${n} mentions in #${channel.name}`, ref: `channel:${sid(channel._id)}` });
  }
  return { id: sid(doc._id) };
}

/* ------------------------------ threads ------------------------------ */

/** A thread with no replies for this long is archived (shown under "Archived"; a reply opens it again). */
const THREAD_ARCHIVE_MS = 7 * 24 * 60 * 60 * 1000;
const threadArchived = (t: Pick<IChannel, "lastMessageAt" | "createdAt">) => Date.now() - +(t.lastMessageAt ?? t.createdAt) > THREAD_ARCHIVE_MS;

/**
 * Start a thread off a message (or open the one it already has). Anyone who can see the channel and post in the
 * community can; in an announcement channel members can thread off posts they can't reply to in the channel.
 */
export async function startThread(viewer: IUser, space: Space, access: SpaceAccess, channelSlug: string, messageId: string, name: string | undefined, firstReply: string): Promise<ChannelDTO> {
  assertNotTimedOut(access);
  const body = firstReply.trim();
  // no empty threads: one is made together with its first reply
  if (!body) throw badRequest("Write the first reply to start the thread.");
  const { channel, invited } = await loadChannel(viewer, space, access, channelSlug);
  if (channel.parentChannelId || channel.topicId || channel.type === "voice") throw badRequest("Threads can only start from messages in a text channel.");
  if (!access.canPost) throw forbidden("Join to start a thread.");
  const msg = await ChannelMessage.findOne({ _id: messageId, channelId: channel._id }).lean<IChannelMessage>();
  if (!msg || msg.deletedAt) throw notFound("We couldn't find that message.");
  const slug = `t-${sid(msg._id)}`;
  let thread = msg.thread ? await Channel.findById(msg.thread.channelId).lean<IChannel>() : null;
  let made = false;
  if (!thread) {
    rateLimit(`thread:${sid(viewer._id)}`, 20, 60 * 60_000);
    const title = (name?.trim() || msg.body.replace(EMOJI_TOKEN, ":$1:").replace(/\s+/g, " ").trim() || "Thread").slice(0, 40);
    try {
      thread = (await Channel.create({ communityId: channel.communityId, subcommunityId: channel.subcommunityId ?? null, categoryId: channel.categoryId ?? null, slug, name: title, type: "text", visibility: channel.visibility, position: 0, createdById: viewer._id, parentChannelId: channel._id, threadOf: msg._id })).toObject() as IChannel;
      made = true;
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
      thread = (await Channel.findOne({ ...scopeOf(space), slug }).lean<IChannel>())!; // started twice at once
    }
    await ChannelMessage.updateOne({ _id: msg._id, thread: null }, { $set: { thread: { channelId: thread._id, slug, name: thread.name, count: 0, lastAt: null, lastBy: null } } });
  }
  // the first reply (all the usual checks: AutoMod, slow mode…); if it's refused, the new thread goes again
  try {
    await postMessage(viewer, space, access, thread.slug, { body });
  } catch (err) {
    if (made) {
      await Promise.all([Channel.deleteOne({ _id: thread._id }), ChannelMessage.updateOne({ _id: msg._id }, { $set: { thread: null } })]);
    }
    throw err;
  }
  // answer straight from what's here (no second lookup)
  const merged: IChannel = { ...thread, visibility: channel.visibility, overrides: channel.overrides, categoryOverrides: channel.categoryOverrides, type: "text" };
  const dto = toChannel(merged, { access, readBy: new Map(), invited: new Set(invited ? [sid(thread._id)] : []), mentionCounts: new Map(), siteAdmin: isSiteAdmin(viewer) });
  return { ...dto, thread: { parentSlug: channel.slug, parentName: channel.name, startMessageId: sid(msg._id), archived: false } };
}

/**
 * Safety net (run with the reminders job): threads with no replies older than 10 minutes go, and their message's
 * "replies" button with them. People can't make empty threads; this catches anything else.
 */
export async function sweepEmptyThreads(olderThanMs = 10 * 60_000): Promise<number> {
  const old = await Channel.find({ parentChannelId: { $ne: null }, lastMessageId: null, createdAt: { $lt: new Date(Date.now() - olderThanMs) } }).select("_id threadOf communityId parentChannelId").limit(500).lean<Pick<IChannel, "_id" | "threadOf" | "communityId" | "parentChannelId">[]>();
  if (!old.length) return 0;
  await Promise.all([
    Channel.deleteMany({ _id: { $in: old.map((t) => t._id) } }),
    ChannelRead.deleteMany({ channelId: { $in: old.map((t) => t._id) } }),
    ChannelMessage.updateMany({ _id: { $in: old.flatMap((t) => (t.threadOf ? [t.threadOf] : [])) }, "thread.count": { $in: [0, null] } }, { $set: { thread: null } }),
  ]);
  for (const t of old) if (t.parentChannelId) emitChannel(t.communityId, t.parentChannelId);
  return old.length;
}

/** One thread, as a channel (with where it hangs off). */
export async function getThread(viewer: IUser | null, space: Space, access: SpaceAccess, threadSlug: string): Promise<ChannelDTO> {
  const { channel, invited } = await loadChannel(viewer, space, access, threadSlug);
  if (!channel.parentChannelId) throw notFound("We couldn't find that thread.");
  const parent = (await Channel.findById(channel.parentChannelId).select("slug name").lean<Pick<IChannel, "slug" | "name">>())!;
  const read = viewer && access.isMember ? await ChannelRead.findOne({ userId: viewer._id, channelId: channel._id }).lean<IChannelRead>() : null;
  const dto = toChannel(channel, { access, readBy: new Map(read ? [[sid(channel._id), read]] : []), invited: new Set(invited ? [sid(channel._id)] : []), mentionCounts: new Map(), siteAdmin: !!viewer && isSiteAdmin(viewer) });
  return { ...dto, thread: { parentSlug: parent.slug, parentName: parent.name, startMessageId: sid(channel.threadOf!), archived: threadArchived(channel) } };
}

/** A channel's threads: active ones first (latest reply first), then archived. */
export async function listThreads(viewer: IUser | null, space: Space, access: SpaceAccess, channelSlug: string): Promise<ThreadDTO[]> {
  const { channel } = await loadChannel(viewer, space, access, channelSlug);
  const rows = await Channel.find({ parentChannelId: channel._id }).sort({ lastMessageAt: -1, createdAt: -1 }).limit(100).lean<IChannel[]>();
  const [starters, people] = await Promise.all([
    ChannelMessage.find({ _id: { $in: rows.flatMap((r) => (r.threadOf ? [r.threadOf] : [])) } }).select("thread").lean<Pick<IChannelMessage, "_id" | "thread">[]>(),
    loadBriefs(rows.map((r) => r.createdById)),
  ]);
  const starter = new Map(starters.map((m) => [sid(m._id), m.thread]));
  const items = rows.map((r) => ({ slug: r.slug, name: r.name, count: starter.get(sid(r.threadOf!))?.count ?? 0, lastAt: r.lastMessageAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(), archived: threadArchived(r), startedBy: people.get(sid(r.createdById)) ?? null, startMessageId: sid(r.threadOf!), lastBy: starter.get(sid(r.threadOf!))?.lastBy ?? null }));
  return [...items.filter((t) => !t.archived), ...items.filter((t) => t.archived)];
}

/** at most this many people are pinged by one @everyone (the rest still see it highlighted) */
const MASS_CAP = 5000;
/** "online now" for @here: used the app in the last few minutes, and not invisible */
const HERE_MS = 5 * 60_000;

/**
 * Who a mass mention pings: everyone who can see the channel (its space's members; for a private channel its
 * guests and the owners and admins), minus anyone who suppresses @everyone and @here in this community; @here only
 * those online now.
 */
async function massAudience(channel: IChannel, kind: "everyone" | "here"): Promise<Types.ObjectId[]> {
  const rows = await Membership.find({ communityId: channel.communityId, subcommunityId: channel.subcommunityId ?? null, status: "active" }).select("userId role").limit(MASS_CAP * 2).lean<{ userId: Types.ObjectId; role: string }[]>();
  let ids = rows.map((r) => r.userId);
  if (channel.visibility === "invite") {
    const guests = new Set((await ChannelMember.find({ channelId: channel._id }).select("userId").lean<{ userId: Types.ObjectId }[]>()).map((m) => sid(m.userId)));
    ids = rows.filter((r) => guests.has(sid(r.userId)) || r.role === "owner" || r.role === "admin").map((r) => r.userId);
  } else if (channel.visibility === "managers") ids = rows.filter((r) => r.role === "owner" || r.role === "admin").map((r) => r.userId);
  const quiet = new Set((await Membership.find({ communityId: channel.communityId, subcommunityId: null, suppressEveryone: true, userId: { $in: ids } }).select("userId").lean<{ userId: Types.ObjectId }[]>()).map((m) => sid(m.userId)));
  ids = ids.filter((id) => !quiet.has(sid(id)));
  if (kind === "here") {
    const online = await User.find({ _id: { $in: ids }, lastSeenAt: { $gte: new Date(Date.now() - HERE_MS) }, presence: { $ne: "invisible" } }).select("_id").lean<{ _id: Types.ObjectId }[]>();
    ids = online.map((u) => u._id);
  }
  return ids.slice(0, MASS_CAP);
}

/**
 * Slow mode: each person waits `slowModeSec` between messages in this channel (counted from their last one, even
 * if they deleted it). Owners, admins and site admins don't wait. A refusal says how long is left (`retryAfter`).
 */
async function assertSlowMode(viewer: IUser, access: SpaceAccess, channel: IChannel) {
  const wait = channel.slowModeSec ?? 0;
  if (!wait || slowModeExempt(access, isSiteAdmin(viewer))) return;
  const last = await ChannelMessage.findOne({ channelId: channel._id, authorId: viewer._id }).sort({ _id: -1 }).select("createdAt").lean<{ createdAt: Date }>();
  if (!last) return;
  const left = Math.ceil((last.createdAt.getTime() + wait * 1000 - Date.now()) / 1000);
  if (left > 0) throw new ApiError(429, `Slow mode is on (${slowModeLabel(wait)}). You can send again in ${left < 60 ? `${left}s` : `${Math.ceil(left / 60)}m`}.`, { code: "slow_mode", errors: { retryAfter: String(left) } });
}

/** Authors can change the text of their own messages while they can still post in the channel. */
export async function editMessage(viewer: IUser, space: Space, access: SpaceAccess, channelSlug: string, messageId: string, newBody?: string, cards?: MessageCard[]): Promise<ChannelMessageDTO> {
  const { channel, invited } = await loadChannel(viewer, space, access, channelSlug);
  const msg = await ChannelMessage.findOne({ _id: messageId, channelId: channel._id }).lean<IChannelMessage>();
  if (!msg || msg.deletedAt) throw notFound("We couldn't find that message.");
  if (sid(msg.authorId) !== sid(viewer._id)) throw forbidden("You can only edit your own messages.");
  if (msg.sticker || msg.stickerUrl) throw forbidden("Stickers can't be edited. Delete it and send another.");
  if (msg.pollId) throw forbidden("Polls can't be edited. Delete it and start another.");
  if (channel.topicId) assertNotPostBanned(access);
  if (!canPostInChannel(channel, access, invited)) throw forbidden("You can't post here any more, so you can't edit this.");
  rateLimit(`chat-edit:${sid(viewer._id)}`, 30, 60_000);
  const body = newBody ?? msg.body;
  const nextCards = cards ?? msg.cards ?? [];
  if (!body.trim() && !nextCards.length && !msg.images?.length) throw badRequest("A message needs something in it.");
  const changedCards = cards !== undefined && cardWords(cards) !== cardWords(msg.cards);
  if (body.trim() !== msg.body.trim() || changedCards) await checkAutoMod(space, viewer, access, { text: [body, changedCards ? cardWords(cards) : ""].filter(Boolean).join("\n"), channelId: null, where: `#${channel.name} (an edit)` });
  const next = (await normalizeEmoji(viewer, channel.communityId, body)).trim();
  const mentions = await resolveMentions(viewer, channel, next);
  const editedAt = next === msg.body ? msg.editedAt : new Date();
  await ChannelMessage.updateOne({ _id: msg._id }, { $set: { body: next, mentions, editedAt, ...(cards !== undefined ? { cards } : {}) } });
  emitChannel(channel.communityId, channel._id);
  return (await toMessages([{ ...msg, body: next, mentions, editedAt, cards: nextCards }], viewer, access, space))[0];
}

/**
 * A bot reads a channel it can see, but nothing older than `since` (when the community let it read messages), and
 * nothing deleted or hidden. Up to 100 at a time, oldest first: `before` gets older ones, `after` newer ones.
 */
export async function readMessagesAsBot(bot: IUser, space: Space, access: SpaceAccess, channelSlug: string, since: Date, q: { limit: number; before?: string; after?: string }) {
  const { channel } = await loadChannel(bot, space, access, channelSlug);
  const filter = { channelId: channel._id, deletedAt: null, hiddenAt: null, createdAt: { $gte: since }, ...(q.before ? { _id: { $lt: new Types.ObjectId(q.before) } } : q.after ? { _id: { $gt: new Types.ObjectId(q.after) } } : {}) };
  const rows = await ChannelMessage.find(filter)
    .sort({ _id: q.after ? 1 : -1 })
    .limit(q.limit + 1)
    .lean<IChannelMessage[]>();
  const page = rows.slice(0, q.limit);
  const out = await toMessages(q.after ? page : page.reverse(), bot, access, space);
  return { messages: out.map((m) => ({ id: m.id, body: m.body, ...(m.cards ? { cards: m.cards } : {}), images: m.images, author: m.author, replyTo: m.replyTo?.id ?? null, mentions: m.mentions, createdAt: m.createdAt, editedAt: m.editedAt })), hasMore: rows.length > q.limit };
}

/**
 * A button on a card someone pressed: it must really be on that message, and they must be a member who can see the
 * channel. A read-only channel is fine, so an "Accept the rules" button works in an announcements channel.
 */
export async function findCardButton(viewer: IUser, space: Space, access: SpaceAccess, channelSlug: string, messageId: string, buttonId: string): Promise<{ channel: IChannel; message: IChannelMessage; button: CardButton }> {
  assertNotTimedOut(access);
  if (access.banned || !access.isMember) throw forbidden("Join to use this.");
  const { channel } = await loadChannel(viewer, space, access, channelSlug);
  const message = await ChannelMessage.findOne({ _id: messageId, channelId: channel._id, deletedAt: null, hiddenAt: null }).lean<IChannelMessage>();
  const button = message?.cards?.flatMap((c) => c.buttons ?? []).find((b) => b.id === buttonId);
  if (!message || !button) throw notFound("That button isn't there any more.");
  if (button.disabled) throw forbidden("That button is switched off.");
  return { channel, message, button };
}

export async function deleteMessage(viewer: IUser, space: Space, access: SpaceAccess, channelSlug: string, messageId: string) {
  const { channel } = await loadChannel(viewer, space, access, channelSlug);
  const msg = await ChannelMessage.findOne({ _id: messageId, channelId: channel._id }).lean<IChannelMessage>();
  if (!msg) throw notFound("We couldn't find that message.");
  if (msg.deletedAt) return { deleted: true };

  const own = sid(msg.authorId) === sid(viewer._id);
  const asAdmin = !own && isSiteAdmin(viewer);
  if (own) {
    if (!access.isMember) throw forbidden("You can't do that.");
  } else if (!asAdmin) {
    if (!can(access, "deleteMessages")) throw forbidden("You don't have permission to remove other people's messages.");
    // a webhook's message: anyone allowed to delete messages; a person's: only if they're below you
    if (!msg.webhook) {
      const author = (await standings(space.community._id, [msg.authorId])).get(sid(msg.authorId));
      if (author && author.rank >= (access.rank ?? 0)) throw forbidden("You can't remove a message from someone at or above your rank.");
    }
  }
  await ChannelMessage.updateOne({ _id: msg._id }, { body: "", mentions: [], images: [], cards: [], sticker: null, stickerUrl: null, pinnedAt: null, pinnedById: null, deletedAt: new Date(), deletedById: viewer._id });
  deleteUploads(msg.images ?? []); // its photos and videos go with it
  await deletePoll(msg.pollId);
  emitChannel(channel.communityId, channel._id);
  if (channel.topicId) {
    await Topic.updateOne({ _id: channel.topicId, commentCount: { $gt: 0 } }, { $inc: { commentCount: -1 } });
    emitTopic(channel.communityId, channel.topicId);
  }
  if (!own) await logModDelete(viewer, { communityId: channel.communityId, authorId: msg.authorId }, "channelMessage", msg._id, `Message in ${space.community.name} #${channel.name}: ${(msg.body || cardPreview(msg.cards)).slice(0, 80)}`);
  return { deleted: true };
}

/** Owners and admins pin a message to the top of the channel, or take it down again. */
export async function pinMessage(viewer: IUser, space: Space, access: SpaceAccess, channelSlug: string, messageId: string, pinned: boolean): Promise<ChannelMessageDTO> {
  const { channel } = await loadChannel(viewer, space, access, channelSlug);
  if (!access.canManage) throw forbidden("Only owners and admins can pin messages.");
  rateLimit(`pin:${sid(viewer._id)}`, 30, 60_000);
  const msg = await ChannelMessage.findOne({ _id: messageId, channelId: channel._id, deletedAt: null }).lean<IChannelMessage>();
  if (!msg) throw notFound("We couldn't find that message.");
  if (pinned && !msg.pinnedAt && (await ChannelMessage.countDocuments({ channelId: channel._id, pinnedAt: { $ne: null } })) >= MAX_PINS) {
    throw forbidden(`A channel can have up to ${MAX_PINS} pinned messages. Unpin one first.`);
  }
  const set = pinned ? { pinnedAt: msg.pinnedAt ?? new Date(), pinnedById: msg.pinnedById ?? viewer._id } : { pinnedAt: null, pinnedById: null };
  await ChannelMessage.updateOne({ _id: msg._id }, { $set: set });
  emitChannel(channel.communityId, channel._id);
  return (await toMessages([{ ...msg, ...set }], viewer, access, space))[0];
}

/**
 * Permission to join a voice channel. Audio runs through LiveKit (not this server): we only check who may
 * join, then hand back a signed, short-lived token for that one room.
 */
export async function joinVoice(viewer: IUser, space: Space, access: SpaceAccess, channelSlug: string): Promise<VoiceJoinDTO> {
  assertNotTimedOut(access);
  const { channel, invited } = await loadChannel(viewer, space, access, channelSlug);
  if (channel.type !== "voice") throw forbidden("This isn't a voice channel.");
  if (!VOICE_ENABLED) throw forbidden("Voice channels are coming soon.");
  if (access.banned) throw forbidden("You can't join this channel.");
  if (!access.isMember) throw forbidden("Join the community to talk.");
  if (!canSeeChannel(channel, access, invited)) throw forbidden("You can't join this channel.");
  const cfg = livekitConfig();
  if (!cfg) throw new ApiError(503, "Voice isn't set up on this server yet. An admin needs to add the LiveKit keys (see .env.example).", { code: "voice_not_configured" });
  rateLimit(`voice:${sid(viewer._id)}`, 30, 10 * 60_000);

  const room = `ch_${sid(channel._id)}`;
  const validMinutes = 60;
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    name: viewer.displayName,
    metadata: JSON.stringify({ avatarUrl: viewer.avatarUrl ?? null, handle: viewer.handle }),
    video: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(cfg.apiKey)
    .setSubject(sid(viewer._id))
    .setNotBefore(now - 5)
    .setExpirationTime(now + validMinutes * 60)
    .sign(new TextEncoder().encode(cfg.apiSecret));
  return { url: cfg.url, token, room, identity: sid(viewer._id), validMinutes };
}

/** Pinned messages, newest pin first. */
export async function listPins(viewer: IUser | null, space: Space, access: SpaceAccess, channelSlug: string): Promise<ChannelMessageDTO[]> {
  const { channel } = await loadChannel(viewer, space, access, channelSlug);
  const rows = await ChannelMessage.find({ channelId: channel._id, pinnedAt: { $ne: null }, deletedAt: null })
    .sort({ pinnedAt: -1 })
    .limit(MAX_PINS)
    .lean<IChannelMessage[]>();
  return toMessages(rows, viewer, access, space);
}

/** Members who can read the channel may react (announcement channels included); banned and non-members may not. */
export async function reactToMessage(viewer: IUser, space: Space, access: SpaceAccess, channelSlug: string, messageId: string, kind: ReactionKind): Promise<ReactionDTO[]> {
  assertNotTimedOut(access);
  const { channel } = await loadChannel(viewer, space, access, channelSlug);
  if (access.banned || !access.isMember) throw forbidden("Join to react.");
  rateLimit(`react:${sid(viewer._id)}`, 60, 30_000);
  const msg = await ChannelMessage.findOne({ _id: messageId, channelId: channel._id, deletedAt: null }).select("_id authorId").lean<Pick<IChannelMessage, "_id" | "authorId">>();
  if (!msg) throw notFound("We couldn't find that message.");
  const reactions = await toggleReaction("channel", msg._id, viewer._id, kind);
  void import("./bots.service").then((b) => b.emitBotEvent(channel.communityId, "reaction", { channel: { id: sid(channel._id), slug: channel.slug }, messageId: sid(msg._id), kind, user: { id: sid(viewer._id), handle: viewer.handle }, added: reactions.some((r) => r.kind === kind && r.mine) }, { except: viewer._id, channel }));
  // a good reaction earns the author points (once per person per message; bad ones earn nothing and take nothing)
  if (GOOD_REACTIONS.has(kind) && reactions.some((r) => r.mine && r.kind === kind)) awardPointsLater(msg.authorId, "reaction", `channel:${sid(msg._id)}:${sid(viewer._id)}`, viewer._id);
  emitChannel(channel.communityId, channel._id);
  return reactions;
}

/** Fresh reaction counts for messages already on screen (polled by the chat so reactions show up live). */
export async function reactionsFor(viewer: IUser | null, space: Space, access: SpaceAccess, channelSlug: string, ids: string[]): Promise<Record<string, ReactionDTO[]>> {
  const { channel } = await loadChannel(viewer, space, access, channelSlug);
  const valid = await ChannelMessage.find({ _id: { $in: ids }, channelId: channel._id, deletedAt: null }).select("_id").lean<{ _id: Types.ObjectId }[]>();
  const map = await summarizeReactions("channel", valid.map((v) => v._id), viewer?._id ?? null);
  return Object.fromEntries(valid.map((v) => [sid(v._id), map.get(sid(v._id)) ?? []]));
}

/** Mark the channel read up to its latest message (members only; a no-op otherwise). */
export async function markRead(viewer: IUser, space: Space, access: SpaceAccess, channelSlug: string) {
  const { channel } = await loadChannel(viewer, space, access, channelSlug);
  if (!access.isMember) return { read: false };
  await ChannelRead.updateOne({ userId: viewer._id, channelId: channel._id }, { $set: { lastReadMessageId: channel.lastMessageId, communityId: channel.communityId } }, { upsert: true });
  return { read: true };
}

/** Everything you can see in the community and its groups: read up to the newest message. */
export async function markCommunityRead(viewer: IUser, space: Space, access: SpaceAccess) {
  if (!access.isMember) return { read: false };
  const data = await listChannels(viewer, space, access);
  const ids = [...data.channels, ...data.groups.flatMap((g) => g.channels)].filter((c) => c.unread || c.mentions > 0).map((c) => c.id);
  if (!ids.length) return { read: true };
  const rows = await Channel.find({ _id: { $in: ids } }).select("_id communityId lastMessageId").lean<Pick<IChannel, "_id" | "communityId" | "lastMessageId">[]>();
  await ChannelRead.bulkWrite(rows.map((c) => ({ updateOne: { filter: { userId: viewer._id, channelId: c._id }, update: { $set: { lastReadMessageId: c.lastMessageId, communityId: c.communityId } }, upsert: true } })));
  return { read: true };
}

/** Your own mute for one channel. */
export async function setChannelMuted(viewer: IUser, space: Space, access: SpaceAccess, channelSlug: string, muted: boolean) {
  const { channel } = await loadChannel(viewer, space, access, channelSlug);
  if (!access.isMember) throw forbidden("Join first.");
  await ChannelRead.updateOne({ userId: viewer._id, channelId: channel._id }, { $set: { muted, communityId: channel.communityId } }, { upsert: true });
  return { muted };
}

/** Takes out people who muted this channel or its community, so chat doesn't notify them. */
async function notMuted(ids: Types.ObjectId[], channel: Pick<IChannel, "_id" | "communityId">): Promise<Types.ObjectId[]> {
  if (!ids.length) return ids;
  const [byCommunity, byChannel] = await Promise.all([
    Membership.find({ userId: { $in: ids }, communityId: channel.communityId, subcommunityId: null, muted: true }).select("userId").lean<{ userId: Types.ObjectId }[]>(),
    ChannelRead.find({ userId: { $in: ids }, channelId: channel._id, muted: true }).select("userId").lean<{ userId: Types.ObjectId }[]>(),
  ]);
  const off = new Set([...byCommunity, ...byChannel].map((r) => sid(r.userId)));
  return off.size ? ids.filter((id) => !off.has(sid(id))) : ids;
}

/* ------------------------------------------------------------------ */
/* Staff (for the info panels)                                         */
/* ------------------------------------------------------------------ */

export async function listStaff(space: Space, access: SpaceAccess): Promise<StaffDTO[]> {
  assertCanView(access, "the team");
  const rows = await Membership.find({ ...scopeOf(space), status: "active", role: { $in: ["owner", "admin"] } }).sort({ createdAt: 1 }).limit(30).lean<IMembership[]>();
  const briefs = await loadBriefs(rows.map((r) => r.userId));
  return rows
    .sort((a, b) => (a.role === b.role ? 0 : a.role === "owner" ? -1 : 1))
    .flatMap((r) => {
      const user = briefs.get(sid(r.userId));
      return user ? [{ user, role: r.role }] : [];
    });
}

/* ------------------------------------------------------------------ */
/* A board post's chat                                                 */
/* ------------------------------------------------------------------ */

/** Where a post opens (its board, with the post in the side panel). */
async function postHref(space: Space, post: Pick<ITopic, "_id" | "boardId">) {
  const board = post.boardId ? await Board.findById(post.boardId).select("slug").lean<{ slug: string }>() : null;
  return `/communities/${space.community.slug}?view=topics${board ? `&b=${board.slug}` : ""}&t=${sid(post._id)}`;
}

/** A reply in a post's chat: the post's count and "last activity" move, you follow it, and its followers hear. */
async function onPostReply(viewer: IUser, post: Pick<ITopic, "_id" | "title" | "communityId">, href: string, said: string, alreadyTold: Types.ObjectId[]) {
  await Promise.all([
    Topic.updateOne({ _id: post._id }, { $inc: { commentCount: 1 }, $set: { lastActivityAt: new Date() } }),
    TopicFollow.updateOne({ topicId: post._id, userId: viewer._id }, { $setOnInsert: { topicId: post._id, userId: viewer._id } }, { upsert: true }).catch(() => undefined),
  ]);
  emitTopic(post.communityId, post._id);
  const told = new Set([sid(viewer._id), ...alreadyTold.map(sid)]);
  const followers = (await TopicFollow.find({ topicId: post._id }).select("userId").limit(2000).lean<{ userId: Types.ObjectId }[]>()).map((f) => f.userId).filter((u) => !told.has(sid(u)));
  if (!followers.length) return;
  notify(followers, { title: `${viewer.displayName} replied in "${post.title}"`, body: said, data: { href } }, { actorId: viewer._id, category: "replies", groupKey: `topic:${sid(post._id)}`, many: (n) => `${n} new replies in "${post.title}"`, ref: `topic:${sid(post._id)}` });
}

/**
 * A post's chat, made the first time someone opens the post. It's an ordinary channel (so replies get pictures,
 * stickers, reactions, @mentions, pins and live updates like any chat) that never shows in the channel list.
 * Comments written before posts had chats move into it, oldest first, keeping who answered whom.
 */
export async function ensureTopicThread(viewer: IUser | null, access: SpaceAccess, topic: Pick<ITopic, "_id" | "title" | "authorId" | "locked" | "communityId">): Promise<ChannelDTO> {
  let channel = await Channel.findOne({ topicId: topic._id }).lean<IChannel>();
  if (!channel) {
    try {
      const doc = await Channel.create({ communityId: topic.communityId, subcommunityId: null, categoryId: null, slug: `post-${sid(topic._id)}`, name: topic.title.slice(0, 40), type: topic.locked ? "announcement" : "text", visibility: "all", position: 0, createdById: topic.authorId, topicId: topic._id });
      channel = doc.toObject() as IChannel;
      await moveOldComments(topic, channel);
      channel = (await Channel.findById(channel._id).lean<IChannel>())!;
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
      channel = (await Channel.findOne({ topicId: topic._id }).lean<IChannel>())!; // opened twice at once: the other request made it
    }
  }
  const read = viewer && access.isMember ? await ChannelRead.findOne({ userId: viewer._id, channelId: channel._id }).lean<IChannelRead>() : null;
  return toChannel(channel, { access, readBy: new Map(read ? [[sid(channel._id), read]] : []), invited: new Set(), mentionCounts: new Map(), siteAdmin: !!viewer && isSiteAdmin(viewer) });
}

async function moveOldComments(topic: Pick<ITopic, "_id" | "communityId">, channel: IChannel) {
  const comments = await TopicComment.find({ topicId: topic._id, deletedAt: null }).sort({ _id: 1 }).limit(2000).lean<ITopicComment[]>();
  if (!comments.length) return;
  const idOf = new Map<string, Types.ObjectId>();
  // ids made in order, so the chat pages through them oldest to newest; the old timestamps are kept
  const rows = comments.map((c) => {
    const _id = new Types.ObjectId();
    idOf.set(sid(c._id), _id);
    return { _id, channelId: channel._id, communityId: topic.communityId, authorId: c.authorId, body: c.body.slice(0, 2000), sticker: null, stickerUrl: null, images: [], replyToId: c.parentId ? (idOf.get(sid(c.parentId)) ?? null) : null, pinnedAt: null, pinnedById: null, mentions: [], editedAt: c.editedAt ?? null, deletedAt: null, deletedById: null, createdAt: c.createdAt };
  });
  // straight into the collection: going through the model would stamp them all with today's date
  await ChannelMessage.collection.insertMany(rows);
  const last = rows[rows.length - 1];
  await Promise.all([
    Channel.updateOne({ _id: channel._id }, { $set: { lastMessageId: last._id, lastMessageAt: last.createdAt } }),
    Topic.updateOne({ _id: topic._id }, { $set: { commentCount: rows.length } }),
  ]);
}

/** A post was locked or unlocked (only owners and admins reply in a locked post's chat), or renamed. */
export async function syncTopicThread(topic: Pick<ITopic, "_id" | "title" | "locked">) {
  await Channel.updateOne({ topicId: topic._id }, { $set: { type: topic.locked ? "announcement" : "text", name: topic.title.slice(0, 40) } });
}

/** A post was deleted: its chat goes too (messages, their files, read markers). */
export async function deleteTopicThread(topicId: Types.ObjectId) {
  const channel = await Channel.findOne({ topicId }).select("_id").lean<{ _id: Types.ObjectId }>();
  if (!channel) return;
  const withFiles = await ChannelMessage.find({ channelId: channel._id, "images.0": { $exists: true } }).select("images").lean<{ images: string[] }[]>();
  deleteUploads(withFiles.flatMap((m) => m.images));
  await Promise.all([ChannelMessage.deleteMany({ channelId: channel._id }), ChannelRead.deleteMany({ channelId: channel._id }), Channel.deleteOne({ _id: channel._id })]);
}
