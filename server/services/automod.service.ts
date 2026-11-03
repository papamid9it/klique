import "server-only";
import { Types } from "mongoose";
import { z } from "zod";
import { automodOf, linksIn, looksLikeScam, mentionCount, wordRegex, type AutoModAction, type AutoModConfig } from "@/lib/automod";
import { ApiError, forbidden } from "../http/errors";
import { Channel, ChannelMessage, type IChannel } from "../models/Channel";
import { Community, type ICommunity } from "../models/Community";
import { Membership, type IMembership } from "../models/Membership";
import { ModAction } from "../models/ModAction";
import { User, type IUser } from "../models/User";
import { isSiteAdmin } from "../policies/hosting";
import { resolveSpaceFor } from "./spaces.service";
import type { Space, SpaceAccess } from "../policies/access";
import { sid } from "./helpers";
import { notify } from "./push.service";

/**
 * AutoMod (lib/automod): checks what people write before it's saved, and watches joins for raids. A hit runs the
 * rule's action: block it (they see why), a note in the alert channel (posted as "AutoMod", with a BOT tag), and/or
 * a timeout. Every hit goes in the moderation log. Owners, admins, site admins, exempt roles and channels are skipped.
 */

const RULE_LABEL = { scam: "Suspicious link", blocked: "Blocked link", newMember: "Link from a new member", words: "Blocked word", mentions: "Too many mentions", flood: "Repeated messages" } as const;
type Rule = keyof typeof RULE_LABEL;

const BLOCK_MESSAGE: Record<Rule, string> = {
  scam: "AutoMod stopped this: it looks like a scam link.",
  blocked: "AutoMod stopped this: links to that site aren't allowed here.",
  newMember: "AutoMod stopped this: new members can't post links here yet.",
  words: "AutoMod stopped this: it has a word this community doesn't allow.",
  mentions: "AutoMod stopped this: too many people mentioned at once.",
  flood: "AutoMod stopped this: you've sent that a few times already.",
};

/** The first rule this text breaks, or null. */
async function firstHit(cfg: AutoModConfig, communityId: Types.ObjectId, viewer: IUser, text: string, channelId: Types.ObjectId | null): Promise<{ rule: Rule; action: AutoModAction } | null> {
  if (cfg.links.on) {
    if (cfg.links.scamFilter && looksLikeScam(text)) return { rule: "scam", action: cfg.links.action };
    const hosts = linksIn(text);
    if (hosts.length) {
      if (cfg.links.blockList.length && hosts.some((h) => cfg.links.blockList.some((d) => h === d || h.endsWith(`.${d}`)))) return { rule: "blocked", action: cfg.links.action };
      if (cfg.links.newMemberMinutes > 0) {
        const m = await Membership.findOne({ userId: viewer._id, communityId, subcommunityId: null }).select("createdAt").lean<Pick<IMembership, "createdAt">>();
        if (m && Date.now() - +m.createdAt < cfg.links.newMemberMinutes * 60_000) return { rule: "newMember", action: cfg.links.action };
      }
    }
  }
  if (cfg.words.on) {
    const rx = wordRegex(cfg.words.list);
    if (rx?.test(text)) return { rule: "words", action: cfg.words.action };
  }
  if (cfg.mentions.on && mentionCount(text) > cfg.mentions.max) return { rule: "mentions", action: cfg.mentions.action };
  if (cfg.flood.on && channelId && text.trim()) {
    // the same text again and again, anywhere in the community, in the last 2 minutes
    const same = await ChannelMessage.countDocuments({ communityId, authorId: viewer._id, deletedAt: null, body: text.trim(), createdAt: { $gt: new Date(Date.now() - 120_000) } });
    if (same + 1 >= cfg.flood.repeats) return { rule: "flood", action: cfg.flood.action };
  }
  return null;
}

/**
 * Check something about to be written in a community. Throws (with the reason) when a rule blocks it; otherwise
 * returns, after any alert or timeout its rule asks for.
 */
