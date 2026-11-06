import "server-only";
import { Types } from "mongoose";
import { LIMITS } from "@/lib/constants";
import type { ChatGroupDTO, ConversationDetailDTO } from "@/lib/types";
import { badRequest, conflict, forbidden, notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import { Conversation, type IConversation } from "../models/Conversation";
import { Message } from "../models/Message";
import type { IUser } from "../models/User";
import { GHOST, loadBriefs } from "../serializers";
import { areFriends } from "./friends.service";
import { sid } from "./helpers";
import { getConversation } from "./messaging.service";
import { notify } from "./push.service";
import { emitDm } from "./realtime";

/**
 * Group chats between friends (Messages, not communities): whoever starts one is its owner, and only they add or remove
 * people. Everyone they add has to be their friend. Inside, it works like a chat between two people.
 */
async function loadGroup(viewer: IUser, id: string): Promise<IConversation & { group: NonNullable<IConversation["group"]> }> {
  if (!Types.ObjectId.isValid(id)) throw notFound("We couldn't find that group.");
  const c = await Conversation.findOne({ _id: id, participants: viewer._id, group: { $ne: null } }).lean<IConversation>();
  if (!c?.group) throw notFound("We couldn't find that group.");
  return c as IConversation & { group: NonNullable<IConversation["group"]> };
}

const isOwner = (c: { group: { ownerId: Types.ObjectId } }, viewer: IUser) => sid(c.group.ownerId) === sid(viewer._id);

async function assertAllFriends(viewer: IUser, ids: string[]) {
  const checks = await Promise.all(ids.map((x) => areFriends(viewer._id, x)));
  if (checks.some((ok) => !ok)) throw forbidden("You can only add your friends to a group.");
}

export async function createChatGroup(viewer: IUser, input: { name: string; memberIds: string[] }): Promise<ConversationDetailDTO> {
  rateLimit(`chat-group:${sid(viewer._id)}`, 10, 60 * 60_000);
  const ids = [...new Set(input.memberIds)].filter((x) => x !== sid(viewer._id));
  if (ids.length < 2) throw badRequest("Pick at least two friends. For one friend, just message them.");
  if (ids.length + 1 > LIMITS.chatGroupMembers) throw conflict(`A group can have ${LIMITS.chatGroupMembers} people.`);
  await assertAllFriends(viewer, ids);
  const everyone = [viewer._id, ...ids.map((x) => new Types.ObjectId(x))];
  const at = new Date();
  const groupId = new Types.ObjectId();
  const doc = await Conversation.create({
    _id: groupId,
    participants: everyone,
    participantKey: `group:${new Types.ObjectId().toHexString()}`,
    group: { name: input.name, ownerId: viewer._id },
    // the inbox only lists chats with something in them
    // nobody said this, so it reads without "You:" in front
    lastMessage: { body: `${viewer.displayName} started the group`, senderId: groupId, createdAt: at },
    lastMessageAt: at,
    unread: Object.fromEntries(everyone.map((p) => [sid(p), 0])),
  });
  emitDm(everyone, doc._id);
  notify(ids, { title: input.name, body: `${viewer.displayName} added you to this group.`, data: { type: "dm", conversationId: sid(doc._id) } }, { actorId: viewer._id, category: "messages", ref: `dm:${sid(doc._id)}` });
  return getConversation(viewer, sid(doc._id));
}

export async function getChatGroup(viewer: IUser, id: string): Promise<ChatGroupDTO> {
  const c = await loadGroup(viewer, id);
  const briefs = await loadBriefs(c.participants);
  return {
    id: sid(c._id),
    name: c.group.name,
    mine: isOwner(c, viewer),
    members: c.participants
      .map((p) => ({ user: briefs.get(sid(p)) ?? { ...GHOST, id: sid(p) }, owner: sid(p) === sid(c.group.ownerId), me: sid(p) === sid(viewer._id) }))
      .sort((a, b) => Number(b.owner) - Number(a.owner) || a.user.displayName.localeCompare(b.user.displayName)),
  };
}

export async function renameChatGroup(viewer: IUser, id: string, name: string): Promise<ChatGroupDTO> {
  const c = await loadGroup(viewer, id);
  if (!isOwner(c, viewer)) throw forbidden("Only the person who started this group can rename it.");
  await Conversation.updateOne({ _id: c._id }, { $set: { "group.name": name } });
  emitDm(c.participants, c._id);
  return getChatGroup(viewer, id);
}

export async function addChatGroupMembers(viewer: IUser, id: string, memberIds: string[]): Promise<ChatGroupDTO> {
  const c = await loadGroup(viewer, id);
  if (!isOwner(c, viewer)) throw forbidden("Only the person who started this group can add people.");
  const ids = [...new Set(memberIds)].filter((x) => !c.participants.some((p) => sid(p) === x));
  if (!ids.length) throw badRequest("Pick someone who isn't in the group yet.");
  if (c.participants.length + ids.length > LIMITS.chatGroupMembers) throw conflict(`A group can have ${LIMITS.chatGroupMembers} people. This one has room for ${LIMITS.chatGroupMembers - c.participants.length} more.`);
  await assertAllFriends(viewer, ids);
  const fresh = ids.map((x) => new Types.ObjectId(x));
  await Conversation.updateOne({ _id: c._id, participants: viewer._id }, { $addToSet: { participants: { $each: fresh } }, $set: Object.fromEntries(ids.map((x) => [`unread.${x}`, 0])) });
  emitDm([...c.participants, ...fresh], c._id);
  notify(fresh, { title: c.group.name, body: `${viewer.displayName} added you to this group.`, data: { type: "dm", conversationId: sid(c._id) } }, { actorId: viewer._id, category: "messages", ref: `dm:${sid(c._id)}` });
  return getChatGroup(viewer, id);
}

/** Someone goes: you, or (the owner only) someone else. An owner who leaves hands it on; the last one out ends it. */
export async function removeChatGroupMember(viewer: IUser, id: string, userId: string): Promise<{ left: boolean }> {
  const c = await loadGroup(viewer, id);
  const leaving = userId === sid(viewer._id);
  if (!leaving && !isOwner(c, viewer)) throw forbidden("Only the person who started this group can remove people.");
  if (!c.participants.some((p) => sid(p) === userId)) throw notFound("They aren't in this group.");
  const rest = c.participants.filter((p) => sid(p) !== userId);
  if (!rest.length) {
    await Promise.all([Message.deleteMany({ conversationId: c._id }), Conversation.deleteOne({ _id: c._id })]);
    return { left: true };
  }
  const handOver = sid(c.group.ownerId) === userId;
  await Conversation.updateOne({ _id: c._id }, { $pull: { participants: new Types.ObjectId(userId) }, $unset: { [`unread.${userId}`]: 1 }, ...(handOver ? { $set: { "group.ownerId": rest[0] } } : {}) });
  emitDm(c.participants, c._id);
  if (!leaving) notify([new Types.ObjectId(userId)], { title: c.group.name, body: `${viewer.displayName} removed you from this group.`, data: { href: "/messages" } }, { actorId: viewer._id, category: "messages", ref: `dm:${sid(c._id)}` });
  if (handOver) notify([rest[0]], { title: c.group.name, body: "You now run this group.", data: { type: "dm", conversationId: sid(c._id) } }, { category: "messages", ref: `dm:${sid(c._id)}` });
  return { left: true };
}
