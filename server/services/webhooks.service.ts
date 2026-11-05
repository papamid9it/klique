import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Types } from "mongoose";
import { z } from "zod";
import type { UserBrief } from "@/lib/types";
import { appUrl } from "../env";
import { badRequest, forbidden, notFound } from "../http/errors";
import { rateLimitShared } from "../http/rate-limit";
import { Channel, type IChannel } from "../models/Channel";
import { Community, type ICommunity } from "../models/Community";
import { ModAction } from "../models/ModAction";
import { User, type IUser } from "../models/User";
import { Webhook, type IWebhook } from "../models/Webhook";
import { isSiteAdmin } from "../policies/hosting";
import { loadBriefs } from "../serializers";
import { webhookCardsSchema } from "./cards";
import { postWebhookMessage } from "./channels.service";
import { githubMessage, type GithubPayload } from "./github-webhook";
import { sid } from "./helpers";
import { keyFromUrl } from "./r2";
import { resolveSpaceFor } from "./spaces.service";
import { PLAN_NAMES, type PlanId } from "@/lib/plans";
import { getPlanConfig, planOf } from "./subscriptions.service";

/**
 * Channel webhooks (bots): a secret link that posts messages into one channel of a community, for outside tools
 * (Zapier, GitHub, a script). Discord-style body: { content?, cards?, username?, avatar_url? }.
 *  - made, renewed and deleted by the community's OWNER only (and site admins), not its admins. How many a community can have is set by its
 *    OWNER's plan (lib/plans `webhooks`: Free 2, Lite 5, Pro 10; Admin → Plans); site admins have no limit. If the
 *    owner goes down a plan, the ones already there keep working; no new ones until it's under the number again
 *  - never in 18+ communities; up to 2000 characters of text, and cards (lib/cards) whose buttons are links; 30 messages a minute
 *  - its messages show its name and picture with a BOT tag; @everyone / @here only ping if the owner allowed it
 *  - the secret is shown once (and on renewing); only its hash is kept. Making and deleting one is in the mod log.
 *  - webhooks belong to the community: if it changes owner they keep working (the new owner manages them); they
 *    stop while the owner's account is suspended
 */

const PER_MINUTE = 30;

export interface WebhookDTO {
  id: string;
  name: string;
  avatarUrl: string | null;
  channel: { id: string; name: string; slug: string } | null;
  allowMassMention: boolean;
  createdBy: UserBrief | null;
  lastUsedAt: string | null;
  createdAt: string;
}
export interface WebhooksDTO {
  items: WebhookDTO[];
  /** null when you can make one; otherwise why not, in words */
  createBlock: string | null;
  channels: { id: string; name: string; slug: string }[];
  /** null: no limit (site admins) */
  cap: number | null;
  /** webhooks and bots together (they share the limit) */
  used: number;
}

export const webhookCreateSchema = z.object({
  channelId: z.string().regex(/^[a-f0-9]{24}$/i, "Pick a channel."),
  name: z.string().trim().min(1, "Give it a name.").max(40, "Up to 40 characters."),
  avatarUrl: z.union([z.string().trim().url(), z.literal(""), z.null()]).optional(),
  allowMassMention: z.boolean().optional().default(false),
});
export const webhookUpdateSchema = z.object({ regenerate: z.boolean().optional(), allowMassMention: z.boolean().optional(), name: z.string().trim().min(1).max(40).optional() });
export const webhookRunSchema = z
  .object({
    content: z.string({ error: "`content` must be text." }).trim().max(2000, "`content` can be up to 2000 characters.").optional(),
    cards: webhookCardsSchema.optional(),
    username: z.string().trim().max(40).optional(),
    avatar_url: z.string().trim().max(600).optional(),
  })
  .refine((m) => !!m.content || !!m.cards?.length, "Send some text as `content`, or `cards`.");

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
export const webhookUrl = (id: string, token: string) => `${appUrl()}/api/hooks/${id}/${token}`;
/** names that would pass for Klique itself aren't allowed */
const fakeName = (n: string) => /\bklique\b|\badmin\b|\bmoderator\b|\bofficial\b/i.test(n);
const ownUpload = (u: string | null | undefined) => (u && keyFromUrl(u) ? u : null);

async function manage(viewer: IUser, slug: string) {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  // the owner (and site admins), or a role the owner gave "Manage webhooks and bots"
  if (access.role !== "owner" && !isSiteAdmin(viewer) && !access.perms?.includes("manageWebhooks")) throw forbidden("Only the community's owner can manage webhooks.");
  return space.community;
}

