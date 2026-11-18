import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Types } from "mongoose";
import { z } from "zod";
import { ALL_PERMISSIONS, isBotPermission, isPermission, READ_MESSAGES } from "@/lib/roles";
import type { BotCommandRuleDTO, UserBrief } from "@/lib/types";
import { appUrl } from "../env";
import { assertPublicHttpUrl, safeLookup } from "../net-guard";
import { ApiError, badRequest, forbidden, notFound } from "../http/errors";
import { CARD_LIMITS } from "@/lib/cards";
import { rateLimit, rateLimitShared } from "../http/rate-limit";
import { BotApp, type BotCommand, type IBotApp } from "../models/BotApp";
import { Channel, ChannelMember, type IChannel } from "../models/Channel";
import { Community, type ICommunity } from "../models/Community";
import { CommunityRole, type ICommunityRole } from "../models/CommunityRole";
import { Membership } from "../models/Membership";
import { ModAction } from "../models/ModAction";
import { User, type IUser } from "../models/User";
import { Webhook } from "../models/Webhook";
import { isSiteAdmin } from "../policies/hosting";
import { canSeeChannel, spaceAccess, type Space, type SpaceAccess } from "../policies/access";
import { loadBriefs } from "../serializers";
import { botMessageSchema, cardsSchema } from "./cards";
import { recountMembers, sid } from "./helpers";
import { resolveSpaceFor } from "./spaces.service";
import { getPlanConfig, planOf } from "./subscriptions.service";

/**
 * Bots (models/BotApp). Pro members make them in Settings → Developers; a community's owner (or a role with "Manage
 * webhooks and bots") adds one with an invite link, choosing which of its permissions to give. The bot then acts
 * through its own account, with a role holding those permissions, and only on people below that role. A
 * community's bots and webhooks share one limit (its owner's plan: Free 2, Lite 5, Pro 10). Never in 18+
 * communities, never in DMs. Events go to the bot's endpoint, signed; it answers through /api/bot/v1.
 */

const MAX_APPS = 10;
const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const newToken = (appId: Types.ObjectId) => `kbt_${sid(appId)}_${randomBytes(30).toString("base64url")}`;
export const botInviteUrl = (appId: string) => `${appUrl()}/bots/${appId}`;

const publicEndpoint = (u: string) => {
  if (process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u)) return true;
  try {
    assertPublicHttpUrl(u);
    return u.startsWith("https://");
  } catch {
    return false;
  }
};
const httpsUrl = z.string().trim().url().max(500).refine(publicEndpoint, "Use a public https:// address on the normal port.");
export const botCreateSchema = z.object({
  name: z.string().trim().min(2, "Give it a name.").max(32),
  description: z.string().trim().max(300).default(""),
  avatarUrl: z.union([z.string().url().max(600), z.literal(""), z.null()]).optional(),
  endpoint: z.union([httpsUrl, z.literal(""), z.null()]).optional(),
  permissions: z.array(z.string()).max(20).default([]),
});
export const botUpdateSchema = botCreateSchema.partial();
const commandName = z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{1,32}$/, "Command names: 1 to 32 letters, numbers, - or _");
export const commandsSchema = z.object({
  commands: z.array(z.object({ name: commandName, description: z.string().trim().max(100).default(""), options: z.array(z.object({ name: commandName, description: z.string().trim().max(100).default(""), required: z.boolean().default(false) })).max(10).default([]) })).max(25),
});

export interface BotDTO {
  id: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  endpoint: string | null;
  permissions: string[];
  commands: BotCommand[];
  user: UserBrief | null;
  /** owner only */
  signingSecret?: string;
  inviteUrl: string;
  communities: number;
  failures: number;
  disabled: boolean;
}

async function toDto(a: IBotApp, owner: boolean): Promise<BotDTO> {
  const [briefs, communities] = await Promise.all([loadBriefs([a.userId]), Membership.countDocuments({ userId: a.userId, subcommunityId: null, status: "active" })]);
  return { id: sid(a._id), name: a.name, description: a.description, avatarUrl: a.avatarUrl, endpoint: owner ? a.endpoint : null, permissions: a.permissions, commands: a.commands, user: briefs.get(sid(a.userId)) ?? null, ...(owner ? { signingSecret: a.signingSecret } : {}), inviteUrl: botInviteUrl(sid(a._id)), communities, failures: a.failures ?? 0, disabled: !!a.disabledAt };
}

/* ------------------------------ Settings → Developers ------------------------------ */