export async function checkAutoMod(space: Space, viewer: IUser, access: SpaceAccess, input: { text: string; channelId?: Types.ObjectId | null; where: string }): Promise<void> {
  const community = space.community;
  if (!community.automod) return;
  const cfg = automodOf(community.automod);
  if (!cfg.enabled || !input.text.trim()) return;
  if (access.canManage || isSiteAdmin(viewer)) return;
  if (access.roleIds?.some((id) => cfg.exemptRoleIds.includes(id))) return;
  if (input.channelId && cfg.exemptChannelIds.includes(sid(input.channelId))) return;
  const hit = await firstHit(cfg, community._id, viewer, input.text, input.channelId ?? null);
  if (!hit) return;
  await act(community, cfg, viewer, hit.rule, hit.action, input.text, input.where);
  if (hit.action.block) throw new ApiError(422, BLOCK_MESSAGE[hit.rule], { code: "automod" });
}

async function act(community: ICommunity, cfg: AutoModConfig, viewer: IUser, rule: Rule, action: AutoModAction, text: string, where: string) {
  const snippet = text.replace(/\s+/g, " ").slice(0, 120);
  const did = [action.block ? "blocked it" : "let it through", action.timeoutSec ? `timed them out for ${label(action.timeoutSec)}` : ""].filter(Boolean).join(" and ");
  // the moderation log, filed under the owner (AutoMod acts for them)
  void ModAction.create({ communityId: community._id, actorId: community.ownerId, action: "automod", targetType: "member", targetId: viewer._id, label: `${RULE_LABEL[rule]} in ${where} (${did}): ${snippet}`, authorId: viewer._id }).catch(() => {});
  if (action.timeoutSec) {
    await Membership.updateOne({ userId: viewer._id, communityId: community._id, subcommunityId: null, role: { $ne: "owner" } }, { $set: { timeoutUntil: new Date(Date.now() + action.timeoutSec * 1000), timeoutReason: `AutoMod: ${RULE_LABEL[rule]}`, timeoutById: community.ownerId } });
    notify([viewer._id], { title: `You're timed out in ${community.name} for ${label(action.timeoutSec)}`, body: `AutoMod: ${RULE_LABEL[rule].toLowerCase()}. You can still read.`, data: { href: `/communities/${community.slug}` } }, { category: "community", ref: `timeout:${sid(community._id)}` });
  }
  if (action.alert) await alert(community, cfg, `⚠️ ${RULE_LABEL[rule]} from @${viewer.handle} in ${where}: I ${did}. "${snippet}"`);
}

/** Post a note in the alert channel as "AutoMod" (nothing when there's no alert channel). */
async function alert(community: Pick<ICommunity, "_id" | "ownerId">, cfg: AutoModConfig, body: string) {
  if (!cfg.alertChannelId) return;
  try {
    const [channel, owner] = await Promise.all([Channel.findOne({ _id: cfg.alertChannelId, communityId: community._id }).lean<IChannel>(), User.findById(community.ownerId).lean<IUser>()]);
    if (!channel || !owner) return;
    const { postWebhookMessage } = await import("./channels.service");
    await postWebhookMessage({ _id: community._id, name: "AutoMod", avatarUrl: null, allowMassMention: false }, owner, channel, body.slice(0, 2000));
  } catch (e) {
    console.warn("[automod] couldn't post an alert:", (e as Error).message);
  }
}

const label = (s: number) => (s < 120 ? `${s} seconds` : s < 3600 ? `${Math.round(s / 60)} minutes` : s < 86_400 ? `${Math.round(s / 3600)} hour${s === 3600 ? "" : "s"}` : s < 604_800 ? `${Math.round(s / 86_400)} day${s === 86_400 ? "" : "s"}` : "1 week");

/* ------------------------------ raids ------------------------------ */

/** Is joining locked by raid protection right now? "pause": nobody joins; "approval": joins become requests. */
export function raidLock(community: Pick<ICommunity, "raidUntil" | "raidMode">): "pause" | "approval" | null {
  return community.raidUntil && +new Date(community.raidUntil) > Date.now() ? (community.raidMode ?? "approval") : null;
}

