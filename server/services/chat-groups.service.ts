import "server-only";
import { Types } from "mongoose";
import { LIMITS } from "@/lib/constants";
import type { ChatGroupDTO, ChatPinDTO, ConversationDetailDTO } from "@/lib/types";
import { badRequest, conflict, forbidden, notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import { Conversation, type IConversation } from "../models/Conversation";
import { Message } from "../models/Message";
import type { IUser } from "../models/User";
import { GHOST, loadBriefs } from "../serializers";
import { areFriends } from "./friends.service";
import { sid } from "./helpers";
import { getConversation, pinsOf } from "./messaging.service";
import { deleteUploads } from "./media.service";
import { keyFromUrl } from "./r2";
import type { z } from "zod";
import type { chatGroupEditSchema } from "../validators/schemas";
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
/** may change the photo, name and description, and pin: the owner, or everyone when the owner allows it */
const mayEdit = (c: { group: { ownerId: Types.ObjectId; membersCanEdit?: boolean } }, viewer: IUser) => isOwner(c, viewer) || !!c.group.membersCanEdit;

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
    image: c.group.image ?? null,
    description: c.group.description ?? "",
    membersCanEdit: !!c.group.membersCanEdit,
    canEdit: mayEdit(c, viewer),
    members: c.participants
      .map((p) => ({ user: briefs.get(sid(p)) ?? { ...GHOST, id: sid(p) }, owner: sid(p) === sid(c.group.ownerId), me: sid(p) === sid(viewer._id) }))
      .sort((a, b) => Number(b.owner) - Number(a.owner) || a.user.displayName.localeCompare(b.user.displayName)),
  };
}

export async function renameChatGroup(viewer: IUser, id: string, name: string): Promise<ChatGroupDTO> {
  return editChatGroup(viewer, id, { name });
}

/**
 * Change a group: its name, photo (null removes it), description, and (the owner only) whether members may change
 * these and pin. A replaced photo's old file is deleted from storage.
 */
export async function editChatGroup(viewer: IUser, id: string, input: z.infer<typeof chatGroupEditSchema>): Promise<ChatGroupDTO> {
  const c = await loadGroup(viewer, id);
  rateLimit(`chat-group-edit:${sid(viewer._id)}`, 60, 60 * 60_000);
  if (input.membersCanEdit !== undefined && !isOwner(c, viewer)) throw forbidden("Only the person who started this group can change who edits it.");
  const changesInfo = input.name !== undefined || input.image !== undefined || input.description !== undefined;
  if (changesInfo && !mayEdit(c, viewer)) throw forbidden("Only the person who started this group can change it.");
  if (input.image && !keyFromUrl(input.image)) throw badRequest("Upload the picture here.");
  const set: Record<string, unknown> = {};
  if (input.name !== undefined) set["group.name"] = input.name;
  if (input.image !== undefined) set["group.image"] = input.image;
  if (input.description !== undefined) set["group.description"] = input.description;
  if (input.membersCanEdit !== undefined) set["group.membersCanEdit"] = input.membersCanEdit;
  if (!Object.keys(set).length) return getChatGroup(viewer, id);
  await Conversation.updateOne({ _id: c._id }, { $set: set });
  // the old photo's file goes once nothing uses it
  // (only moving or zooming the same photo changes just its #position part: the file stays)
  const fileOf = (u: string | null | undefined) => (u ? u.split("#")[0] : null);
  if (input.image !== undefined && c.group.image && fileOf(c.group.image) !== fileOf(input.image)) deleteUploads([c.group.image]);
  emitDm(c.participants, c._id);
  return getChatGroup(viewer, id);
}

/**
 * Pin or unpin a message at the top of a group chat (whoever may edit the group). At most 3, newest first: a 4th
 * pushes the oldest off, as on WhatsApp. Everyone's open chat updates.
 */
export async function pinChatMessage(viewer: IUser, id: string, messageId: string, on: boolean): Promise<{ pins: ChatPinDTO[] }> {
  const c = await loadGroup(viewer, id);
  if (!mayEdit(c, viewer)) throw forbidden("Only the person who started this group can pin messages.");
  const pins = (c.group.pins ?? []).filter((p) => sid(p.messageId) !== messageId);
  if (on) {
    const m = await Message.findOne({ _id: messageId, conversationId: c._id, deletedAt: null }).select("_id").lean();
    if (!m) throw notFound("That message isn't here any more.");
    pins.unshift({ messageId: new Types.ObjectId(messageId), byId: viewer._id, at: new Date() });
  }
  const next = pins.slice(0, LIMITS.chatGroupPins);
  await Conversation.updateOne({ _id: c._id }, { $set: { "group.pins": next } });
  emitDm(c.participants, c._id);
  return { pins: await pinsOf({ ...c, group: { ...c.group, pins: next } }) };
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