export async function myBots(viewer: IUser): Promise<{ items: BotDTO[]; canCreate: boolean; reason: string | null }> {
  const rows = await BotApp.find({ ownerId: viewer._id }).sort({ createdAt: -1 }).lean<IBotApp[]>();
  const pro = planOf(viewer) === "pro" || isSiteAdmin(viewer);
  return { items: await Promise.all(rows.map((r) => toDto(r, true))), canCreate: pro && rows.length < MAX_APPS, reason: !pro ? "Making bots comes with Pro." : rows.length >= MAX_APPS ? `You can have up to ${MAX_APPS} bots.` : null };
}

async function freeHandle(name: string): Promise<string> {
  const base = (name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12) || "bot") + "_bot";
  for (let i = 0; i < 20; i++) {
    const h = i ? `${base.slice(0, 16)}${i}` : base;
    if (!(await User.exists({ handle: h }))) return h;
  }
  return `bot_${randomBytes(6).toString("hex")}`;
}

export async function createBot(viewer: IUser, input: z.infer<typeof botCreateSchema>): Promise<{ bot: BotDTO; token: string }> {
  const { canCreate, reason } = await myBots(viewer);
  if (!canCreate) throw forbidden(reason ?? "You can't make a bot.");
  rateLimit(`bot-create:${sid(viewer._id)}`, 10, 60 * 60_000);
  if (/\bklique\b|\badmin\b|\bofficial\b|\bmoderator\b/i.test(input.name)) throw badRequest("Pick a name that doesn't look like Klique or its staff.");
  const appId = new Types.ObjectId();
  const token = newToken(appId);
  const user = await User.create({
    handle: await freeHandle(input.name),
    email: `bot-${sid(appId)}@bots.klique.invalid`,
    displayName: input.name,
    avatarUrl: input.avatarUrl || null,
    country: viewer.country,
    city: viewer.city,
    onboardedAt: new Date(),
    emailVerifiedAt: new Date(),
    dmPolicy: "nobody",
    bot: { appId },
  } as never);
  const app = await BotApp.create({ _id: appId, ownerId: viewer._id, userId: user._id, name: input.name, description: input.description, avatarUrl: input.avatarUrl || null, endpoint: input.endpoint || null, tokenHash: hash(token), signingSecret: randomBytes(24).toString("hex"), permissions: input.permissions.filter(isBotPermission) });
  return { bot: await toDto(app.toObject(), true), token };
}

async function ownApp(viewer: IUser, id: string): Promise<IBotApp> {
  const a = await BotApp.findOne({ _id: id, ownerId: viewer._id }).lean<IBotApp>();
  if (!a) throw notFound("We couldn't find that bot.");
  return a;
}

export async function updateBot(viewer: IUser, id: string, patch: z.infer<typeof botUpdateSchema>): Promise<BotDTO> {
  const a = await ownApp(viewer, id);
  const set: Partial<IBotApp> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.avatarUrl !== undefined) set.avatarUrl = patch.avatarUrl || null;
  if (patch.endpoint !== undefined) Object.assign(set, { endpoint: patch.endpoint || null, failures: 0, disabledAt: null });
  if (patch.permissions !== undefined) set.permissions = patch.permissions.filter(isBotPermission);
  await BotApp.updateOne({ _id: a._id }, { $set: set });
  await User.updateOne({ _id: a.userId }, { $set: { ...(set.name ? { displayName: set.name } : {}), ...(set.avatarUrl !== undefined ? { avatarUrl: set.avatarUrl } : {}) } });
  return toDto((await BotApp.findById(a._id).lean<IBotApp>())!, true);
}

/** A new token (the old one stops working at once). */
export async function regenerateBotToken(viewer: IUser, id: string): Promise<{ token: string }> {
  const a = await ownApp(viewer, id);
  const token = newToken(a._id);
  await BotApp.updateOne({ _id: a._id }, { $set: { tokenHash: hash(token) } });
  return { token };
}

/** Delete a bot: it leaves every community (its roles go), its account is switched off; its old messages stay. */
export async function deleteBot(viewer: IUser, id: string) {
  const a = await ownApp(viewer, id);
  const where = await Membership.find({ userId: a.userId, subcommunityId: null }).select("communityId").lean<{ communityId: Types.ObjectId }[]>();
  for (const m of where) await removeFrom(m.communityId, a, viewer, "bot.delete");
  await User.updateOne({ _id: a.userId }, { $set: { suspendedAt: new Date(), suspendedReason: "Deleted bot", displayName: `${a.name} (deleted)` } });
  await BotApp.deleteOne({ _id: a._id });
  return { deleted: true };
}

/* ------------------------------ adding to a community ------------------------------ */

