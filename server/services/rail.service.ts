import type { Types } from "mongoose";
import type { MyCommunityDTO } from "@/lib/types";
import { Channel, ChannelMember, ChannelMessage, ChannelRead, type IChannel, type IChannelRead } from "../models/Channel";
import { Community, type ICommunity } from "../models/Community";
import { Membership, type IMembership } from "../models/Membership";
import type { IUser } from "../models/User";
import { channelVisibleToRole } from "../policies/access";
import { sid } from "./helpers";

const ZERO = "000000000000000000000000";

/**
 * The communities in the switcher rail: everything you're a member of, with whether anything is
 * unread and how many unread messages tag you. Each channel is checked against the role you hold
 * in ITS space, so a staff room or a private channel you're not in never lights up your rail.
 */
export async function myCommunities(viewer: IUser): Promise<MyCommunityDTO[]> {
  const memberships = await Membership.find({ userId: viewer._id, status: "active" }).lean<IMembership[]>();
  const parentRole = new Map<string, IMembership["role"]>();
  const groupRole = new Map<string, IMembership["role"]>();
  for (const m of memberships) {
    if (m.subcommunityId) groupRole.set(sid(m.subcommunityId), m.role);
    else parentRole.set(sid(m.communityId), m.role);
  }
  if (!parentRole.size) return [];

  const ids = [...parentRole.keys()];
  const [communities, channels, reads, guest] = await Promise.all([
    Community.find({ _id: { $in: ids } }).lean<ICommunity[]>(),
    Channel.find({ communityId: { $in: ids } }).select("communityId subcommunityId visibility lastMessageId lastMessageAt").lean<IChannel[]>(),
    ChannelRead.find({ userId: viewer._id, communityId: { $in: ids } }).lean<IChannelRead[]>(),
    ChannelMember.find({ userId: viewer._id, communityId: { $in: ids } }).select("channelId").lean<{ channelId: Types.ObjectId }[]>(),
  ]);
  const readBy = new Map(reads.map((r) => [sid(r.channelId), r.lastReadMessageId ? sid(r.lastReadMessageId) : null]));
  const guestOf = new Set(guest.map((g) => sid(g.channelId)));

  const byCommunity = new Map<string, { unread: IChannel[]; last: Date | null }>();
  for (const c of communities) byCommunity.set(sid(c._id), { unread: [], last: null });
  for (const ch of channels) {
    const role = ch.subcommunityId ? (groupRole.get(sid(ch.subcommunityId)) ?? null) : (parentRole.get(sid(ch.communityId)) ?? null);
    if (!channelVisibleToRole(ch, role, guestOf.has(sid(ch._id)))) continue;
    const slot = byCommunity.get(sid(ch.communityId));
    if (!slot) continue;
    if (ch.lastMessageAt && (!slot.last || ch.lastMessageAt > slot.last)) slot.last = ch.lastMessageAt;
    const last = ch.lastMessageId ? sid(ch.lastMessageId) : null;
    const read = readBy.get(sid(ch._id));
    if (last && (!read || last > read)) slot.unread.push(ch);
  }

  // Unread @mentions (capped), only for channels that actually have unread messages.
  const mentionTotals = new Map<string, number>();
  const toCount = [...byCommunity.values()].flatMap((v) => v.unread).slice(0, 60);
  await Promise.all(
    toCount.map(async (ch) => {
      const after = readBy.get(sid(ch._id)) ?? ZERO;
      const n = await ChannelMessage.countDocuments({ channelId: ch._id, mentions: viewer._id, deletedAt: null, _id: { $gt: after } }, { limit: 99 });
      if (n) mentionTotals.set(sid(ch.communityId), (mentionTotals.get(sid(ch.communityId)) ?? 0) + n);
    }),
  );

  return communities
    .map((c): MyCommunityDTO => {
      const slot = byCommunity.get(sid(c._id))!;
      return {
        id: sid(c._id),
        slug: c.slug,
        name: c.name,
        interest: c.interest,
        coverImage: c.coverImage,
        privacy: c.privacy,
        role: parentRole.get(sid(c._id))!,
        unread: slot.unread.length > 0,
        mentions: Math.min(99, mentionTotals.get(sid(c._id)) ?? 0),
        lastActivityAt: (slot.last ?? null)?.toISOString() ?? null,
      };
    })
    .sort((a, b) => Number(b.mentions > 0) - Number(a.mentions > 0) || Number(b.unread) - Number(a.unread) || (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "") || a.name.localeCompare(b.name));
}
