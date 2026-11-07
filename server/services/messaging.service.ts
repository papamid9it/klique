import { stripFormat } from "@/lib/textFormat";
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
import { GHOST, loadBriefs, toBrief } from "../serializers";
import { blockedByMe, blockedEitherWay, hiddenUserIds } from "./blocks";
import { CrewMember } from "../models/Crew";
import { Membership } from "../models/Membership";
import { ADULT_AGE, ageOn } from "../policies/adult";
import { sid } from "./helpers";
import { areFriends } from "./friends.service";
import { purgeReactions, summarizeReactions, toggleReaction } from "./reactions";
import { type ReactionKind } from "@/lib/reactions";
import { notify } from "./push.service";
import { previewOf, toReplyRef } from "./replies";
import type { ReactionDTO, ReplyRefDTO } from "@/lib/types";
import { emitDm } from "./realtime";
import { normalizeEmoji } from "./emoji.service";

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
  // bots don't do DMs (either way)
  if (target.bot || viewer.bot) return { allowed: false, reason: "unavailable", message: "Bots don't take direct messages." };

  if (await blockedByMe(viewer._id, target._id)) {
    return { allowed: false, reason: "blocked", message: `You blocked @${target.handle}. Unblock them to send a message.` };
  }
  if (await blockedEitherWay(viewer._id, target._id)) {
    return { allowed: false, reason: "unavailable", message: "You can't message this person." };
  }
  // Friends can always message each other, whatever the privacy setting says.
  if (await areFriends(viewer._id, target._id)) return { allowed: true };
  // under-18s: only friends (an adult and a minor never start a chat otherwise)
  if (isMinorUser(viewer) || isMinorUser(target)) return { allowed: false, reason: "unavailable", message: "You can't message this person." };
  if (target.dmPolicy === "nobody") {
    return { allowed: false, reason: "policy_nobody", message: `@${target.handle} only takes messages from friends.` };
  }
  // klique mates and fellow community admins chat freely
  if (await chatsFreely(viewer._id, target._id)) return { allowed: true };
  if (target.dmPolicy === "shared") {
    return { allowed: false, reason: "policy_shared", message: `@${target.handle} only takes messages from friends and klique mates. Add them as a friend first.` };
  }
  // anyone else: one message, as a request
  return { allowed: true, request: true };
}

const isMinorUser = (u: Pick<IUser, "dob">) => {
  const age = ageOn(u.dob);
  return age !== null && age < ADULT_AGE;
};

/**
 * Who chats freely besides friends (no request needed): people in the same klique right now, and owners or admins
 * of the same community.
 */
async function chatsFreely(a: Types.ObjectId, b: Types.ObjectId): Promise<boolean> {
  const mine = await CrewMember.find({ userId: a, status: "active", expiresAt: { $gt: new Date() } }).distinct("crewId");
  if (mine.length && (await CrewMember.exists({ userId: b, status: "active", crewId: { $in: mine } }))) return true;
  const runs = await Membership.find({ userId: a, subcommunityId: null, status: "active", role: { $in: ["owner", "admin"] } }).distinct("communityId");
  return runs.length > 0 && !!(await Membership.exists({ userId: b, subcommunityId: null, status: "active", role: { $in: ["owner", "admin"] }, communityId: { $in: runs } }));
}

/** A pending request's first (and only) message may only be text, without links: no pictures, stickers or polls. */
const REQUEST_LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|ng|net|org|io|co|app|me|link|ly)\b)/i;

/* ------------------------------------------------------------------ */
/* Serialisation                                                       */
/* ------------------------------------------------------------------ */