/** Where you may add bots: communities you own, or where a role lets you manage webhooks and bots (never 18+). */
async function manageable(viewer: IUser): Promise<ICommunity[]> {
  const ms = await Membership.find({ userId: viewer._id, subcommunityId: null, status: "active" }).select("communityId role roleIds").lean<{ communityId: Types.ObjectId; role: string; roleIds?: Types.ObjectId[] }[]>();
  const roleIds = ms.flatMap((m) => m.roleIds ?? []);
  const withPerm = new Set((roleIds.length ? await CommunityRole.find({ _id: { $in: roleIds }, permissions: "manageWebhooks" }).distinct("communityId") : []).map(String));
  const ids = ms.filter((m) => m.role === "owner" || withPerm.has(sid(m.communityId)) || isSiteAdmin(viewer)).map((m) => m.communityId);
  return Community.find({ _id: { $in: ids }, adult: { $ne: true } }).sort({ name: 1 }).lean<ICommunity[]>();
}

/** How many webhooks and bots a community may have (its owner's plan), and how many it has. */
async function slots(community: Pick<ICommunity, "_id" | "ownerId" | "bots">) {
  const owner = await User.findById(community.ownerId).select("plan planUntil email").lean<Pick<IUser, "plan" | "planUntil" | "email">>();
  const cap = (await getPlanConfig()).webhooks[owner ? planOf(owner) : "free"];
  const used = (await Webhook.countDocuments({ communityId: community._id })) + (community.bots?.length ?? 0);
  return { cap, used };
}

/** The invite page: the bot, what it asks for, and the communities you could add it to. */
export async function botInvite(viewer: IUser | null, id: string) {
  const a = await BotApp.findById(id).lean<IBotApp>();
  if (!a || a.disabledAt) throw notFound("We couldn't find that bot.");
  const owner = (await loadBriefs([a.ownerId])).get(sid(a.ownerId)) ?? null;
  const places = viewer ? await manageable(viewer) : [];
  const options = await Promise.all(
    places.map(async (c) => {
      const s = await slots(c);
      const already = (c.bots ?? []).some((b) => sid(b) === sid(a._id));
      return { slug: c.slug, name: c.name, already, full: !already && s.used >= s.cap, cap: s.cap };
    }),
  );
  return { bot: await toDto(a, false), owner, communities: options };
}

/**
 * Add a bot to a community: it joins as a member with its own role holding the permissions chosen (only ones the
 * bot asks for and you have yourself), placed just below your own highest role.
 */
export async function installBot(viewer: IUser, id: string, slug: string, permissions: string[]): Promise<{ community: string }> {
  const a = await BotApp.findById(id).lean<IBotApp>();
  if (!a || a.disabledAt) throw notFound("We couldn't find that bot.");
  const { space, access } = await resolveSpaceFor(viewer, slug);
  const c = space.community;
  if (space.sub) throw badRequest("Add bots to the community.");
  if (c.adult) throw forbidden("Bots can't be added to 18+ communities.");
  if (access.role !== "owner" && !isSiteAdmin(viewer) && !access.perms?.includes("manageWebhooks")) throw forbidden("Only the community's owner can add bots.");
  if ((c.bots ?? []).some((b) => sid(b) === sid(a._id))) return { community: c.slug };
  const s = await slots(c);
  if (s.used >= s.cap) throw forbidden(`This community has used all ${s.cap} of its webhook and bot slots (its owner's plan).`);
  const mine = isSiteAdmin(viewer) ? ALL_PERMISSIONS : (access.perms ?? []);
  const give = [...new Set(permissions)].filter((p) => isPermission(p) && a.permissions.includes(p) && mine.includes(p) && p !== "manageWebhooks");
  const reads = permissions.includes(READ_MESSAGES.id) && a.permissions.includes(READ_MESSAGES.id);
  // its role: just below the installer's highest role (or at the bottom)
  const below = await CommunityRole.findOne({ communityId: c._id, position: { $lt: access.rank ?? 1e9 } }).sort({ position: -1 }).lean<ICommunityRole>();
  const role = await CommunityRole.create({ communityId: c._id, name: a.name, color: "#5865f2", icon: "🤖", position: below ? Math.max(1, below.position - 1) : 1, permissions: give, selfAssignable: false, botAppId: a._id, readMessagesSince: reads ? new Date() : null });
  await Membership.updateOne(
    { userId: a.userId, communityId: c._id, subcommunityId: null },
    { $set: { status: "active", role: "member", roleIds: [role._id], rulesAcceptedAt: new Date(), welcomedAt: new Date() } },
    { upsert: true },
  );
  await Community.updateOne({ _id: c._id }, { $addToSet: { bots: a._id } });
  await recountMembers(c._id, null);
  void ModAction.create({ communityId: c._id, actorId: viewer._id, action: "bot.add", targetType: "member", targetId: a.userId, label: `${a.name}${give.length || reads ? ` (${[...give, ...(reads ? [READ_MESSAGES.id] : [])].join(", ")})` : ""}`, authorId: a.userId }).catch(() => {});
  void deliver(a, "bot.added", { community: { id: sid(c._id), slug: c.slug, name: c.name }, permissions: give });
  return { community: c.slug };
}

