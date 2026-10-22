import { VOICE_ENABLED, slowModeLabel } from "@/lib/constants";
import { isSiteAdmin } from "../policies/hosting";
import { SignJWT } from "jose";
import { deleteUploads } from "./media.service";
import { assertStickerUrl, noteStickerUse } from "./stickers.service";
import { livekitConfig } from "../env";
import { previewOf, toReplyRef } from "./replies";
import { type ReactionKind } from "@/lib/reactions";
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
  type IChannelMember,
  type IChannelMessage,
  type IChannelRead,
} from "../models/Channel";
import { Community } from "../models/Community";
import { Membership, type IMembership } from "../models/Membership";
import { Subcommunity, type ISubcommunity } from "../models/Subcommunity";
import { User, type IUser } from "../models/User";
import {
  assertCanManage,
  assertCanView,
  canPostInChannel,
  canSeeChannel,
  outranks,
  subAccessFrom,
  type Space,
  type SpaceAccess,
} from "../policies/access";
import { loadBriefs, toBrief } from "../serializers";
import type { categorySchema, channelCreateSchema, channelUpdateSchema, chatListQuery } from "../validators/schemas";
import { hiddenUserIds } from "./blocks";
import { escapeRegex, sid, slugify } from "./helpers";
import { notify } from "./push.service";
import { emitChannel } from "./realtime";
import { mentionBriefs, resolveMentions } from "./mentions";

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

const toCategory = (c: IChannelCategory): ChannelCategoryDTO => ({ id: sid(c._id), name: c.name, position: c.position });

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
    canPost: canPostInChannel(c, ctx.access, invited),
    mentions: ctx.mentionCounts.get(sid(c._id)) ?? 0,
    ...(ctx.memberCounts?.has(sid(c._id)) ? { memberCount: ctx.memberCounts.get(sid(c._id)) } : {}),
    slowModeSec: c.slowModeSec ?? 0,
    slowModeExempt: slowModeExempt(ctx.access, !!ctx.siteAdmin),
  };
}

/**
 * Unread @mentions per channel for this viewer (capped, and only for channels that have unread). With
 * `unreadOut`, also how many messages are unread in each (other people's, capped at 99).
 */