/** How many webhooks the community may have: its owner's plan's number (null = no limit, for site admins). */
async function capFor(viewer: IUser, community: ICommunity): Promise<{ cap: number | null; plan: PlanId }> {
  const owner = await User.findById(community.ownerId).select("plan planUntil email").lean<Pick<IUser, "plan" | "planUntil" | "email">>();
  const plan = owner ? planOf(owner) : "free";
  if (isSiteAdmin(viewer)) return { cap: null, plan };
  return { cap: (await getPlanConfig()).webhooks[plan], plan };
}

function createBlock(viewer: IUser, community: ICommunity, count: number, { cap, plan }: { cap: number | null; plan: PlanId }): string | null {
  if (community.adult) return "Webhooks aren't available in 18+ communities.";
  if (cap !== null && count >= cap) {
    const isOwner = sid(community.ownerId) === sid(viewer._id);
    const more = plan === "pro" ? " Delete one to add another." : isOwner ? " Upgrade for more, or delete one." : " Delete one, or the owner can upgrade for more.";
    return `This community is on its owner's ${PLAN_NAMES[plan]} plan: ${cap} webhooks and bots in all.${more}`;
  }
  return null;
}

async function toDtos(rows: IWebhook[]): Promise<WebhookDTO[]> {
  const [channels, people] = await Promise.all([
    Channel.find({ _id: { $in: rows.map((r) => r.channelId) } }).select("name slug").lean<Pick<IChannel, "_id" | "name" | "slug">[]>(),
    loadBriefs(rows.map((r) => r.createdById)),
  ]);
  const ch = new Map(channels.map((c) => [sid(c._id), { id: sid(c._id), name: c.name, slug: c.slug }]));
  return rows.map((r) => ({ id: sid(r._id), name: r.name, avatarUrl: r.avatarUrl, channel: ch.get(sid(r.channelId)) ?? null, allowMassMention: !!r.allowMassMention, createdBy: people.get(sid(r.createdById)) ?? null, lastUsedAt: r.lastUsedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString() }));
}

const log = (actor: IUser, community: Types.ObjectId, action: string, hook: Pick<IWebhook, "_id" | "name">) =>
  ModAction.create({ communityId: community, actorId: actor._id, action, targetType: "webhook", targetId: hook._id, label: hook.name, authorId: null }).catch((e) => console.warn("[webhooks] couldn't log:", (e as Error).message));

/** The community's webhooks, the channels one can post to, and whether you can make another. */
export async function listWebhooks(viewer: IUser, slug: string): Promise<WebhooksDTO> {
  const community = await manage(viewer, slug);
  const [rows, channels] = await Promise.all([
    Webhook.find({ communityId: community._id }).sort({ createdAt: -1 }).lean<IWebhook[]>(),
    Channel.find({ communityId: community._id, subcommunityId: null, type: { $in: ["text", "announcement"] }, topicId: null }).sort({ position: 1, createdAt: 1 }).select("name slug").lean<Pick<IChannel, "_id" | "name" | "slug">[]>(),
  ]);
  const limit = await capFor(viewer, community);
  return { items: await toDtos(rows), createBlock: createBlock(viewer, community, rows.length + (community.bots?.length ?? 0), limit), channels: channels.map((c) => ({ id: sid(c._id), name: c.name, slug: c.slug })), cap: limit.cap, used: rows.length + (community.bots?.length ?? 0) };
}

/** Make one. The link (with its secret) comes back this once. */
export async function createWebhook(viewer: IUser, slug: string, input: z.infer<typeof webhookCreateSchema>): Promise<{ webhook: WebhookDTO; url: string }> {
  const community = await manage(viewer, slug);
  const block = createBlock(viewer, community, (await Webhook.countDocuments({ communityId: community._id })) + (community.bots?.length ?? 0), await capFor(viewer, community));
  if (block) throw forbidden(block);
  if (fakeName(input.name)) throw badRequest("Pick a name that doesn't look like Klique or its staff.");
  const channel = await Channel.findOne({ _id: input.channelId, communityId: community._id, subcommunityId: null }).lean<IChannel>();
  if (!channel || channel.type === "voice" || channel.topicId) throw badRequest("Pick a text or announcement channel.");
  if (input.avatarUrl && !ownUpload(input.avatarUrl)) throw badRequest("Upload the picture here.");
  const token = newToken();
  const hook = await Webhook.create({ communityId: community._id, channelId: channel._id, name: input.name, avatarUrl: input.avatarUrl || null, tokenHash: hash(token), allowMassMention: !!input.allowMassMention, createdById: viewer._id });
  void log(viewer, community._id, "webhook.create", hook);
  return { webhook: (await toDtos([hook.toObject()]))[0], url: webhookUrl(sid(hook._id), token) };
}