// hidden pending review reads as removed
const toMessage = (raw: IMessage, viewerId: Types.ObjectId, reactions: ReactionDTO[] = [], replyTo: ReplyRefDTO | null = null): MessageDTO => toMessageShown(raw.hiddenAt && !raw.deletedAt ? { ...raw, deletedAt: raw.hiddenAt } : raw, viewerId, reactions, replyTo);
const toMessageShown = (m: IMessage, viewerId: Types.ObjectId, reactions: ReactionDTO[], replyTo: ReplyRefDTO | null): MessageDTO => ({
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
  const others = rows.filter((c) => !c.group).map((c) => otherParticipant(c, viewer._id));
  const [briefs, myBlocks] = await Promise.all([
    loadBriefs(others),
    Block.find({ blockerId: viewer._id, blockedId: { $in: others } }).select("blockedId").lean<{ blockedId: Types.ObjectId }[]>(),
  ]);
  const blocked = new Set(myBlocks.map((b) => sid(b.blockedId)));
  const pinnedChats = new Set((viewer.pins?.chats ?? []).map(sid));

  return rows.map((c) => {
    const otherId = sid(otherParticipant(c, viewer._id));
    const other = c.group ? { id: sid(c._id), handle: "", displayName: c.group.name, avatarUrl: null, country: "NG", city: "lagos" as const } : briefs.get(otherId) ?? { id: otherId, handle: "deleted", displayName: "Deleted user", avatarUrl: null, country: "NG", city: "lagos" as const };
    return {
      id: sid(c._id),
      other,
      lastMessage: c.lastMessage
        ? {
            body: stripFormat(c.lastMessage.body),
            senderId: sid(c.lastMessage.senderId),
            createdAt: c.lastMessage.createdAt.toISOString(),
            mine: sid(c.lastMessage.senderId) === sid(viewer._id),
          }
        : null,
      unreadCount: Number(c.unread?.[sid(viewer._id)] ?? 0),
      pinned: pinnedChats.has(sid(c._id)),
      ...(c.group ? { group: { memberCount: c.participants.length, mine: sid(c.group.ownerId) === sid(viewer._id) } } : {}),
      updatedAt: c.lastMessageAt.toISOString(),
      blockedByMe: !c.group && blocked.has(otherId),
      request: c.request ? { fromMe: sid(c.request.fromId) === sid(viewer._id) } : null,
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
  // requests sent TO you wait in Requests, not here
  const rows = await Conversation.find({ participants: viewer._id, lastMessage: { $ne: null }, $or: [{ request: null }, { request: { $exists: false } }, { "request.fromId": viewer._id }] })
    .sort({ lastMessageAt: -1 })
    .limit(60)
    .lean<IConversation[]>();
  const list = await toConversations(rows, viewer);
  // the ones you pinned come first (a pinned chat older than the 60 newest too)
  const pinned = viewer.pins?.chats ?? [];
  const missing = pinned.filter((id) => !rows.some((r) => sid(r._id) === sid(id)));
  const older = missing.length ? await toConversations(await Conversation.find({ _id: { $in: missing }, participants: viewer._id, lastMessage: { $ne: null } }).lean<IConversation[]>(), viewer) : [];
  return [...older, ...list].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
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
  const blocked = convo.group ? false : await blockedEitherWay(viewer._id, otherId);
  const senders = convo.group ? await loadBriefs(messages.map((m) => m.senderId)) : null;

  let cannotSendReason: string | undefined;
  if (blocked) cannotSendReason = dto.blockedByMe ? `You blocked @${dto.other.handle}. Unblock them to send a message.` : "You can't message this person.";
  // a request you sent: one message, then wait
  let requestWait = false;
  if (!blocked && convo.request && sid(convo.request.fromId) === sid(viewer._id) && (await Message.exists({ conversationId: convo._id, senderId: viewer._id }))) {
    requestWait = true;
    cannotSendReason = `Message request sent. You can send more once @${dto.other.handle} accepts.`;
  }

  const reactionMap = await summarizeReactions("dm", messages.map((m) => m._id), viewer._id);
  const replies = await replyRefs(messages);
  return {
    conversation: dto,
    messages: messages.map((m) => ({ ...toMessage(m, viewer._id, reactionMap.get(sid(m._id)) ?? [], m.replyToId ? (replies.get(sid(m.replyToId)) ?? null) : null), ...(senders ? { sender: senders.get(sid(m.senderId)) ?? GHOST } : {}) })),
    hasMore,
    canSend: !blocked && !requestWait,
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
        // not someone they chat with freely: it starts as a message request
        request: eligibility.request ? { fromId: viewer._id, at: new Date() } : null,
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
  const { body: raw, sticker, images = [], replyToId } = typeof input === "string" ? { body: input, sticker: undefined, images: [], replyToId: undefined } : input;
  // custom emoji in DMs: Pro members' (from communities they're in)
  const body = await normalizeEmoji(viewer, null, raw);
  const stickerUrl = typeof input !== "string" && input.stickerUrl && !sticker ? assertStickerUrl(input.stickerUrl) : null;
  rateLimit(`dm:${sid(viewer._id)}`, 40, 60_000);
  const convo = await loadMyConversation(viewer, id);
  const otherId = otherParticipant(convo, viewer._id);
  // everyone else who gets it
  const others = convo.group ? convo.participants.filter((p) => sid(p) !== sid(viewer._id)) : [otherId];

  if (!convo.group && (await blockedEitherWay(viewer._id, otherId))) {
    throw forbidden((await blockedByMe(viewer._id, otherId)) ? "You blocked this person. Unblock them to send a message." : "You can't message this person.");
  }

  // a message request: the sender gets one text message (no pictures, stickers, polls or links) until it's accepted;
  // the person it's for accepts it by replying
  let pendingRequest = !!convo.request;
  if (convo.request) {
    if (sid(convo.request.fromId) === sid(viewer._id)) {
      if (await Message.exists({ conversationId: convo._id, senderId: viewer._id })) throw forbidden("Your message request is waiting. You can send more once they accept it.");
      if (images.length || sticker || stickerUrl || (typeof input !== "string" && input.poll)) throw badRequest("A message request is text only. You can send pictures once they accept.");
      if (REQUEST_LINK.test(body)) throw badRequest("A message request can't have links. You can share them once they accept.");
    } else {
      await Conversation.updateOne({ _id: convo._id }, { $set: { request: null } });
      pendingRequest = false;
    }
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
      // a request isn't counted as unread (it shows as a small count on Requests instead)
      ...(pendingRequest ? {} : { $inc: Object.fromEntries(others.map((p) => [`unread.${sid(p)}`, 1])) }),
    },
  );
  emitDm([viewer._id, ...others], convo._id);
  // a request (someone who isn't your friend writing first): it waits in Requests, and you hear about it once, as a
  // decision to make (the Friends setting), not as a chat buzz
  if (convo.group) {
    // someone who blocked the sender stays in the group, but isn't buzzed for them
    const blockers = new Set((await Block.find({ blockerId: { $in: others }, blockedId: viewer._id }).select("blockerId").lean<{ blockerId: Types.ObjectId }[]>()).map((b) => sid(b.blockerId)));
    notify(others.filter((p) => !blockers.has(sid(p))), { title: convo.group.name, body: `${viewer.displayName}: ${preview}`, data: { type: "dm", conversationId: sid(convo._id) } }, { actorId: viewer._id, category: "messages", ref: `dm:${sid(convo._id)}` });
  } else if (!pendingRequest) notify([otherId], { title: viewer.displayName, body: preview, data: { type: "dm", conversationId: sid(convo._id) } }, { actorId: viewer._id, category: "messages", ref: `dm:${sid(convo._id)}` });
  else notify([otherId], { title: `${viewer.displayName} wants to message you`, body: preview, data: { type: "dm", conversationId: sid(convo._id) } }, { actorId: viewer._id, category: "friends", groupKey: "msg-req", many: (n) => `${n} new message requests`, ref: `dm:${sid(convo._id)}` });
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
  if (!convo.group && (await blockedEitherWay(viewer._id, otherParticipant(convo, viewer._id)))) throw forbidden("You can't react in this conversation.");
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
  if (!convo.group && (await blockedEitherWay(viewer._id, otherParticipant(convo, viewer._id)))) throw forbidden("You can't change messages in this conversation.");
  const next = (await normalizeEmoji(viewer, null, body)).trim();
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

/* ------------------------------------------------------------------ */
/* Message requests                                                    */
/* ------------------------------------------------------------------ */

/** Message requests sent to you, newest first (accept, delete or block each). */
export async function listRequests(viewer: IUser): Promise<ConversationDTO[]> {
  const rows = await Conversation.find({ participants: viewer._id, "request.fromId": { $ne: viewer._id, $exists: true }, lastMessage: { $ne: null } }).sort({ lastMessageAt: -1 }).limit(60).lean<IConversation[]>();
  const hidden = new Set((await hiddenUserIds(viewer._id)).map(sid));
  return toConversations(rows.filter((c) => !hidden.has(sid(otherParticipant(c, viewer._id)))), viewer);
}

/** How many message requests are waiting for you (a small count on Requests, not the unread badge). */
export async function requestCount(viewer: IUser): Promise<number> {
  return Conversation.countDocuments({ participants: viewer._id, "request.fromId": { $ne: viewer._id, $exists: true }, lastMessage: { $ne: null } });
}

/**
 * Answer a message request: accept (it becomes a normal chat), delete (gone for both; the sender isn't told), or block
 * (blocks them and deletes it).
 */
export async function decideMessageRequest(viewer: IUser, id: string, action: "accept" | "delete" | "block") {
  const convo = await loadMyConversation(viewer, id);
  if (!convo.request || sid(convo.request.fromId) === sid(viewer._id)) throw badRequest("That isn't a request for you.");
  const otherId = otherParticipant(convo, viewer._id);
  if (action === "accept") {
    const unread = await Message.countDocuments({ conversationId: convo._id, senderId: otherId });
    await Conversation.updateOne({ _id: convo._id }, { $set: { request: null, [`unread.${sid(viewer._id)}`]: unread } });
    emitDm([viewer._id, otherId], convo._id);
    return { accepted: true };
  }
  if (action === "block") await Block.updateOne({ blockerId: viewer._id, blockedId: otherId }, {}, { upsert: true });
  const msgs = await Message.find({ conversationId: convo._id }).select("_id images").lean<Pick<IMessage, "_id" | "images">[]>();
  await Promise.all([Message.deleteMany({ conversationId: convo._id }), purgeReactions("dm", msgs.map((m) => m._id)), Conversation.deleteOne({ _id: convo._id })]);
  return { deleted: true, blocked: action === "block" };
}
