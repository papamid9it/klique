import "server-only";
import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import type { z } from "zod";
import type { PollDTO, UserBrief } from "@/lib/types";
import { badRequest, forbidden, notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import { Channel, ChannelMember, type IChannel } from "../models/Channel";
import { Community, type ICommunity } from "../models/Community";
import { Conversation } from "../models/Conversation";
import { Crew, CrewMember } from "../models/Crew";
import { Poll, PollVote, type IPoll, type PollScope } from "../models/Poll";
import { Subcommunity, type ISubcommunity } from "../models/Subcommunity";
import type { IUser } from "../models/User";
import { canSeeChannel, spaceAccess } from "../policies/access";
import { loadBriefs } from "../serializers";
import type { pollInput } from "../validators/schemas";
import { sid } from "./helpers";
import { emitChannel, emitDm, publish, rtChannel } from "./realtime";

/** In communities bigger than this, who voted for what stays hidden (only the numbers show). */
const VOTERS_SHOWN_UP_TO = 500;
const HOUR = 3_600_000;

/** Make a poll for a message about to be posted (the caller has already checked you may post there). */
export async function createPoll(viewer: IUser, where: { scope: PollScope; targetId: Types.ObjectId; communityId?: Types.ObjectId | null }, input: z.infer<typeof pollInput>): Promise<IPoll> {
  rateLimit(`poll:${sid(viewer._id)}`, 10, 60 * 60_000);
  const seen = new Set<string>();
  const answers = input.answers
    .map((a) => ({ id: randomBytes(4).toString("hex"), text: a.text.trim(), emoji: a.emoji?.trim() || null }))
    .filter((a) => {
      const key = a.text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (answers.length < 2) throw badRequest("Add at least two different answers.");
  const doc = await Poll.create({ scope: where.scope, targetId: where.targetId, communityId: where.communityId ?? null, creatorId: viewer._id, question: input.question.trim(), answers, multiple: input.multiple, anonymous: input.anonymous, endsAt: new Date(Date.now() + input.hours * HOUR) });
  return doc.toObject() as IPoll;
}

/** The one-line preview of a poll message (chat lists, notifications). */
export const pollPreview = (question: string) => `📊 ${question}`;

/** A poll's message was deleted: the poll and its votes go too. */
export async function deletePoll(pollId: Types.ObjectId | null | undefined) {
  if (!pollId) return;
  await Promise.all([PollVote.deleteMany({ pollId }), Poll.deleteOne({ _id: pollId })]);
}

interface Rights {
  canVote: boolean;
  canEnd: boolean;
  /** a big community: voter names stay hidden */
  big: boolean;
  /** tell everyone looking at this chat that something changed */
  ping: () => void;
}

/** What the viewer may do with a poll, from where it was posted. Polls in chats you can't see look like they don't exist. */
async function rightsFor(viewer: IUser, poll: IPoll): Promise<Rights> {
  const creator = sid(poll.creatorId) === sid(viewer._id);
  if (poll.scope === "channel") {
    const channel = await Channel.findById(poll.targetId).lean<IChannel>();
    if (!channel) throw notFound("That poll is gone.");
    const community = await Community.findById(channel.communityId).lean<ICommunity>();
    if (!community) throw notFound("That poll is gone.");
    const sub = channel.subcommunityId ? await Subcommunity.findById(channel.subcommunityId).lean<ISubcommunity>() : null;
    const access = await spaceAccess({ community, sub }, viewer);
    const invited = channel.visibility === "invite" && !!(await ChannelMember.exists({ channelId: channel._id, userId: viewer._id }));
    if (!canSeeChannel(channel, access, invited)) throw notFound("That poll is gone.");
    return { canVote: access.isMember && !access.banned, canEnd: creator || access.canManage, big: community.memberCount > VOTERS_SHOWN_UP_TO, ping: () => emitChannel(channel.communityId, channel._id) };
  }
  if (poll.scope === "crew") {
    const [me, crew] = await Promise.all([CrewMember.findOne({ crewId: poll.targetId, userId: viewer._id, status: "active" }).select("_id").lean(), Crew.findById(poll.targetId).select("hostId").lean<{ hostId: Types.ObjectId }>()]);
    if (!me || !crew) throw notFound("That poll is gone.");
    return {
      canVote: true,
      canEnd: creator || sid(crew.hostId) === sid(viewer._id),
      big: false,
      ping: () =>
        void CrewMember.find({ crewId: poll.targetId }).select("userId").lean<{ userId: Types.ObjectId }[]>().then((rows) => publish(rows.map((r) => rtChannel.user(sid(r.userId))), { type: "crew", crewId: sid(poll.targetId), chat: true })),
    };
  }
  const convo = await Conversation.findOne({ _id: poll.targetId, participants: viewer._id }).select("participants").lean<{ participants: Types.ObjectId[] }>();
  if (!convo) throw notFound("That poll is gone.");
  return { canVote: true, canEnd: creator, big: false, ping: () => emitDm(convo.participants, poll.targetId) };
}

async function loadPoll(id: string): Promise<IPoll> {
  if (!Types.ObjectId.isValid(id)) throw notFound("That poll is gone.");
  const poll = await Poll.findById(id).lean<IPoll>();
  if (!poll) throw notFound("That poll is gone.");
  return poll;
}

const isOver = (p: IPoll, now = Date.now()) => !!p.endedAt || p.endsAt.getTime() <= now;

async function toDto(poll: IPoll, viewer: IUser, rights: Rights): Promise<PollDTO> {
  const [counts, mine, total, creator] = await Promise.all([
    PollVote.aggregate<{ _id: string; n: number }>([{ $match: { pollId: poll._id } }, { $unwind: "$answerIds" }, { $group: { _id: "$answerIds", n: { $sum: 1 } } }]),
    PollVote.findOne({ pollId: poll._id, userId: viewer._id }).select("answerIds").lean<{ answerIds: string[] }>(),
    PollVote.countDocuments({ pollId: poll._id, "answerIds.0": { $exists: true } }),
    loadBriefs([poll.creatorId]),
  ]);
  const n = new Map(counts.map((c) => [c._id, c.n]));
  const ended = isOver(poll);
  return {
    id: sid(poll._id),
    question: poll.question,
    answers: poll.answers.map((a) => ({ id: a.id, text: a.text, emoji: a.emoji ?? null, votes: n.get(a.id) ?? 0 })),
    totalVoters: total,
    multiple: poll.multiple,
    anonymous: poll.anonymous,
    endsAt: (poll.endedAt ?? poll.endsAt).toISOString(),
    ended,
    myVotes: mine?.answerIds ?? [],
    canVote: rights.canVote && !ended,
    canEnd: rights.canEnd && !ended,
    votersVisible: !poll.anonymous && !rights.big,
    creator: creator.get(sid(poll.creatorId)) ?? null,
  };
}

export async function getPoll(viewer: IUser, id: string): Promise<PollDTO> {
  const poll = await loadPoll(id);
  return toDto(poll, viewer, await rightsFor(viewer, poll));
}

/** Pick your answer(s); an empty list takes your vote back. You can change it until the poll ends. */
export async function votePoll(viewer: IUser, id: string, answerIds: string[]): Promise<PollDTO> {
  const poll = await loadPoll(id);
  const rights = await rightsFor(viewer, poll);
  if (!rights.canVote) throw forbidden("Join to vote in this poll.");
  if (isOver(poll)) throw badRequest("This poll has ended.");
  rateLimit(`poll-vote:${sid(viewer._id)}`, 60, 60_000);
  const valid = new Set(poll.answers.map((a) => a.id));
  const picked = [...new Set(answerIds)].filter((a) => valid.has(a));
  if (picked.length !== answerIds.length) throw badRequest("That answer isn't in this poll.");
  if (!poll.multiple && picked.length > 1) throw badRequest("Pick one answer.");
  if (picked.length) await PollVote.updateOne({ pollId: poll._id, userId: viewer._id }, { $set: { answerIds: picked } }, { upsert: true });
  else await PollVote.deleteOne({ pollId: poll._id, userId: viewer._id });
  rights.ping();
  return toDto(poll, viewer, rights);
}

/** End a poll early (its creator, or the chat's owners and admins). */
export async function endPoll(viewer: IUser, id: string): Promise<PollDTO> {
  const poll = await loadPoll(id);
  const rights = await rightsFor(viewer, poll);
  if (!rights.canEnd) throw forbidden("Only whoever started the poll, or an admin, can end it.");
  if (!isOver(poll)) {
    poll.endedAt = new Date();
    await Poll.updateOne({ _id: poll._id }, { $set: { endedAt: poll.endedAt } });
    rights.ping();
  }
  return toDto(poll, viewer, rights);
}

/** Who picked an answer (unless the poll is anonymous or the community is big). */
export async function pollVoters(viewer: IUser, id: string, answerId: string): Promise<UserBrief[]> {
  const poll = await loadPoll(id);
  const rights = await rightsFor(viewer, poll);
  if (poll.anonymous || rights.big) throw forbidden("Who voted is hidden in this poll.");
  const rows = await PollVote.find({ pollId: poll._id, answerIds: answerId }).sort({ updatedAt: -1 }).limit(100).select("userId").lean<{ userId: Types.ObjectId }[]>();
  const briefs = await loadBriefs(rows.map((r) => r.userId));
  return rows.flatMap((r) => (briefs.has(sid(r.userId)) ? [briefs.get(sid(r.userId))!] : []));
}