/** Renew its secret (the old link stops working at once), rename it, or let it ping @everyone / @here. */
export async function updateWebhook(viewer: IUser, slug: string, id: string, patch: z.infer<typeof webhookUpdateSchema>): Promise<{ webhook: WebhookDTO; url: string | null }> {
  const community = await manage(viewer, slug);
  const hook = await Webhook.findOne({ _id: id, communityId: community._id }).lean<IWebhook>();
  if (!hook) throw notFound("We couldn't find that webhook.");
  const set: Partial<IWebhook> = {};
  let token: string | null = null;
  if (patch.regenerate) set.tokenHash = hash((token = newToken()));
  if (patch.allowMassMention !== undefined) set.allowMassMention = patch.allowMassMention;
  if (patch.name) {
    if (fakeName(patch.name)) throw badRequest("Pick a name that doesn't look like Klique or its staff.");
    set.name = patch.name;
  }
  const next = await Webhook.findByIdAndUpdate(hook._id, { $set: set }, { returnDocument: "after" }).lean<IWebhook>();
  if (patch.regenerate) void log(viewer, community._id, "webhook.regenerate", hook);
  return { webhook: (await toDtos([next!]))[0], url: token ? webhookUrl(sid(hook._id), token) : null };
}

export async function deleteWebhook(viewer: IUser, slug: string, id: string): Promise<{ deleted: true }> {
  const community = await manage(viewer, slug);
  const hook = await Webhook.findOneAndDelete({ _id: id, communityId: community._id }).lean<IWebhook>();
  if (!hook) throw notFound("We couldn't find that webhook.");
  void log(viewer, community._id, "webhook.delete", hook);
  return { deleted: true };
}

/** Webhooks in a channel or community go when it does. */
export async function purgeWebhooks(where: { channelId?: Types.ObjectId; communityId?: Types.ObjectId }) {
  await Webhook.deleteMany(where);
}

/** The webhook this secret link belongs to. */
async function hookFromLink(id: string, token: string): Promise<IWebhook> {
  if (!Types.ObjectId.isValid(id) || !token) throw notFound("Unknown webhook.");
  const hook = await Webhook.findById(id).lean<IWebhook>();
  const a = Buffer.from(hook?.tokenHash ?? "0".repeat(64), "hex");
  const b = Buffer.from(hash(token), "hex");
  if (!hook || a.length !== b.length || !timingSafeEqual(a, b)) throw notFound("Unknown webhook.");
  return hook;
}

/** An outside tool posts through the secret link. */
export async function runWebhook(id: string, token: string, input: z.infer<typeof webhookRunSchema>): Promise<{ id: string }> {
  return postThroughHook(await hookFromLink(id, token), input);
}

/**
 * GitHub posts through the same link with /github on the end. Its words come from anyone who can open an issue, so
 * these messages never ping @everyone or @here, whatever the webhook is allowed.
 */
export async function runGithubWebhook(id: string, token: string, event: string, payload: GithubPayload): Promise<{ id: string } | { ignored: true }> {
  const hook = await hookFromLink(id, token);
  const content = githubMessage(event, payload);
  if (!content) return { ignored: true };
  return postThroughHook({ ...hook, allowMassMention: false }, { content });
}

async function postThroughHook(hook: IWebhook, input: z.infer<typeof webhookRunSchema>): Promise<{ id: string }> {
  await rateLimitShared(`hook:${sid(hook._id)}`, PER_MINUTE, 60_000);
  const [community, channel] = await Promise.all([Community.findById(hook.communityId).lean<ICommunity>(), Channel.findById(hook.channelId).lean<IChannel>()]);
  if (!community || !channel || channel.type === "voice") throw notFound("This webhook's channel is gone.");
  if (community.adult) throw forbidden("Webhooks don't work in 18+ communities.");
  // it belongs to the community: it posts on its owner's behalf (whoever owns it now), and stops while they're suspended
  const owner = await User.findById(community.ownerId).lean<IUser>();
  if (!owner || owner.suspendedAt) throw forbidden("This webhook is switched off.");
  const name = input.username && !fakeName(input.username) ? input.username : undefined;
  const out = await postWebhookMessage(hook, owner, channel, input.content ?? "", name, ownUpload(input.avatar_url), input.cards);
  void Webhook.updateOne({ _id: hook._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});
  return out;
}