async function countMentions(viewerId: Types.ObjectId, channels: IChannel[], readBy: Map<string, IChannelRead>, unreadOut?: Map<string, number>): Promise<Map<string, number>> {
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
        ChannelMessage.countDocuments({ channelId: c._id, mentions: viewerId, deletedAt: null, _id: { $gt: after } }, { limit: 99 }),
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
    Channel.find(scope).sort({ position: 1, createdAt: 1 }).lean<IChannel[]>(),
    viewer && access.isMember ? ChannelRead.find({ userId: viewer._id, communityId }).lean<IChannelRead[]>() : Promise.resolve<IChannelRead[]>([]),
    invitedSet(viewer, communityId),
  ]);
  const readBy = new Map(reads.map((r) => [sid(r.channelId), r]));
  const visible = channels.filter((c) => canSeeChannel(c, access, invited.has(sid(c._id))) && (VOICE_ENABLED || c.type !== "voice"));
  const unreadCounts = new Map<string, number>();
  const mentionCounts = viewer && access.isMember ? await countMentions(viewer._id, visible, readBy, unreadCounts) : new Map<string, number>();
  const memberCounts = access.canManage ? await guestCounts(visible) : undefined;
  const siteAdmin = !!viewer && isSiteAdmin(viewer);
  const ctx: DtoCtx = { access, readBy, invited, mentionCounts, unreadCounts, memberCounts, siteAdmin };

  // The groups you're in (community list only), each with the channels you can see.
  const groups: ChannelGroupDTO[] = [];
  if (!space.sub && viewer) {
    const subMs = await Membership.find({ userId: viewer._id, communityId, subcommunityId: { $ne: null }, status: "active" }).lean<IMembership[]>();
    if (subMs.length) {
      const subs = await Subcommunity.find({ _id: { $in: subMs.map((m) => m.subcommunityId) } }).sort({ createdAt: 1 }).lean<ISubcommunity[]>();
      const parentM = await Membership.findOne({ userId: viewer._id, communityId, subcommunityId: null }).lean<IMembership>();
      for (const sub of subs) await ensureDefaultGroupChannels(sub._id, communityId, sub.ownerId);
      const subChannels = await Channel.find({ communityId, subcommunityId: { $in: subs.map((s) => s._id) } }).sort({ position: 1, createdAt: 1 }).lean<IChannel[]>();
      for (const sub of subs) {
        const m = subMs.find((x) => sid(x.subcommunityId!) === sid(sub._id)) ?? null;
        const gAccess = subAccessFrom(sub, parentM, m, isSiteAdmin(viewer));
        const rows = subChannels.filter((c) => sid(c.subcommunityId!) === sid(sub._id) && canSeeChannel(c, gAccess, invited.has(sid(c._id))) && (VOICE_ENABLED || c.type !== "voice"));
        const gUnread = new Map<string, number>();
        const gMentions = await countMentions(viewer._id, rows, readBy, gUnread);
        const gCounts = gAccess.canManage ? await guestCounts(rows) : undefined;
        groups.push({
          id: sid(sub._id),
          slug: sub.slug,
          name: sub.name,
          visibility: sub.visibility,
          role: gAccess.role,
          channels: rows.map((c) => toChannel(c, { access: gAccess, readBy, invited, mentionCounts: gMentions, unreadCounts: gUnread, memberCounts: gCounts, siteAdmin })),
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
  const channel = await Channel.findOne({ ...scopeOf(space), slug: channelSlug.toLowerCase() }).lean<IChannel>();
  if (!channel) throw notFound("We couldn't find that channel.");
  const invited = !!viewer && channel.visibility === "invite" && !!(await ChannelMember.exists({ channelId: channel._id, userId: viewer._id }));
  if (!canSeeChannel(channel, access, invited)) throw notFound("We couldn't find that channel.");
  return { channel, invited };
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
  assertCanManage(access);
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
  assertCanManage(access);
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
  if (patch.categoryId !== undefined) set.categoryId = await assertCategory(space, patch.categoryId);
  if (patch.slowModeSec !== undefined) set.slowModeSec = patch.slowModeSec;
  await Channel.updateOne({ _id: channel._id }, set);
  // open chats and channel lists pick the change up (slow mode, name, who can post) without a reload
  emitChannel(channel.communityId, channel._id);
  const next = await Channel.findById(channel._id).lean<IChannel>();
  const counts = await guestCounts([next!]);
  return toChannel(next!, { access, readBy: new Map(), invited: new Set(), mentionCounts: new Map(), memberCounts: counts });
}

export async function deleteChannel(viewer: IUser, space: Space, access: SpaceAccess, channelSlug: string) {
  assertCanManage(access);
  const { channel } = await loadChannel(viewer, space, access, channelSlug);
  const withFiles = await ChannelMessage.find({ channelId: channel._id, "images.0": { $exists: true } }).select("images").lean<{ images: string[] }[]>();
  deleteUploads(withFiles.flatMap((m) => m.images));
  await Promise.all([
    ChannelMessage.deleteMany({ channelId: channel._id }),
    ChannelRead.deleteMany({ channelId: channel._id }),
    ChannelMember.deleteMany({ channelId: channel._id }),
    Channel.deleteOne({ _id: channel._id }),
  ]);
  return { deleted: true };
}

export async function createCategory(space: Space, access: SpaceAccess, input: z.infer<typeof categorySchema>): Promise<ChannelCategoryDTO> {
  assertCanManage(access);
  if (space.sub) throw badRequest("Groups don't use categories.");
  const communityId = space.community._id;
  if ((await ChannelCategory.countDocuments({ communityId })) >= MAX_CATEGORIES) throw badRequest(`A community can have up to ${MAX_CATEGORIES} categories.`);
  const position = await ChannelCategory.countDocuments({ communityId });
  const doc = await ChannelCategory.create({ communityId, name: input.name, position });
  return toCategory(doc.toObject());
}

export async function renameCategory(space: Space, access: SpaceAccess, categoryId: string, input: z.infer<typeof categorySchema>) {
  assertCanManage(access);
  const cat = await ChannelCategory.findOneAndUpdate({ _id: categoryId, communityId: space.community._id }, { name: input.name }, { returnDocument: "after" }).lean<IChannelCategory>();
  if (!cat) throw notFound("We couldn't find that category.");
  return toCategory(cat);
}

/** Channels inside a deleted category are kept and become uncategorised. */
export async function deleteCategory(space: Space, access: SpaceAccess, categoryId: string) {
  assertCanManage(access);
  const res = await ChannelCategory.deleteOne({ _id: categoryId, communityId: space.community._id });
  if (!res.deletedCount) throw notFound("We couldn't find that category.");
  await Channel.updateMany({ communityId: space.community._id, categoryId }, { categoryId: null });
  return { deleted: true };
}

/* ------------------------------------------------------------------ */
/* Private channel guest list                                          */
/* ------------------------------------------------------------------ */

async function loadPrivateChannel(viewer: IUser, space: Space, access: SpaceAccess, channelSlug: string) {
  assertCanManage(access);
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
    .select("handle displayName avatarUrl avatarFrame nameEffect rank country city")
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
  // Managers may delete anything below their own rank; work out the authors' roles in one query.
  const roleByUser = new Map<string, IMembership["role"]>();
  if (viewer && access.canManage) {
    const ms = await Membership.find({ ...scopeOf(space), status: "active", userId: { $in: [...new Set(rows.map((r) => sid(r.authorId)))] } })
      .select("userId role")
      .lean<Pick<IMembership, "userId" | "role">[]>();
    for (const m of ms) roleByUser.set(sid(m.userId), m.role);
  }
  const me = viewer ? sid(viewer._id) : "";
  // the messages these rows answer (same channel only), with who wrote them
  const replyIds = [...new Set(rows.map((r) => (r.replyToId ? sid(r.replyToId) : "")).filter(Boolean))];
  const replyRows = replyIds.length ? await ChannelMessage.find({ _id: { $in: replyIds }, channelId: rows[0].channelId }).lean<IChannelMessage[]>() : [];
  const replyAuthors = await loadBriefs(replyRows.map((r) => r.authorId));
  const replyMap = new Map(replyRows.map((r) => [sid(r._id), toReplyRef(r, replyAuthors.get(sid(r.authorId))?.displayName ?? "Someone")]));
  return rows.flatMap((r) => {
    const author = authors.get(sid(r.authorId));
    if (!author) return [];
    const authorRole = roleByUser.get(sid(r.authorId));
    const canEdit = !!viewer && !r.deletedAt && !r.sticker && !r.stickerUrl && sid(r.authorId) === me && access.isMember;
    const canDelete = !!viewer && !r.deletedAt && (sid(r.authorId) === me ? access.isMember : access.canManage && (authorRole === undefined || outranks(access.role, authorRole)));
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
        mentionsMe: !!me && mentions.some((m) => m.id === me),
      },
    ];
  });
}

/**
 * Newest page first-load, older pages via `before`, new messages via `after`.
 * Always returned oldest → newest so the client can render or prepend directly.
 */
export async function listMessages(viewer: IUser | null, space: Space, access: SpaceAccess, channelSlug: string, q: ListQuery): Promise<ChatPage> {
  const { channel } = await loadChannel(viewer, space, access, channelSlug);
  const hidden = await hiddenUserIds(viewer?._id ?? null); // people you've blocked (or who blocked you)
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

export async function postMessage(viewer: IUser, space: Space, access: SpaceAccess, channelSlug: string, input: { body: string; sticker?: string; stickerUrl?: string; images?: string[]; replyToId?: string }): Promise<ChannelMessageDTO> {
  const { body, sticker, images = [], replyToId } = input;
  const stickerUrl = input.stickerUrl && !sticker ? assertStickerUrl(input.stickerUrl) : null;
  const isSticker = !!sticker || !!stickerUrl;
  const { channel, invited } = await loadChannel(viewer, space, access, channelSlug);
  if (!canPostInChannel(channel, access, invited)) {
    if (access.banned) throw forbidden("You can't post here.");
    if (!access.isMember) throw forbidden("Join to chat.");
    throw forbidden("Only owners and admins can post in this channel.");
  }
  rateLimit(`chat:${sid(viewer._id)}`, 20, 15_000);
  await assertSlowMode(viewer, access, channel);

  const mentions = isSticker ? [] : await resolveMentions(viewer, channel, body);
  const replyTarget = replyToId ? await ChannelMessage.findOne({ _id: replyToId, channelId: channel._id }).select("_id authorId").lean<{ _id: Types.ObjectId; authorId: Types.ObjectId }>() : null;
  const doc = await ChannelMessage.create({ channelId: channel._id, communityId: channel.communityId, authorId: viewer._id, body: isSticker ? "" : body, sticker: sticker ?? null, stickerUrl, images: isSticker ? [] : images, replyToId: replyTarget?._id ?? null, mentions });
  noteStickerUse(viewer._id, stickerUrl);
  await Promise.all([
    Channel.updateOne({ _id: channel._id }, { lastMessageId: doc._id, lastMessageAt: doc.createdAt }),
    ChannelRead.updateOne({ userId: viewer._id, channelId: channel._id }, { $set: { lastReadMessageId: doc._id, communityId: channel.communityId } }, { upsert: true }),
  ]);
  emitChannel(channel.communityId, channel._id);
  // Phones hear about it only when it is for them: an @mention or an answer to their message.
  const targets = [...(mentions ?? []), ...(replyTarget ? [replyTarget.authorId] : [])].filter((id) => sid(id) !== sid(viewer._id));
  notify(targets, {
    title: `${viewer.displayName} in #${channel.name}`,
    body: previewOf({ body: isSticker ? "" : body, sticker, stickerUrl, images }),
    data: { type: "channel", communitySlug: space.community.slug, channelSlug: channel.slug, ...(space.sub ? { subSlug: space.sub.slug } : {}) },
  }, { category: "mentions", groupKey: `chat:${sid(channel._id)}`, many: (n) => `${n} mentions and replies in #${channel.name}`, ref: `channel:${sid(channel._id)}` });
  return (await toMessages([doc.toObject()], viewer, access, space))[0];
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
export async function editMessage(viewer: IUser, space: Space, access: SpaceAccess, channelSlug: string, messageId: string, body: string): Promise<ChannelMessageDTO> {
  const { channel, invited } = await loadChannel(viewer, space, access, channelSlug);
  const msg = await ChannelMessage.findOne({ _id: messageId, channelId: channel._id }).lean<IChannelMessage>();
  if (!msg || msg.deletedAt) throw notFound("We couldn't find that message.");
  if (sid(msg.authorId) !== sid(viewer._id)) throw forbidden("You can only edit your own messages.");
  if (msg.sticker || msg.stickerUrl) throw forbidden("Stickers can't be edited. Delete it and send another.");
  if (!canPostInChannel(channel, access, invited)) throw forbidden("You can't post here any more, so you can't edit this.");
  rateLimit(`chat-edit:${sid(viewer._id)}`, 30, 60_000);
  const next = body.trim();
  const mentions = await resolveMentions(viewer, channel, next);
  const editedAt = next === msg.body ? msg.editedAt : new Date();
  await ChannelMessage.updateOne({ _id: msg._id }, { $set: { body: next, mentions, editedAt } });
  emitChannel(channel.communityId, channel._id);
  return (await toMessages([{ ...msg, body: next, mentions, editedAt }], viewer, access, space))[0];
}

export async function deleteMessage(viewer: IUser, space: Space, access: SpaceAccess, channelSlug: string, messageId: string) {
  const { channel } = await loadChannel(viewer, space, access, channelSlug);
  const msg = await ChannelMessage.findOne({ _id: messageId, channelId: channel._id }).lean<IChannelMessage>();
  if (!msg) throw notFound("We couldn't find that message.");
  if (msg.deletedAt) return { deleted: true };

  const own = sid(msg.authorId) === sid(viewer._id);
  if (own) {
    if (!access.isMember) throw forbidden("You can't do that.");
  } else {
    if (!access.canManage) throw forbidden("Only owners and admins can remove other people's messages.");
    const authorM = await Membership.findOne({ ...scopeOf(space), userId: msg.authorId, status: "active" }).select("role").lean<Pick<IMembership, "role">>();
    if (authorM && !outranks(access.role, authorM.role)) throw forbidden("You can't remove a message from someone of equal or higher rank.");
  }
  await ChannelMessage.updateOne({ _id: msg._id }, { body: "", mentions: [], images: [], sticker: null, stickerUrl: null, pinnedAt: null, pinnedById: null, deletedAt: new Date(), deletedById: viewer._id });
  deleteUploads(msg.images ?? []); // its photos and videos go with it
  emitChannel(channel.communityId, channel._id);
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
  const { channel } = await loadChannel(viewer, space, access, channelSlug);
  if (access.banned || !access.isMember) throw forbidden("Join to react.");
  rateLimit(`react:${sid(viewer._id)}`, 60, 30_000);
  const msg = await ChannelMessage.findOne({ _id: messageId, channelId: channel._id, deletedAt: null }).select("_id").lean();
  if (!msg) throw notFound("We couldn't find that message.");
  const reactions = await toggleReaction("channel", msg._id, viewer._id, kind);
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
