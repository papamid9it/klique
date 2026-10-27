import type { Types } from "mongoose";
import { deleteUploads } from "./media.service";
import { assertStickerUrl, noteStickerUse } from "./stickers.service";
import { createPoll, deletePoll, pollPreview } from "./polls.service";
import type { pollInput } from "../validators/schemas";
import type { z } from "zod";
import type { ConversationDetailDTO, ConversationDTO, MessageDTO, MessagingEligibility } from "@/lib/types";
import { ApiError, badRequest, forbidden, notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import { Conversation, participantKey, type IConversation } from "../models/Conversation";
import { Message, type IMessage } from "../models/Message";
import { Block } from "../models/Safety";
import { User, type IUser } from "../models/User";
import { loadBriefs, toBrief } from "../serializers";
import { blockedByMe, blockedEitherWay, shareCommunity } from "./blocks";
import { sid } from "./helpers";
import { areFriends } from "./friends.service";
import { summarizeReactions, toggleReaction } from "./reactions";
import { type ReactionKind } from "@/lib/reactions";
import { notify } from "./push.service";
import { previewOf, toReplyRef } from "./replies";
import type { ReactionDTO, ReplyRefDTO } from "@/lib/types";
import { emitDm } from "./realtime";

const PAGE = 40;

/* ------------------------------------------------------------------ */
/* Who can message whom                                                */
/* ------------------------------------------------------------------ */

/**
 * Can `viewer` START a new conversation with `target`?
 * (Existing conversations only re-check blocks — see sendMessage.)
 * Reasons are written for the person being told "no". We never reveal that
 * someone blocked them: that case reads as a generic "unavailable".
 */
export async function messagingEligibility(viewer: IUser | null, target: IUser): Promise<MessagingEligibility> {
  if (!viewer) return { allowed: false, reason: "signed_out", message: "Sign in to send a message." };
  if (sid(viewer._id) === sid(target._id)) return { allowed: false, reason: "self", message: "That's you." };

  if (await blockedByMe(viewer._id, target._id)) {
    return { allowed: false, reason: "blocked", message: `You blocked @${target.handle}. Unblock them to send a message.` };
  }
  if (await blockedEitherWay(viewer._id, target._id)) {
    return { allowed: false, reason: "unavailable", message: "You can't message this person." };
  }
  // Friends can always message each other, whatever the privacy setting says.
  if (await areFriends(viewer._id, target._id)) return { allowed: true };
  if (target.dmPolicy === "nobody") {
    return { allowed: false, reason: "policy_nobody", message: `@${target.handle} isn't accepting new messages.` };
  }
  if (target.dmPolicy === "shared" && !(await shareCommunity(viewer._id, target._id))) {
    return {
      allowed: false,
      reason: "policy_shared",
      message: `@${target.handle} only accepts messages from people in their communities. Join one of theirs first.`,
    };
  }
  return { allowed: true };
}

/* ------------------------------------------------------------------ */
/* Serialisation                                                       */
/* ------------------------------------------------------------------ */

const toMessage = (m: IMessage, viewerId: Types.ObjectId, reactions: ReactionDTO[] = [], replyTo: ReplyRefDTO | null = null): MessageDTO => ({
  id: sid(m._id),
  conversationId: sid(m.conversationId),
  senderId: sid(m.senderId),
  body: m.deletedAt ? "" : m.body,
  sticker: m.deletedAt ? null : (m.sticker ?? null),
  stickerUrl: m.deletedAt ? null : (m.stickerUrl ?? null),
  images: m.deletedAt ? [] : (m.images ?? []),
  replyTo: m.deletedAt ? null : replyTo,
  reactions: m.deletedAt ? [] : reactions,
  createdAt: m.createdAt.toISOString(),
  mine: sid(m.senderId) === sid(viewerId),
  editedAt: m.deletedAt || !m.editedAt ? null : m.editedAt.toISOString(),
  deleted: !!m.deletedAt,
  pollId: m.deletedAt || !m.pollId ? null : sid(m.pollId),
});

const otherParticipant = (c: IConversation, viewerId: Types.ObjectId) =>
  c.participants.find((p) => sid(p) !== sid(viewerId)) ?? c.participants[0];

async function toConversations(rows: IConversation[], viewer: IUser): Promise<ConversationDTO[]> {
  if (!rows.length) return [];
  const others = rows.map((c) => otherParticipant(c, viewer._id));
  const [briefs, myBlocks] = await Promise.all([
    loadBriefs(others),
    Block.find({ blockerId: viewer._id, blockedId: { $in: others } }).select("blockedId").lean<{ blockedId: Types.ObjectId }[]>(),
  ]);
  const blocked = new Set(myBlocks.map((b) => sid(b.blockedId)));

  return rows.map((c) => {
    const otherId = sid(otherParticipant(c, viewer._id));
    const other = briefs.get(otherId) ?? { id: otherId, handle: "deleted", displayName: "Deleted user", avatarUrl: null, country: "NG", city: "lagos" as const };
    return {
      id: sid(c._id),
      other,
      lastMessage: c.lastMessage
        ? {
            body: c.lastMessage.body,
            senderId: sid(c.lastMessage.senderId),
            createdAt: c.lastMessage.createdAt.toISOString(),
            mine: sid(c.lastMessage.senderId) === sid(viewer._id),
          }
        : null,
      unreadCount: Number(c.unread?.[sid(viewer._id)] ?? 0),
      updatedAt: c.lastMessageAt.toISOString(),
      blockedByMe: blocked.has(otherId),
    };
  });
}

/** Load a conversation ONLY if `viewer` is one of its two participants; otherwise it doesn't exist. */
async function loadMyConversation(viewer: IUser, id: string): Promise<IConversation> {
  const convo = await Conversation.findOne({ _id: id, participants: viewer._id }).lean<IConversation>();
  if (!convo) throw notFound("We couldn't find that conversation.");
  return convo;
}

/* ------------------------------------------------------------------ */
/* Inbox                                                               */
/* ------------------------------------------------------------------ */

export async function listConversations(viewer: IUser): Promise<ConversationDTO[]> {
  const rows = await Conversation.find({ participants: viewer._id, lastMessage: { $ne: null } })
    .sort({ lastMessageAt: -1 })
    .limit(60)
    .lean<IConversation[]>();
  return toConversations(rows, viewer);
}

export async function unreadTotal(userId: Types.ObjectId | string): Promise<number> {
  const key = `unread.${sid(userId)}`;
  const rows = await Conversation.find({ participants: userId, [key]: { $gt: 0 } })
    .select("unread")
    .lean<Pick<IConversation, "unread">[]>();
  return rows.reduce((sum, c) => sum + Number(c.unread?.[sid(userId)] ?? 0), 0);
}

/* ------------------------------------------------------------------ */
/* One conversation                                                    */
/* ------------------------------------------------------------------ */

/** The messages these rows answer, as small quotes. One query for the messages, one for who wrote them. */
async function replyRefs(rows: IMessage[]): Promise<Map<string, ReplyRefDTO>> {
  const ids = [...new Set(rows.map((r) => (r.replyToId ? sid(r.replyToId) : "")).filter(Boolean))];
  if (!ids.length) return new Map();
  const targets = await Message.find({ _id: { $in: ids }, conversationId: rows[0].conversationId }).lean<IMessage[]>();
  const authors = await User.find({ _id: { $in: targets.map((t) => t.senderId) } }).select("displayName").lean<{ _id: Types.ObjectId; displayName: string }[]>();
  const name = new Map(authors.map((a) => [sid(a._id), a.displayName]));
  return new Map(targets.map((t) => [sid(t._id), toReplyRef(t, name.get(sid(t.senderId)) ?? "Someone")]));
}

async function detail(viewer: IUser, convo: IConversation, messages: IMessage[], hasMore: boolean): Promise<ConversationDetailDTO> {
  const [dto] = await toConversations([convo], viewer);
  const otherId = otherParticipant(convo, viewer._id);
  const blocked = await blockedEitherWay(viewer._id, otherId);

  let cannotSendReason: string | undefined;
  if (blocked) cannotSendReason = dto.blockedByMe ? `You blocked @${dto.other.handle}. Unblock them to send a message.` : "You can't message this person.";

  const reactionMap = await summarizeReactions("dm", messages.map((m) => m._id), viewer._id);
  const replies = await replyRefs(messages);
  return {
    conversation: dto,
    messages: messages.map((m) => toMessage(m, viewer._id, reactionMap.get(sid(m._id)) ?? [], m.replyToId ? (replies.get(sid(m.replyToId)) ?? null) : null)),
    hasMore,
    canSend: !blocked,
    ...(cannotSendReason ? { cannotSendReason } : {}),
  };
}

export async function getConversation(viewer: IUser, id: string, before?: string): Promise<ConversationDetailDTO> {
  const convo = await loadMyConversation(viewer, id);
  const rows = await Message.find({ conversationId: convo._id, ...(before ? { _id: { $lt: before } } : {}) })
    .sort({ _id: -1 })
    .limit(PAGE + 1)
    .lean<IMessage[]>();
  const hasMore = rows.length > PAGE;
  const messages = rows.slice(0, PAGE).reverse();

  // Opening the latest page counts as reading.
  if (!before) {
    await Conversation.updateOne({ _id: convo._id }, { $set: { [`unread.${sid(viewer._id)}`]: 0 } });
    convo.unread = { ...(convo.unread ?? {}), [sid(viewer._id)]: 0 };
  }
  return detail(viewer, convo, messages, hasMore);
}

export async function markRead(viewer: IUser, id: string) {
  const convo = await loadMyConversation(viewer, id);
  await Conversation.updateOne({ _id: convo._id }, { $set: { [`unread.${sid(viewer._id)}`]: 0 } });
  return { read: true };
}

/* ------------------------------------------------------------------ */
/* Start & send                                                        */
/* ------------------------------------------------------------------ */

export async function startConversation(viewer: IUser, handle: string, firstMessage?: string): Promise<ConversationDetailDTO> {
  const target = await User.findOne({ handle }).lean<IUser>();
  if (!target) throw notFound("We couldn't find anyone with that handle.");

  const key = participantKey(viewer._id, target._id);
  let convo = await Conversation.findOne({ participantKey: key }).lean<IConversation>();

  if (!convo) {
    const eligibility = await messagingEligibility(viewer, target);
    if (!eligibility.allowed) throw new ApiError(403, eligibility.message ?? "You can't message this person.", { code: `dm_${eligibility.reason}` });

    try {
      const created = await Conversation.create({
        participants: [viewer._id, target._id],
        participantKey: key,
        unread: { [sid(viewer._id)]: 0, [sid(target._id)]: 0 },
      });
      convo = created.toObject() as IConversation;
    } catch (err) {
      // Two people starting a chat at the same instant: the unique key guarantees one winner.
      if ((err as { code?: number }).code === 11000) convo = await Conversation.findOne({ participantKey: key }).lean<IConversation>();
      else throw err;
    }
  }
  if (!convo) throw notFound("We couldn't start that conversation.");

  if (firstMessage) await sendMessage(viewer, sid(convo._id), firstMessage);
  return getConversation(viewer, sid(convo._id));
}

export async function sendMessage(viewer: IUser, id: string, input: string | { body: string; sticker?: string; stickerUrl?: string; images?: string[]; replyToId?: string; poll?: z.infer<typeof pollInput> }): Promise<MessageDTO> {
  const { body, sticker, images = [], replyToId } = typeof input === "string" ? { body: input, sticker: undefined, images: [], replyToId: undefined } : input;
  const stickerUrl = typeof input !== "string" && input.stickerUrl && !sticker ? assertStickerUrl(input.stickerUrl) : null;
  rateLimit(`dm:${sid(viewer._id)}`, 40, 60_000);
  const convo = await loadMyConversation(viewer, id);
  const otherId = otherParticipant(convo, viewer._id);

  if (await blockedEitherWay(viewer._id, otherId)) {
    throw forbidden((await blockedByMe(viewer._id, otherId)) ? "You blocked this person. Unblock them to send a message." : "You can't message this person.");
  }

  // you can only answer a message that is in this same conversation
  const replyTarget = replyToId ? await Message.findOne({ _id: replyToId, conversationId: convo._id }).select("_id").lean() : null;
  // polls are for groups (channels, group chats, crews); a conversation here is always just the two of you
  if (typeof input !== "string" && input.poll && convo.participants.length < 3) throw badRequest("Polls are for group chats, not one-to-one messages.");
  // a poll rides on its own message (anything else sent with it is dropped)
  const poll = typeof input !== "string" && input.poll ? await createPoll(viewer, { scope: "dm", targetId: convo._id }, input.poll) : null;
  const msg = poll
    ? await Message.create({ conversationId: convo._id, senderId: viewer._id, body: "", images: [], pollId: poll._id, replyToId: replyTarget?._id ?? null })
    : await Message.create({ conversationId: convo._id, senderId: viewer._id, body, sticker: sticker ?? null, stickerUrl, images, replyToId: replyTarget?._id ?? null });
  noteStickerUse(viewer._id, stickerUrl);
  const preview = poll ? pollPreview(poll.question) : previewOf({ body, sticker, stickerUrl, images });
  await Conversation.updateOne(
    { _id: convo._id },
    {
      $set: {
        lastMessage: { body: preview, senderId: viewer._id, createdAt: msg.createdAt },
        lastMessageAt: msg.createdAt,
        [`unread.${sid(viewer._id)}`]: 0,
      },
      $inc: { [`unread.${sid(otherId)}`]: 1 },
    },
  );
  emitDm([viewer._id, otherId], convo._id);
  notify([otherId], { title: viewer.displayName, body: preview, data: { type: "dm", conversationId: sid(convo._id) } }, { actorId: viewer._id, category: "messages", ref: `dm:${sid(convo._id)}` });
  const row = msg.toObject() as IMessage;
  const replies = await replyRefs([row]);
  return toMessage(row, viewer._id, [], row.replyToId ? (replies.get(sid(row.replyToId)) ?? null) : null);
}

export { toBrief };

/* ------------------------------------------------------------------ */
/* Reactions                                                           */
/* ------------------------------------------------------------------ */

export async function reactToMessage(viewer: IUser, id: string, messageId: string, kind: ReactionKind): Promise<ReactionDTO[]> {
  rateLimit(`react:${sid(viewer._id)}`, 60, 30_000);
  const convo = await loadMyConversation(viewer, id);
  if (await blockedEitherWay(viewer._id, otherParticipant(convo, viewer._id))) throw forbidden("You can't react in this conversation.");
  const msg = await Message.findOne({ _id: messageId, conversationId: convo._id }).select("_id").lean();
  if (!msg) throw notFound("We couldn't find that message.");
  const reactions = await toggleReaction("dm", msg._id, viewer._id, kind);
  emitDm(convo.participants, convo._id);
  return reactions;
}

export async function reactionsFor(viewer: IUser, id: string, ids: string[]): Promise<Record<string, ReactionDTO[]>> {
  const convo = await loadMyConversation(viewer, id);
  const valid = await Message.find({ _id: { $in: ids }, conversationId: convo._id }).select("_id").lean<{ _id: Types.ObjectId }[]>();
  const map = await summarizeReactions("dm", valid.map((v) => v._id), viewer._id);
  return Object.fromEntries(valid.map((v) => [sid(v._id), map.get(sid(v._id)) ?? []]));
}

/* ------------------------------------------------------------------ */
/* Edit & unsend (your own messages only)                              */
/* ------------------------------------------------------------------ */

async function loadOwnMessage(viewer: IUser, id: string, messageId: string) {
  const convo = await loadMyConversation(viewer, id);
  const msg = await Message.findOne({ _id: messageId, conversationId: convo._id }).lean<IMessage>();
  if (!msg) throw notFound("We couldn't find that message.");
  if (sid(msg.senderId) !== sid(viewer._id)) throw forbidden("You can only change your own messages.");
  if (msg.deletedAt) throw notFound("That message was deleted.");
  return { convo, msg };
}

/** Keep the inbox preview in step when the newest message changes. */
async function refreshPreview(convo: IConversation, msg: IMessage, preview: string) {
  const isLast = convo.lastMessage && sid(convo.lastMessage.senderId) === sid(msg.senderId) && convo.lastMessage.createdAt.getTime() === msg.createdAt.getTime();
  if (isLast) await Conversation.updateOne({ _id: convo._id }, { $set: { "lastMessage.body": preview } });
}

export async function editMessage(viewer: IUser, id: string, messageId: string, body: string): Promise<MessageDTO> {
  rateLimit(`dm-edit:${sid(viewer._id)}`, 30, 60_000);
  const { convo, msg } = await loadOwnMessage(viewer, id, messageId);
  if (msg.sticker || msg.stickerUrl) throw forbidden("Stickers can't be edited. Delete it and send another.");
  if (msg.pollId) throw forbidden("Polls can't be edited. Delete it and start another.");
  if (await blockedEitherWay(viewer._id, otherParticipant(convo, viewer._id))) throw forbidden("You can't change messages in this conversation.");
  const next = body.trim();
  const replies = await replyRefs([msg]);
  const reply = msg.replyToId ? (replies.get(sid(msg.replyToId)) ?? null) : null;
  if (next === msg.body) return toMessage(msg, viewer._id, (await summarizeReactions("dm", [msg._id], viewer._id)).get(sid(msg._id)) ?? [], reply);
  const editedAt = new Date();
  await Message.updateOne({ _id: msg._id }, { $set: { body: next, editedAt } });
  await refreshPreview(convo, msg, next.slice(0, 140));
  emitDm(convo.participants, convo._id);
  const fresh = { ...msg, body: next, editedAt };
  return toMessage(fresh, viewer._id, (await summarizeReactions("dm", [msg._id], viewer._id)).get(sid(msg._id)) ?? [], reply);
}

export async function deleteMessage(viewer: IUser, id: string, messageId: string) {
  const { convo, msg } = await loadOwnMessage(viewer, id, messageId);
  await Message.updateOne({ _id: msg._id }, { $set: { body: "", sticker: null, stickerUrl: null, images: [], deletedAt: new Date() } });
  deleteUploads(msg.images ?? []); // its photos and videos go with it
  await deletePoll(msg.pollId);
  await refreshPreview(convo, msg, "Message deleted");
  emitDm(convo.participants, convo._id);
  return { deleted: true };
}