async function removeFrom(communityId: Types.ObjectId, a: Pick<IBotApp, "_id" | "userId" | "name">, actor: IUser, action: string) {
  const roles = await CommunityRole.find({ communityId, botAppId: a._id }).select("_id").lean<{ _id: Types.ObjectId }[]>();
  await Promise.all([
    Membership.deleteOne({ userId: a.userId, communityId, subcommunityId: null }),
    CommunityRole.deleteMany({ _id: { $in: roles.map((r) => r._id) } }),
    Channel.updateMany({ communityId }, { $pull: { overrides: { roleId: { $in: roles.map((r) => r._id) } }, categoryOverrides: { roleId: { $in: roles.map((r) => r._id) } } } }),
    Community.updateOne({ _id: communityId }, { $pull: { bots: a._id } }),
  ]);
  await recountMembers(communityId, null);
  void ModAction.create({ communityId, actorId: actor._id, action, targetType: "member", targetId: a.userId, label: a.name, authorId: a.userId }).catch(() => {});
}

/** Remove a bot from a community (owner, or "Manage webhooks and bots"). */
export async function uninstallBot(viewer: IUser, slug: string, id: string) {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (access.role !== "owner" && !isSiteAdmin(viewer) && !access.perms?.includes("manageWebhooks")) throw forbidden("Only the community's owner can remove bots.");
  const a = await BotApp.findById(id).lean<IBotApp>();
  if (!a) throw notFound("We couldn't find that bot.");
  await removeFrom(space.community._id, a, viewer, "bot.remove");
  return { removed: true };
}

/* ------------------------------ who may use a command ------------------------------ */

export const COOLDOWNS = [0, 10, 30, 60, 300, 600, 3600] as const;
const cooldownLabel = (s: number) => (s < 60 ? `${s} seconds` : s < 3600 ? `${s / 60} ${s === 60 ? "minute" : "minutes"}` : "hour");
export const botRulesSchema = z.array(
  z.object({
    command: commandName,
    who: z.enum(["everyone", "mods", "roles"]),
    roleIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(50).default([]),
    channelIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(100).default([]),
    cooldownSec: z.number().int().refine((n) => (COOLDOWNS as readonly number[]).includes(n), "Pick one of the cooldowns"),
  }),
).max(100);

/** a command's rule here (nothing saved: everyone, every channel, no wait) */
function ruleFor(c: ICommunity, botId: Types.ObjectId | string, command: string): BotCommandRuleDTO {
  const r = (c.botRules ?? []).find((x) => sid(x.botId) === sid(botId) && x.command === command);
  return r ? { command, who: r.who, roleIds: r.roleIds.map(sid), channelIds: r.channelIds.map(sid), cooldownSec: r.cooldownSec } : { command, who: "everyone", roleIds: [], channelIds: [], cooldownSec: 0 };
}
/** owners, admins, moderators (and site admins): they pass every rule and never wait */
const isStaff = (viewer: IUser, access: SpaceAccess) => access.role === "owner" || access.role === "admin" || access.canModerate || isSiteAdmin(viewer) || !!access.perms?.some((p) => p === "deleteMessages" || p === "timeout" || p === "kick" || p === "ban");
/** may this person use it at all (whatever the channel)? */
const mayUse = (rule: BotCommandRuleDTO, viewer: IUser, access: SpaceAccess) => rule.who === "everyone" || isStaff(viewer, access) || (rule.who === "roles" && (access.roleIds ?? []).some((id) => rule.roleIds.includes(id)));
/** who pressed or typed, as the bot sees it: their place in the community, so a bot can make its own checks too */
const memberInfo = (viewer: IUser, access: SpaceAccess) => ({ role: access.role ?? "member", staff: isStaff(viewer, access), roleIds: access.roleIds ?? [] });

