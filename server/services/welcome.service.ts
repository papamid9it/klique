import "server-only";
import { Types } from "mongoose";
import { z } from "zod";
import type { RoleDTO } from "@/lib/types";
import { badRequest, forbidden } from "../http/errors";
import { Channel, type IChannel } from "../models/Channel";
import { Community, type ICommunity } from "../models/Community";
import { CommunityRole, type ICommunityRole } from "../models/CommunityRole";
import { Membership, type IMembership } from "../models/Membership";
import { User, type IUser } from "../models/User";
import { isSiteAdmin } from "../policies/hosting";
import { sid } from "./helpers";
import { resolveSpaceFor } from "./spaces.service";

/**
 * The welcome screen (community settings → Welcome): shown once to each new member, with the owner's message,
 * the rules (which can be required before posting), roles they can give themselves, and up to 5 channels to
 * start in. Optionally a greeting is posted in a channel when someone joins ("Welcome {user}!").
 */

export const welcomeSchema = z.object({
  enabled: z.boolean(),
  message: z.string().trim().max(1000).default(""),
  rules: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  requireAccept: z.boolean().default(true),
  channels: z.array(z.object({ channelId: z.string().regex(/^[a-f0-9]{24}$/i), note: z.string().trim().max(120).default("") })).max(5).default([]),
  greetChannelId: z.string().regex(/^[a-f0-9]{24}$/i).nullable().default(null),
  greetText: z.string().trim().max(300).default(""),
});
export const welcomeAcceptSchema = z.object({ acceptRules: z.boolean().default(false), roleIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(50).default([]) });

export interface WelcomeDTO {
  enabled: boolean;
  message: string;
  rules: string[];
  requireAccept: boolean;
  channels: { id: string; name: string; slug: string; note: string }[];
  greetChannelId: string | null;
  greetText: string;
  /** roles members can give themselves */
  roles: Pick<RoleDTO, "id" | "name" | "color" | "icon">[];
  /** for the person asking */
  me: { roleIds: string[]; needsRules: boolean; pending: boolean };
}

export async function getWelcome(viewer: IUser, slug: string): Promise<WelcomeDTO> {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (space.sub) throw badRequest("The welcome screen belongs to the community.");
  if (!access.isMember && !access.canManage) throw forbidden("Join to see this community's welcome.");
  const c = space.community;
  const w = c.welcome;
  const [channels, roles, mine] = await Promise.all([
    w?.channels?.length ? Channel.find({ _id: { $in: w.channels.map((x) => x.channelId) }, communityId: c._id }).select("name slug").lean<Pick<IChannel, "_id" | "name" | "slug">[]>() : [],
    CommunityRole.find({ communityId: c._id, selfAssignable: true }).sort({ position: -1 }).lean<ICommunityRole[]>(),
    Membership.findOne({ userId: viewer._id, communityId: c._id, subcommunityId: null }).select("roleIds").lean<Pick<IMembership, "roleIds">>(),
  ]);
  const byId = new Map(channels.map((x) => [sid(x._id), x]));
  return {
    enabled: !!w?.enabled,
    message: w?.message ?? "",
    rules: w?.rules ?? [],
    requireAccept: w?.requireAccept ?? true,
    channels: (w?.channels ?? []).flatMap((x) => {
      const ch = byId.get(sid(x.channelId));
      return ch ? [{ id: sid(ch._id), name: ch.name, slug: ch.slug, note: x.note }] : [];
    }),
    greetChannelId: w?.greetChannelId ? sid(w.greetChannelId) : null,
    greetText: w?.greetText ?? "",
    roles: roles.map((r) => ({ id: sid(r._id), name: r.name, color: r.color, icon: r.icon })),
    me: { roleIds: (mine?.roleIds ?? []).map(String), needsRules: !!access.needsRules, pending: !!access.welcomePending },
  };
}