/** After someone joins: too many joins too fast trips raid protection (locks joining, tells the owner and admins). */
export async function noteJoin(community: ICommunity) {
  if (!community.automod) return;
  const cfg = automodOf(community.automod);
  if (!cfg.enabled || !cfg.raid.on || raidLock(community)) return;
  const recent = await Membership.countDocuments({ communityId: community._id, subcommunityId: null, createdAt: { $gt: new Date(Date.now() - cfg.raid.minutes * 60_000) } });
  if (recent < cfg.raid.joins) return;
  const until = new Date(Date.now() + cfg.raid.lockMinutes * 60_000);
  const locked = await Community.updateOne({ _id: community._id, $or: [{ raidUntil: null }, { raidUntil: { $lt: new Date() } }] }, { $set: { raidUntil: until, raidMode: cfg.raid.mode } });
  if (!locked.modifiedCount) return;
  const what = cfg.raid.mode === "pause" ? "Joining is paused" : "New joins need approval";
  void ModAction.create({ communityId: community._id, actorId: community.ownerId, action: "automod", targetType: "community", targetId: community._id, label: `Raid protection: ${recent} joins in ${cfg.raid.minutes} min. ${what} for ${label(cfg.raid.lockMinutes * 60)}.`, authorId: null }).catch(() => {});
  const staff = await Membership.find({ communityId: community._id, subcommunityId: null, status: "active", role: { $in: ["owner", "admin"] } }).select("userId").lean<{ userId: Types.ObjectId }[]>();
  notify(staff.map((m) => m.userId), { title: `Possible raid on ${community.name}`, body: `${recent} people joined in ${cfg.raid.minutes} minutes. ${what} for ${label(cfg.raid.lockMinutes * 60)}. You can end it in Settings → AutoMod.`, data: { href: `/communities/${community.slug}?settings=automod` } }, { category: "admin", ref: `raid:${sid(community._id)}` });
  await alert(community, cfg, `🚨 Raid protection: ${recent} people joined in ${cfg.raid.minutes} minutes. ${what} for ${label(cfg.raid.lockMinutes * 60)}.`);
}

/* ------------------------------ settings ------------------------------ */

export const automodSchema = z.object({}).passthrough();

async function manage(viewer: IUser, slug: string) {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (space.sub) throw forbidden("AutoMod belongs to the community.");
  if (!access.canManage && !isSiteAdmin(viewer)) throw forbidden("Only owners and admins can change AutoMod.");
  return space.community;
}

export async function getAutoMod(viewer: IUser, slug: string): Promise<{ config: AutoModConfig; raidUntil: string | null; raidMode: "pause" | "approval" | null }> {
  const c = await manage(viewer, slug);
  return { config: automodOf(c.automod), raidUntil: raidLock(c) ? new Date(c.raidUntil!).toISOString() : null, raidMode: raidLock(c) };
}

export async function setAutoMod(viewer: IUser, slug: string, input: unknown) {
  const c = await manage(viewer, slug);
  const config = automodOf(input);
  // the alert channel must be one of this community's
  if (config.alertChannelId && !(await Channel.exists({ _id: config.alertChannelId, communityId: c._id }))) config.alertChannelId = null;
  await Community.updateOne({ _id: c._id }, { $set: { automod: config } });
  void ModAction.create({ communityId: c._id, actorId: viewer._id, action: "automod.settings", targetType: "community", targetId: c._id, label: config.enabled ? "AutoMod settings changed" : "AutoMod turned off", authorId: null }).catch(() => {});
  return getAutoMod(viewer, slug);
}

/** End a raid lock early. */
export async function endRaidLock(viewer: IUser, slug: string) {
  const c = await manage(viewer, slug);
  await Community.updateOne({ _id: c._id }, { $set: { raidUntil: null, raidMode: null } });
  return getAutoMod(viewer, slug);
}