/** Save who may use a bot's commands, where, and how often. Commands left out go back to everyone. */
export async function setBotRules(viewer: IUser, slug: string, id: string, rules: z.infer<typeof botRulesSchema>): Promise<{ rules: BotCommandRuleDTO[] }> {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (access.role !== "owner" && !isSiteAdmin(viewer) && !access.perms?.includes("manageWebhooks")) throw forbidden("Only the community's owner can change this.");
  if (!Types.ObjectId.isValid(id) || !(space.community.bots ?? []).some((b) => sid(b) === id)) throw notFound("That bot isn't in this community.");
  const app = await BotApp.findById(id).select("commands name").lean<Pick<IBotApp, "commands" | "name">>();
  if (!app) throw notFound("We couldn't find that bot.");
  const names = new Set(app.commands.map((c) => c.name));
  // only real commands, and only what differs from "everyone, everywhere, no wait"
  const keep = rules.filter((r) => names.has(r.command) && (r.who !== "everyone" || r.channelIds.length || r.cooldownSec));
  const others = (space.community.botRules ?? []).filter((r) => sid(r.botId) !== id);
  const mine = keep.map((r) => ({ botId: new Types.ObjectId(id), command: r.command, who: r.who, roleIds: r.who === "roles" ? r.roleIds.map((x) => new Types.ObjectId(x)) : [], channelIds: r.channelIds.map((x) => new Types.ObjectId(x)), cooldownSec: r.cooldownSec }));
  await Community.updateOne({ _id: space.community._id }, { $set: { botRules: [...others, ...mine] } });
  void ModAction.create({ communityId: space.community._id, actorId: viewer._id, action: "bot.add", targetType: "member", targetId: null, label: `${app.name}: who can use its commands changed`, authorId: null }).catch(() => {});
  const next = { ...space.community, botRules: [...others, ...mine] } as ICommunity;
  return { rules: app.commands.map((c) => ruleFor(next, id, c.name)) };
}

/** A community's bots (for its settings), each with its commands' rules. */
export async function communityBots(viewer: IUser, slug: string): Promise<(BotDTO & { readMessages: boolean; rules: BotCommandRuleDTO[] })[]> {
  const { space } = await resolveSpaceFor(viewer, slug);
  const [rows, roles] = await Promise.all([BotApp.find({ _id: { $in: space.community.bots ?? [] } }).lean<IBotApp[]>(), CommunityRole.find({ communityId: space.community._id, botAppId: { $ne: null } }).select("botAppId readMessagesSince").lean<ICommunityRole[]>()]);
  const reading = new Set(roles.filter((r) => r.readMessagesSince).map((r) => sid(r.botAppId!)));
  return Promise.all(rows.map(async (r) => ({ ...(await toDto(r, false)), readMessages: reading.has(sid(r._id)), rules: r.commands.map((c) => ruleFor(space.community, r._id, c.name)) })));
}

/** Let a bot read messages from now on, or stop it. Allowing it again never opens up what was said in between. */
export async function setBotReadMessages(viewer: IUser, slug: string, id: string, on: boolean): Promise<{ readMessages: boolean }> {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (access.role !== "owner" && !isSiteAdmin(viewer) && !access.perms?.includes("manageWebhooks")) throw forbidden("Only the community's owner can change this.");
  if (!Types.ObjectId.isValid(id)) throw notFound("We couldn't find that bot.");
  const c = space.community;
  const role = await CommunityRole.findOne({ communityId: c._id, botAppId: id }).lean<ICommunityRole>();
  const app = role ? await BotApp.findById(id).select("name userId").lean<Pick<IBotApp, "_id" | "name" | "userId">>() : null;
  if (!role || !app) throw notFound("That bot isn't in this community.");
  if (!!role.readMessagesSince !== on) {
    await CommunityRole.updateOne({ _id: role._id }, { $set: { readMessagesSince: on ? new Date() : null } });
    void ModAction.create({ communityId: c._id, actorId: viewer._id, action: "bot.add", targetType: "member", targetId: app.userId, label: `${app.name}: ${on ? "can now read messages" : "can no longer read messages"}`, authorId: null }).catch(() => {});
  }
  return { readMessages: on };
}

const historyQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  after: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
});

/** A bot reads a channel: only if it's allowed to, only a channel it can see, only since it was allowed. */
export async function botReadMessages(app: IBotApp, bot: IUser, channelId: string, query: unknown) {
  const q = historyQuery.parse(query);
  const { space, access, channel } = await botChannel(bot, channelId);
  const role = await CommunityRole.findOne({ communityId: space.community._id, botAppId: app._id }).select("readMessagesSince").lean<ICommunityRole>();
  if (!role?.readMessagesSince) throw forbidden("This bot isn't allowed to read messages here. A community owner can turn on Read messages in its settings, under Webhooks.");
  const ch = await import("./channels.service");
  return ch.readMessagesAsBot(bot, space, access, channel.slug, role.readMessagesSince, q);
}

/* ------------------------------ the bot API's side ------------------------------ */

/** Who's calling: `Authorization: Bot <token>`. */
export async function authBot(header: string | null): Promise<{ app: IBotApp; bot: IUser }> {
  const token = header?.match(/^Bot\s+(\S+)$/i)?.[1];
  if (!token) throw new ApiError(401, "Send your bot token as `Authorization: Bot <token>`.");
  const app = await BotApp.findOne({ tokenHash: hash(token) }).lean<IBotApp>();
  if (!app || app.disabledAt) throw new ApiError(401, "That bot token isn't valid.");
  const bot = await User.findById(app.userId).lean<IUser>();
  if (!bot || bot.suspendedAt) throw new ApiError(401, "That bot is switched off.");
  return { app, bot };
}

