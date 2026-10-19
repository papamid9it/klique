import type { Types } from "mongoose";
import type { MentionDTO } from "@/lib/types";
import { extractMentionHandles } from "@/lib/mentions";
import { ChannelMember, type IChannel } from "../models/Channel";
import { Membership } from "../models/Membership";
import { User, type IUser } from "../models/User";
import { loadBriefs } from "../serializers";
import { hiddenUserIds } from "./blocks";
import { sid } from "./helpers";

/**
 * Turn "@handle" tokens in a message into user ids — but only people who could actually read the
 * channel (members of its space; the guest list for a private channel) and who haven't blocked,
 * or been blocked by, the author. Anyone else is left as plain text, so tagging can't reveal who
 * exists or who is in a private room.
 */
export async function resolveMentions(author: IUser, channel: IChannel, body: string): Promise<Types.ObjectId[]> {
  const handles = extractMentionHandles(body);
  if (!handles.length) return [];
  const [users, hidden] = await Promise.all([
    User.find({ handle: { $in: handles } }).select("_id").lean<{ _id: Types.ObjectId }[]>(),
    hiddenUserIds(author._id),
  ]);
  const hiddenSet = new Set(hidden.map(sid));
  const candidates = users.filter((u) => !hiddenSet.has(sid(u._id)));
  if (!candidates.length) return [];

  const ids = candidates.map((u) => u._id);
  const members = await Membership.find({
    userId: { $in: ids },
    communityId: channel.communityId,
    subcommunityId: channel.subcommunityId ?? null,
    status: "active",
  })
    .select("userId role")
    .lean<{ userId: Types.ObjectId; role: string }[]>();

  let allowed = members;
  if (channel.visibility === "invite") {
    const invited = new Set((await ChannelMember.find({ channelId: channel._id, userId: { $in: ids } }).select("userId").lean<{ userId: Types.ObjectId }[]>()).map((m) => sid(m.userId)));
    allowed = members.filter((m) => invited.has(sid(m.userId)) || m.role === "owner" || m.role === "admin");
  } else if (channel.visibility === "managers") {
    allowed = members.filter((m) => m.role === "owner" || m.role === "admin");
  }
  return allowed.map((m) => m.userId);
}

export async function mentionBriefs(ids: Types.ObjectId[]): Promise<Map<string, MentionDTO>> {
  const briefs = await loadBriefs(ids);
  return new Map([...briefs].map(([id, b]) => [id, { id: b.id, handle: b.handle, displayName: b.displayName }]));
}