export async function setWelcome(viewer: IUser, slug: string, input: z.infer<typeof welcomeSchema>): Promise<WelcomeDTO> {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (space.sub) throw badRequest("The welcome screen belongs to the community.");
  if (!access.canManage && !isSiteAdmin(viewer)) throw forbidden("Only owners and admins can change the welcome screen.");
  const cid = space.community._id;
  const ids = [...input.channels.map((x) => x.channelId), ...(input.greetChannelId ? [input.greetChannelId] : [])];
  const real = new Set((await Channel.find({ _id: { $in: ids }, communityId: cid, subcommunityId: null }).distinct("_id")).map(String));
  await Community.updateOne(
    { _id: cid },
    {
      $set: {
        welcome: {
          enabled: input.enabled,
          message: input.message,
          rules: input.rules,
          requireAccept: input.requireAccept,
          channels: input.channels.filter((x) => real.has(x.channelId)).map((x) => ({ channelId: new Types.ObjectId(x.channelId), note: x.note })),
          greetChannelId: input.greetChannelId && real.has(input.greetChannelId) ? new Types.ObjectId(input.greetChannelId) : null,
          greetText: input.greetText,
        },
      },
    },
  );
  return getWelcome(viewer, slug);
}

/**
 * The member finishes the welcome screen: accepts the rules (when asked), and picks their own roles (only roles
 * marked "members can give it to themselves"; their other roles stay as they are).
 */
export async function acceptWelcome(viewer: IUser, slug: string, input: z.infer<typeof welcomeAcceptSchema>): Promise<WelcomeDTO> {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (space.sub || !access.isMember) throw forbidden("Join first.");
  const cid = space.community._id;
  if (access.needsRules && !input.acceptRules) throw badRequest("Accept the rules to carry on.");
  const m = await Membership.findOne({ userId: viewer._id, communityId: cid, subcommunityId: null }).lean<IMembership>();
  if (!m) throw forbidden("Join first.");
  const selfRoles = await CommunityRole.find({ communityId: cid, selfAssignable: true }).select("_id").lean<{ _id: Types.ObjectId }[]>();
  const selfIds = new Set(selfRoles.map((r) => sid(r._id)));
  const keep = (m.roleIds ?? []).map(String).filter((id) => !selfIds.has(id));
  const picked = input.roleIds.filter((id) => selfIds.has(id));
  await Membership.updateOne(
    { _id: m._id },
    { $set: { welcomedAt: new Date(), roleIds: [...new Set([...keep, ...picked])].map((id) => new Types.ObjectId(id)), ...(input.acceptRules ? { rulesAcceptedAt: m.rulesAcceptedAt ?? new Date() } : {}) } },
  );
  return getWelcome(viewer, slug);
}

/** After someone joins: the greeting in the chosen channel ("Welcome {user}!"), posted as the community. */
export async function greetNewMember(community: ICommunity, userId: Types.ObjectId) {
  const w = community.welcome;
  if (!w?.enabled || !w.greetChannelId) return;
  try {
    const [channel, owner, who] = await Promise.all([Channel.findOne({ _id: w.greetChannelId, communityId: community._id }).lean<IChannel>(), User.findById(community.ownerId).lean<IUser>(), User.findById(userId).select("handle displayName").lean<Pick<IUser, "handle" | "displayName">>()]);
    if (!channel || !owner || !who) return;
    const text = (w.greetText || "Welcome {user}! 👋").replace(/\{user\}/g, `@${who.handle}`).replace(/\{name\}/g, who.displayName).replace(/\{community\}/g, community.name);
    const { postWebhookMessage } = await import("./channels.service");
    await postWebhookMessage({ _id: community._id, name: community.name, avatarUrl: community.coverImage ?? null, allowMassMention: false }, owner, channel, text.slice(0, 2000));
  } catch (e) {
    console.warn("[welcome] couldn't greet:", (e as Error).message);
  }
}