/** The bot's place in a community (it must have been added there). */
export async function botIn(bot: IUser, communityId: string): Promise<{ space: Space; access: SpaceAccess }> {
  if (!Types.ObjectId.isValid(communityId)) throw notFound("No such community.");
  const community = await Community.findById(communityId).lean<ICommunity>();
  if (!community || community.adult) throw notFound("No such community.");
  const space = { community, sub: null };
  const access = await spaceAccess(space, bot);
  if (!access.isMember) throw forbidden("This bot hasn't been added to that community.");
  return { space, access };
}

/** A channel (or thread) the bot can reach, with its community. */
export async function botChannel(bot: IUser, channelId: string): Promise<{ space: Space; access: SpaceAccess; channel: IChannel }> {
  if (!Types.ObjectId.isValid(channelId)) throw notFound("No such channel.");
  const channel = await Channel.findById(channelId).lean<IChannel>();
  if (!channel || channel.subcommunityId) throw notFound("No such channel.");
  const { space, access } = await botIn(bot, sid(channel.communityId));
  return { space, access, channel };
}

export async function registerCommands(app: IBotApp, commands: z.infer<typeof commandsSchema>["commands"]) {
  const seen = new Set<string>();
  const clean = commands.filter((c) => !seen.has(c.name) && seen.add(c.name));
  await BotApp.updateOne({ _id: app._id }, { $set: { commands: clean } });
  return { commands: clean };
}

/* ------------------------------ events ------------------------------ */

/** Only while building locally: a bot running on this computer. Production never allows it. */
const localBot = (u: string) => process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u);
const MAX_BOT_ANSWER = 256 * 1024;

/**
 * Call a bot's address, which its maker chose, so it can't be trusted: only public https addresses, every address its
 * name resolves to is checked and the checked one is what we connect to (server/net-guard), no redirects, and a limit
 * on time and on how much it can send back.
 */
function postToBot(endpoint: string, headers: Record<string, string>, body: string, wait: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const local = localBot(endpoint);
    const url = local ? new URL(endpoint) : assertPublicHttpUrl(endpoint);
    if (!local && url.protocol !== "https:") return reject(new Error("Not https."));
    const send = local ? httpRequest : httpsRequest;
    const req = send(url, { method: "POST", headers: { ...headers, "Content-Length": Buffer.byteLength(body) }, ...(local ? {} : { lookup: safeLookup as never }) }, (res) => {
      const code = res.statusCode ?? 0;
      if (code < 200 || code >= 300) {
        res.destroy();
        return reject(new Error(`HTTP ${code}`));
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_BOT_ANSWER) return req.destroy(new Error("Answer too big."));
        chunks.push(c);
      });
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      res.on("error", reject);
    });
    // the whole call, not just waiting for a first byte, so a slow drip can't hold it open
    const timer = setTimeout(() => req.destroy(new Error("Too slow.")), wait);
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
    req.end(body);
  });
}

/**
 * Send an event to a bot: POST JSON to its endpoint, signed with its signing secret
 * (`X-Klique-Signature: sha256=<hex HMAC of "<timestamp>.<body>">`, `X-Klique-Timestamp`, `X-Klique-Event`).
 * Waits at most `wait` ms. 50 failures in a row switch events off until its endpoint is saved again.
 */
export async function deliver(app: Pick<IBotApp, "_id" | "endpoint" | "signingSecret" | "disabledAt">, type: string, data: unknown, wait = 4000): Promise<unknown> {
  if (!app.endpoint || app.disabledAt) return null;
  const ts = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify({ type, data, sentAt: new Date().toISOString() });
  const sig = createHmac("sha256", app.signingSecret).update(`${ts}.${body}`).digest("hex");
  try {
    const text = await postToBot(app.endpoint, { "Content-Type": "application/json", "X-Klique-Event": type, "X-Klique-Timestamp": ts, "X-Klique-Signature": `sha256=${sig}`, "User-Agent": "KliqueBot/1" }, body, wait);
    void BotApp.updateOne({ _id: app._id, failures: { $gt: 0 } }, { $set: { failures: 0 } }).catch(() => {});
    // it answered, even if it had nothing to say (null is kept for "it didn't answer")
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return {};
    }
  } catch {
    void (async () => {
      const after = await BotApp.findOneAndUpdate({ _id: app._id }, { $inc: { failures: 1 } }, { returnDocument: "after" }).lean<IBotApp>();
      if (after && after.failures >= 50) await BotApp.updateOne({ _id: after._id }, { $set: { disabledAt: new Date() } });
    })().catch(() => {});
    return null;
  }
}

