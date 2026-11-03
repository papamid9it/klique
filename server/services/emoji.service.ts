import "server-only";
import { Types } from "mongoose";
import { z } from "zod";
import { EMOJI_NAME, EMOJI_TOKEN } from "@/lib/emoji-tokens";
import { PLAN_NAMES, type PlanId } from "@/lib/plans";
import { badRequest, conflict, forbidden, notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import { Community, type ICommunity } from "../models/Community";
import { CommunityEmoji, type ICommunityEmoji } from "../models/CommunityEmoji";
import { Membership } from "../models/Membership";
import { ModAction } from "../models/ModAction";
import { User, type IUser } from "../models/User";
import { isSiteAdmin } from "../policies/hosting";
import { sid } from "./helpers";
import { deleteUploads } from "./media.service";
import { keyFromUrl } from "./r2";
import { resolveSpaceFor } from "./spaces.service";
import { getPlanConfig, planOf } from "./subscriptions.service";

/**
 * Custom emoji (lib/emoji-tokens). A community's owner, or a role with "Manage emoji", uploads them; how many is
 * set by the owner's plan (Free 20, Lite 50, Pro 100; Admin → Plans). Members use them in that community. Pro
 * members can use emoji from any community they're in, anywhere (other communities, DMs, kliques). Deleting one
 * deletes the file; messages that used it show `:name:` instead.
 */

export interface EmojiDTO {
  id: string;
  name: string;
  url: string;
  animated: boolean;
}
const toDto = (e: Pick<ICommunityEmoji, "_id" | "name" | "url" | "animated">): EmojiDTO => ({ id: sid(e._id), name: e.name, url: e.url, animated: !!e.animated });

export const emojiCreateSchema = z.object({ name: z.string().trim().toLowerCase().regex(EMOJI_NAME, "2 to 32 letters, numbers or _"), url: z.string().url().max(600) });

async function capFor(community: Pick<ICommunity, "ownerId">): Promise<{ cap: number; plan: PlanId }> {
  const owner = await User.findById(community.ownerId).select("plan planUntil email").lean<Pick<IUser, "plan" | "planUntil" | "email">>();
  const plan = owner ? planOf(owner) : "free";
  return { cap: (await getPlanConfig()).emojiSlots[plan], plan };
}

/** The community's emoji (members), with how many it may have and whether you can manage them. */
export async function listEmoji(viewer: IUser, slug: string): Promise<{ items: EmojiDTO[]; cap: number; plan: PlanId; canManage: boolean }> {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (space.sub) throw badRequest("Emoji belong to the community.");
  if (!access.isMember && !isSiteAdmin(viewer)) throw forbidden("Join to see this community's emoji.");
  const [rows, { cap, plan }] = await Promise.all([CommunityEmoji.find({ communityId: space.community._id }).sort({ name: 1 }).lean<ICommunityEmoji[]>(), capFor(space.community)]);
  return { items: rows.map(toDto), cap, plan, canManage: !!access.perms?.includes("manageEmoji") };
}

export async function createEmoji(viewer: IUser, slug: string, input: z.infer<typeof emojiCreateSchema>): Promise<EmojiDTO> {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (space.sub) throw badRequest("Emoji belong to the community.");
  if (!access.perms?.includes("manageEmoji")) throw forbidden("You don't have permission to manage emoji.");
  if (!keyFromUrl(input.url) || !/\/klique\/emoji\//.test(input.url)) throw badRequest("Upload the emoji here.");
  rateLimit(`emoji:${sid(viewer._id)}`, 60, 60 * 60_000);
  const cid = space.community._id;
  const { cap, plan } = await capFor(space.community);
  if ((await CommunityEmoji.countDocuments({ communityId: cid })) >= cap) throw forbidden(`This community is on its owner's ${PLAN_NAMES[plan]} plan: ${cap} emoji.${plan !== "pro" ? " The owner can upgrade for more, or delete one." : " Delete one to add another."}`);
  try {
    const e = await CommunityEmoji.create({ communityId: cid, name: input.name, url: input.url, animated: /\.gif(\?|#|$)/i.test(input.url), createdById: viewer._id });
    void ModAction.create({ communityId: cid, actorId: viewer._id, action: "emoji.create", targetType: "emoji", targetId: e._id, label: `:${e.name}:`, authorId: null }).catch(() => {});
    return toDto(e);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw conflict(`There's already a :${input.name}: here.`);
    throw err;
  }
}

export async function deleteEmoji(viewer: IUser, slug: string, id: string) {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (!access.perms?.includes("manageEmoji")) throw forbidden("You don't have permission to manage emoji.");
  const e = await CommunityEmoji.findOneAndDelete({ _id: id, communityId: space.community._id }).lean<ICommunityEmoji>();
  if (!e) throw notFound("We couldn't find that emoji.");
  deleteUploads([e.url]);
  void ModAction.create({ communityId: space.community._id, actorId: viewer._id, action: "emoji.delete", targetType: "emoji", targetId: e._id, label: `:${e.name}:`, authorId: null }).catch(() => {});
  return { deleted: true };
}

/** Look up emoji by id (to show them in messages). Missing ones are left out, and show as :name:. */
export async function emojiByIds(ids: string[]): Promise<Record<string, EmojiDTO>> {
  const ok = ids.filter((x) => Types.ObjectId.isValid(x)).slice(0, 200);
  if (!ok.length) return {};
  const rows = await CommunityEmoji.find({ _id: { $in: ok } }).select("name url animated").lean<ICommunityEmoji[]>();
  return Object.fromEntries(rows.map((e) => [sid(e._id), toDto(e)]));
}

/**
 * The emoji picker: this community's emoji (when you're in one), and for Pro members the emoji of every other
 * community they're in. Each group says whether you can use it where you are.
 */
export async function pickerEmoji(viewer: IUser, slug?: string): Promise<{ groups: { community: { slug: string; name: string }; items: EmojiDTO[]; usable: boolean }[]; pro: boolean }> {
  const pro = planOf(viewer) === "pro" || isSiteAdmin(viewer);
  const mine = await Membership.find({ userId: viewer._id, subcommunityId: null, status: "active" }).select("communityId").lean<{ communityId: Types.ObjectId }[]>();
  const here = slug ? await Community.findOne({ slug: slug.toLowerCase() }).select("_id slug name").lean<Pick<ICommunity, "_id" | "slug" | "name">>() : null;
  const ids = mine.map((m) => m.communityId);
  const communities = await Community.find({ _id: { $in: ids } }).select("slug name").lean<Pick<ICommunity, "_id" | "slug" | "name">[]>();
  const rows = await CommunityEmoji.find({ communityId: { $in: ids } }).sort({ name: 1 }).lean<ICommunityEmoji[]>();
  const groups = communities
    .map((c) => ({ community: { slug: c.slug, name: c.name }, items: rows.filter((e) => sid(e.communityId) === sid(c._id)).map(toDto), usable: !!here && sid(here._id) === sid(c._id) ? true : pro }))
    .filter((g) => g.items.length)
    .sort((a, b) => (a.community.slug === here?.slug ? -1 : b.community.slug === here?.slug ? 1 : a.community.name.localeCompare(b.community.name)));
  return { groups, pro };
}

/**
 * Before a message is saved: `:name:` becomes this community's emoji of that name, and `<:name:id>` stays only
 * where the sender may use it (this community's own; other communities' they're in, for Pro). Anything else turns
 * back into `:name:`.
 */
export async function normalizeEmoji(viewer: Pick<IUser, "_id" | "plan" | "planUntil" | "email">, communityId: Types.ObjectId | null | undefined, body: string): Promise<string> {
  if (!body || !body.includes(":")) return body;
  let text = body;
  // :name: shortcuts for this community's emoji (skipping ones already written as tokens)
  if (communityId && /(^|[^<\w]):[a-z0-9_]{2,32}:/i.test(text)) {
    const names = [...new Set([...text.matchAll(/(?<![<\w]):([a-z0-9_]{2,32}):(?![a-f0-9]{24}>)/gi)].map((m) => m[1].toLowerCase()))];
    if (names.length) {
      const found = await CommunityEmoji.find({ communityId, name: { $in: names } }).select("name").lean<Pick<ICommunityEmoji, "_id" | "name">[]>();
      const byName = new Map(found.map((e) => [e.name, sid(e._id)]));
      text = text.replace(/(?<![<\w]):([a-z0-9_]{2,32}):(?![a-f0-9]{24}>)/gi, (all, n: string) => (byName.has(n.toLowerCase()) ? `<:${n.toLowerCase()}:${byName.get(n.toLowerCase())}>` : all));
    }
  }
  const ids = [...new Set([...text.matchAll(EMOJI_TOKEN)].map((m) => m[2]))];
  if (!ids.length) return text;
  const rows = await CommunityEmoji.find({ _id: { $in: ids } }).select("communityId").lean<Pick<ICommunityEmoji, "_id" | "communityId">[]>();
  const pro = planOf(viewer) === "pro" || isSiteAdmin(viewer as IUser);
  const otherCommunities = pro ? new Set((await Membership.find({ userId: viewer._id, subcommunityId: null, status: "active", communityId: { $in: rows.map((r) => r.communityId) } }).distinct("communityId")).map(String)) : new Set<string>();
  const allowed = new Set(rows.filter((r) => (communityId && sid(r.communityId) === sid(communityId)) || otherCommunities.has(sid(r.communityId))).map((r) => sid(r._id)));
  return text.replace(EMOJI_TOKEN, (all, name: string, id: string) => (allowed.has(id) ? all : `:${name}:`));
}