/** A bot's right to hear about a channel: it can see it, and for what people wrote, it may read messages. */
async function botMayHear(app: IBotApp, communityId: string, channel: IChannel, content: boolean): Promise<boolean> {
  if (content) {
    const role = await CommunityRole.findOne({ communityId, botAppId: app._id }).select("readMessagesSince").lean<ICommunityRole>();
    if (!role?.readMessagesSince) return false;
  }
  const bot = await User.findById(app.userId).lean<IUser>();
  if (!bot) return false;
  const { access } = await botIn(bot, communityId);
  // a thread's guests are its channel's
  const invited = channel.visibility === "invite" && !!(await ChannelMember.exists({ channelId: channel.parentChannelId ?? channel._id, userId: bot._id }));
  return canSeeChannel(channel, access, invited);
}

/**
 * Tell a community's bots something happened there (fire and forget; never the bot that did it). With `channel`, only
 * bots that can see that channel hear about it, never for a group's channels (bots aren't in groups). With `content`
 * (it carries what someone wrote), only bots allowed to read messages.
 */
export async function emitBotEvent(communityId: Types.ObjectId | string | null | undefined, type: string, data: Record<string, unknown>, opts: { except?: Types.ObjectId | string | null; channel?: IChannel; content?: boolean } = {}) {
  if (!communityId || opts.channel?.subcommunityId) return;
  try {
    const c = await Community.findById(communityId).select("bots slug name").lean<Pick<ICommunity, "_id" | "bots" | "slug" | "name">>();
    if (!c?.bots?.length) return;
    const apps = await BotApp.find({ _id: { $in: c.bots }, endpoint: { $ne: null }, disabledAt: null }).lean<IBotApp[]>();
    for (const a of apps) {
      if (opts.except && sid(a.userId) === sid(opts.except)) continue;
      if (opts.channel && !(await botMayHear(a, sid(c._id), opts.channel, !!opts.content).catch(() => false))) continue;
      void deliver(a, type, { community: { id: sid(c._id), slug: c.slug, name: c.name }, ...data });
    }
  } catch (e) {
    console.warn("[bots] couldn't send an event:", (e as Error).message);
  }
}

/* ------------------------------ slash commands ------------------------------ */

/** The "/" menu: commands from the bots in this community. */
export async function commandsHere(viewer: IUser, slug: string) {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (!access.isMember) return [];
  const apps = await BotApp.find({ _id: { $in: space.community.bots ?? [] }, disabledAt: null }).lean<IBotApp[]>();
  // only the ones this person may use; `channelIds` (empty: anywhere) so the list can leave out the rest in a channel
  return apps.flatMap((a) =>
    a.commands.flatMap((c) => {
      const rule = ruleFor(space.community, a._id, c.name);
      return mayUse(rule, viewer, access) ? [{ botId: sid(a._id), bot: a.name, avatarUrl: a.avatarUrl, ...c, channelIds: rule.channelIds }] : [];
    }),
  );
}

export const interactionSchema = z.object({ botId: z.string().regex(/^[a-f0-9]{24}$/i), command: commandName, options: z.record(z.string(), z.string().max(500)).default({}), text: z.string().max(2000).default("") });

/**
 * Someone used a slash command: the bot gets an "interaction" event and has 4 seconds to answer with
 * `{ "content": "…" }` (posted in the channel by the bot), or it can post later through the API.
 */
export async function runCommand(viewer: IUser, slug: string, channelSlug: string, input: z.infer<typeof interactionSchema>) {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  const ch = await import("./channels.service");
  // the channel must be one they can post in (the same checks as a message)
  const { channel } = await ch.channelForPost(viewer, space, access, channelSlug);
  const app = await BotApp.findById(input.botId).lean<IBotApp>();
  if (!app || app.disabledAt || !(space.community.bots ?? []).some((b) => sid(b) === sid(app._id))) throw notFound("That bot isn't in this community.");
  const cmd = app.commands.find((c) => c.name === input.command);
  if (!cmd) throw notFound(`/${input.command} isn't one of ${app.name}'s commands.`);
  const missing = cmd.options.filter((o) => o.required && !input.options[o.name]?.trim()).map((o) => o.name);
  if (missing.length) throw badRequest(`/${cmd.name} needs ${missing.join(", ")}.`);
  // the community's rules for this command: who, where, how often
  const rule = ruleFor(space.community, app._id, cmd.name);
  if (!mayUse(rule, viewer, access)) throw forbidden(rule.who === "mods" ? `Only the owner, admins and moderators can use /${cmd.name} here.` : `You need a certain role to use /${cmd.name} here.`);
  if (rule.channelIds.length && !rule.channelIds.includes(sid(channel._id))) throw forbidden(`/${cmd.name} can't be used in #${channel.name}.`);
  if (rule.cooldownSec && !isStaff(viewer, access)) {
    try {
      await rateLimitShared(`cmd-cool:${sid(space.community._id)}:${sid(app._id)}:${cmd.name}:${sid(viewer._id)}`, 1, rule.cooldownSec * 1000);
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) throw new ApiError(429, `You can use /${cmd.name} once every ${cooldownLabel(rule.cooldownSec)}.`);
      throw e;
    }
  }
  rateLimit(`slash:${sid(viewer._id)}`, 20, 60_000);
  const user = (await loadBriefs([viewer._id])).get(sid(viewer._id));
  const reply = (await deliver(app, "interaction", { community: { id: sid(space.community._id), slug: space.community.slug, name: space.community.name }, channel: { id: sid(channel._id), slug: channel.slug, name: channel.name }, user, member: memberInfo(viewer, access), command: cmd.name, options: input.options, text: input.text })) as { content?: unknown } | null;
  const said = botMessageSchema.safeParse(reply);
  if (said.success) {
    const bot = await User.findById(app.userId).lean<IUser>();
    if (bot) {
      const botAccess = await spaceAccess(space, bot);
      await ch.postMessage(bot, space, botAccess, channel.slug, { body: said.data.content ?? "", cards: said.data.cards });
      return { answered: true };
    }
  }
  return { answered: false, message: app.endpoint ? `${app.name} didn't answer straight away. It may reply in a moment.` : `${app.name} isn't listening right now.` };
}

/* ------------------------------ card buttons ------------------------------ */

export const buttonPressSchema = z.object({ buttonId: z.string().trim().min(1).max(CARD_LIMITS.buttonId) });

const buttonAnswer = z.object({ notice: z.string().trim().min(1).max(200).optional(), update: z.object({ content: z.string().trim().max(2000).optional(), cards: cardsSchema.optional() }).optional() });

/**
 * Someone pressed a button on a bot's card: the bot gets a "button" event and has 4 seconds to answer. It can answer
 * with `{ notice }` (shown only to whoever pressed it), `{ update: { content?, cards? } }` (changes that message),
 * `{ content?, cards? }` (posts a new one), any mix of these, or nothing (it can act later through the API).
 */
export async function pressCardButton(viewer: IUser, slug: string, channelSlug: string, messageId: string, buttonId: string): Promise<{ notice: string | null }> {
  if (!/^[a-f0-9]{24}$/i.test(messageId)) throw notFound("That button isn't there any more.");
  const { space, access } = await resolveSpaceFor(viewer, slug);
  const ch = await import("./channels.service");
  const { channel, message, button } = await ch.findCardButton(viewer, space, access, channelSlug, messageId, buttonId);
  const app = await BotApp.findOne({ userId: message.authorId }).lean<IBotApp>();
  if (!app || app.disabledAt || !(space.community.bots ?? []).some((b) => sid(b) === sid(app._id))) throw notFound("That bot isn't in this community any more.");
  if (!app.endpoint) return { notice: `${app.name} isn't listening right now.` };
  rateLimit(`card-button:${sid(viewer._id)}`, 30, 60_000);
  const user = (await loadBriefs([viewer._id])).get(sid(viewer._id));
  const reply = await deliver(app, "button", { community: { id: sid(space.community._id), slug: space.community.slug, name: space.community.name }, channel: { id: sid(channel._id), slug: channel.slug, name: channel.name }, user, member: memberInfo(viewer, access), message: { id: sid(message._id) }, button: { id: button.id, label: button.label } });
  if (reply === null) return { notice: `${app.name} didn't answer. Try again in a moment.` };

  const answer = buttonAnswer.safeParse(reply);
  const said = botMessageSchema.safeParse(reply);
  if (!answer.success || (!answer.data.notice && !answer.data.update && !said.success)) return { notice: null };
  const bot = await User.findById(app.userId).lean<IUser>();
  if (!bot) return { notice: null };
  const botAccess = await spaceAccess(space, bot);
  try {
    if (answer.data.update) await ch.editMessage(bot, space, botAccess, channel.slug, sid(message._id), answer.data.update.content, answer.data.update.cards);
    if (said.success) await ch.postMessage(bot, space, botAccess, channel.slug, { body: said.data.content ?? "", cards: said.data.cards });
  } catch (e) {
    // AutoMod, slow mode or its own permissions stopped it: that's the bot's answer failing, not the person's press
    if (e instanceof ApiError) return { notice: answer.data.notice ?? `${app.name} couldn't answer.` };
    throw e;
  }
  return { notice: answer.data.notice ?? null };
}
