import { Types } from "mongoose";
import { withoutAdult } from "../policies/adult";
import { deleteUploads } from "./media.service";
import type { z } from "zod";
import type { Paginated, TopicCommentDTO, TopicDTO, TopicDetailDTO } from "@/lib/types";
import { ApiError, forbidden, notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import { Community, type ICommunity } from "../models/Community";
import { Membership, type IMembership } from "../models/Membership";
import { Board, Topic, TopicComment, TopicFollow, TopicLike, type ITopic, type ITopicComment } from "../models/Topic";
import { deleteTopicThread, ensureTopicThread, listMessages, syncTopicThread } from "./channels.service";
import { assertCanPost, assertCanView, outranks, type Space, type SpaceAccess } from "../policies/access";
import { loadBriefs } from "../serializers";
import type { commentCreateSchema, commentUpdateSchema, topicCreateSchema, topicListQuery, topicUpdateSchema } from "../validators/schemas";
import { ensureBoards, resolveBoard, canPostIn } from "./boards.service";
import { LIMITS, TRENDING_MIN_COMMENTS } from "@/lib/constants";
import { emitTopic } from "./realtime";
import { hiddenUserIds } from "./blocks";
import { escapeRegex, sid, topicFileUrls } from "./helpers";
import type { IUser } from "../models/User";
import { awardPointsLater } from "./points.service";
import { notify } from "./push.service";

const PAGE = 10;
type Role = IMembership["role"];
const isManager = (r?: Role) => r === "owner" || r === "admin";
/** a manager outranks everyone below them; a plain member (no row) is outranked by any manager */
const outranksAuthor = (actor: Role | null, target?: Role) => isManager(actor ?? undefined) && (target === undefined || outranks(actor, target));

/** Topics belong to a community (not to its groups). */
function assertCommunity(space: Space) {
  if (space.sub) throw notFound("Topics live in the community, not in a group.");
}

/* ------------------------------------------------------------------ */
/* Serialisation                                                       */
/* ------------------------------------------------------------------ */

/**
 * Turns topic rows into DTOs in a handful of batched queries. Works for one community's board and for
 * the mixed home feed: the viewer's role is looked up per community, so permissions are always the real ones.
 */
async function toTopics(rows: ITopic[], viewer: IUser | null): Promise<TopicDTO[]> {
  if (!rows.length) return [];
  const communityIds = [...new Set(rows.map((r) => sid(r.communityId)))];
  const boardIds = [...new Set(rows.flatMap((r) => (r.boardId ? [sid(r.boardId)] : [])))];
  const [authors, communities, liked, roles, authorRoles, boards, follows] = await Promise.all([
    loadBriefs(rows.map((r) => r.authorId)),
    Community.find({ _id: { $in: communityIds } }).select("slug name interest coverImage").lean<Pick<ICommunity, "_id" | "slug" | "name" | "interest" | "coverImage">[]>(),
    viewer ? TopicLike.find({ userId: viewer._id, targetType: "topic", targetId: { $in: rows.map((r) => r._id) } }).select("targetId").lean<{ targetId: Types.ObjectId }[]>() : [],
    viewer ? Membership.find({ userId: viewer._id, communityId: { $in: communityIds }, subcommunityId: null, status: "active" }).select("communityId role").lean<Pick<IMembership, "communityId" | "role">[]>() : [],
    Membership.find({ communityId: { $in: communityIds }, subcommunityId: null, status: "active", userId: { $in: rows.map((r) => r.authorId) } }).select("communityId userId role").lean<Pick<IMembership, "communityId" | "userId" | "role">[]>(),
    boardIds.length ? Board.find({ _id: { $in: boardIds } }).select("slug name").lean<{ _id: Types.ObjectId; slug: string; name: string }[]>() : [],
    viewer ? TopicFollow.find({ userId: viewer._id, topicId: { $in: rows.map((r) => r._id) } }).select("topicId").lean<{ topicId: Types.ObjectId }[]>() : [],
  ]);
  const followed = new Set(follows.map((f) => sid(f.topicId)));
  const boardById = new Map(boards.map((b) => [sid(b._id), b]));
  const likedSet = new Set(liked.map((l) => sid(l.targetId)));
  const roleIn = new Map(roles.map((m) => [sid(m.communityId), m.role]));
  const authorRole = new Map(authorRoles.map((m) => [`${sid(m.communityId)}:${sid(m.userId)}`, m.role]));
  const byCommunity = new Map(communities.map((c) => [sid(c._id), c]));
  const me = viewer ? sid(viewer._id) : "";

  return rows.flatMap((t) => {
    const author = authors.get(sid(t.authorId));
    const c = byCommunity.get(sid(t.communityId));
    if (!author || !c) return [];
    const role = roleIn.get(sid(t.communityId));
    const member = role !== undefined;
    const mine = !!me && sid(t.authorId) === me;
    const target = authorRole.get(`${sid(t.communityId)}:${sid(t.authorId)}`);
    const moderator = isManager(role);
    return [
      {
        id: sid(t._id),
        board: (() => {
          const b = t.boardId ? boardById.get(sid(t.boardId)) : undefined;
          return b ? { id: sid(b._id), slug: b.slug, name: b.name } : { id: "", slug: "topics", name: "Topics" };
        })(),
        title: t.title,
        body: t.body,
        media: t.media?.length ? t.media.map((m) => ({ kind: m.kind, url: m.url, poster: m.poster ?? null })) : t.imageUrl ? [{ kind: "image" as const, url: t.imageUrl, poster: null }] : [],
        pinned: t.pinned,
        locked: t.locked,
        likeCount: t.likeCount,
        commentCount: t.commentCount,
        tags: t.tags ?? [],
        liked: likedSet.has(sid(t._id)),
        following: followed.has(sid(t._id)),
        createdAt: t.createdAt.toISOString(),
        editedAt: t.editedAt ? t.editedAt.toISOString() : null,
        lastActivityAt: t.lastActivityAt.toISOString(),
        author,
        community: { id: sid(c._id), slug: c.slug, name: c.name, interest: c.interest, coverImage: c.coverImage ?? null },
        // authors edit their own; owners/admins may also edit anyone they outrank
        canEdit: (mine && member) || (moderator && target !== undefined && outranks(role ?? null, target)),
        canDelete: mine || (moderator && (target === undefined || outranks(role ?? null, target))),
        canModerate: moderator,
        canLike: member,
        canComment: member && (!t.locked || moderator),
      },
    ];
  });
}

async function toComments(rows: ITopicComment[], viewer: IUser | null, topic: TopicDTO): Promise<TopicCommentDTO[]> {
  if (!rows.length) return [];
  const [authors, liked, authorRoles, myM] = await Promise.all([
    loadBriefs(rows.map((r) => r.authorId)),
    viewer ? TopicLike.find({ userId: viewer._id, targetType: "comment", targetId: { $in: rows.map((r) => r._id) } }).select("targetId").lean<{ targetId: Types.ObjectId }[]>() : [],
    topic.canModerate
      ? Membership.find({ communityId: topic.community.id, subcommunityId: null, status: "active", userId: { $in: rows.map((r) => r.authorId) } }).select("userId role").lean<Pick<IMembership, "userId" | "role">[]>()
      : [],
    viewer && topic.canModerate ? Membership.findOne({ communityId: topic.community.id, subcommunityId: null, status: "active", userId: viewer._id }).select("role").lean<Pick<IMembership, "role">>() : null,
  ]);
  const myRole = myM?.role ?? null;
  const likedSet = new Set(liked.map((l) => sid(l.targetId)));
  const roleOf = new Map(authorRoles.map((m) => [sid(m.userId), m.role]));
  const me = viewer ? sid(viewer._id) : "";
  return rows.flatMap((c) => {
    const author = authors.get(sid(c.authorId));
    if (!author) return [];
    const mine = !!me && sid(c.authorId) === me;
    const gone = !!c.deletedAt;
    return [
      {
        id: sid(c._id),
        topicId: sid(c.topicId),
        parentId: c.parentId ? sid(c.parentId) : null,
        body: gone ? "" : c.body,
        likeCount: gone ? 0 : c.likeCount,
        liked: !gone && likedSet.has(sid(c._id)),
        deleted: gone,
        createdAt: c.createdAt.toISOString(),
        editedAt: gone || !c.editedAt ? null : c.editedAt.toISOString(),
        author,
        canEdit: !gone && ((mine && topic.canComment) || (topic.canModerate && outranksAuthor(myRole, roleOf.get(sid(c.authorId))))),
        // owners/admins may edit and remove comments from anyone they outrank (the server re-checks rank)
        canDelete: !gone && (mine || (topic.canModerate && outranksAuthor(myRole, roleOf.get(sid(c.authorId))))),
      },
    ];
  });
}

/* ------------------------------------------------------------------ */
/* Board                                                               */
/* ------------------------------------------------------------------ */

type ListQuery = z.infer<typeof topicListQuery>;

export async function listTopics(viewer: IUser | null, space: Space, access: SpaceAccess, q: ListQuery): Promise<Paginated<TopicDTO>> {
  assertCommunity(space);
  assertCanView(access, "topics");
  const hidden = await hiddenUserIds(viewer?._id ?? null);
  const match: Record<string, unknown> = { communityId: space.community._id };
  const boards = await ensureBoards(space, space.community.ownerId);
  if (q.board) {
    const b = boards.find((x) => x.slug === q.board);
    if (!b) throw notFound("That board doesn't exist.");
    match.boardId = b._id;
  }
  if (hidden.length) match.authorId = { $nin: hidden };
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), "i");
    match.$or = [{ title: rx }, { body: rx }, { tags: q.q.toLowerCase() }];
  }
  if (q.tag) match.tags = q.tag;
  const skip = (q.page - 1) * PAGE;
  let rows: ITopic[];
  if (q.sort === "hot") {
    // Reddit-ish: engagement divided by age, so fresh and well-liked topics rise and old ones sink.
    const now = Date.now();
    rows = await Topic.aggregate<ITopic>([
      { $match: match },
      {
        $addFields: {
          hot: {
            $divide: [
              { $add: ["$likeCount", { $multiply: ["$commentCount", 2] }, 1] },
              { $pow: [{ $add: [{ $divide: [{ $subtract: [new Date(now), "$createdAt"] }, 3_600_000] }, 2] }, 1.4] },
            ],
          },
        },
      },
      { $sort: { pinned: -1, hot: -1, _id: -1 } },
      { $skip: skip },
      { $limit: PAGE + 1 },
    ]);
  } else {
    const sort: Record<string, 1 | -1> = q.sort === "top" ? { pinned: -1, likeCount: -1, createdAt: -1 } : { pinned: -1, createdAt: -1 };
    rows = await Topic.find(match).sort(sort).skip(skip).limit(PAGE + 1).lean<ITopic[]>();
  }
  return { items: await toTopics(rows.slice(0, PAGE), viewer), page: q.page, hasMore: rows.length > PAGE };
}

/** Topics from the communities you belong to, newest first: the home feed mixes these with events. */
export async function topicFeed(viewer: IUser, limit = 8): Promise<TopicDTO[]> {
  const mine = await Membership.find({ userId: viewer._id, subcommunityId: null, status: "active" }).select("communityId").lean<Pick<IMembership, "communityId">[]>();
  if (!mine.length) return [];
  const hidden = await hiddenUserIds(viewer._id);
  // 18+ communities' topics stay inside them
  const rows = await Topic.find({ communityId: { $in: await withoutAdult(mine.map((m) => m.communityId)) }, ...(hidden.length ? { authorId: { $nin: hidden } } : {}) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<ITopic[]>();
  return toTopics(rows, viewer);
}

/**
 * Home "trending": topics with at least TRENDING_MIN_COMMENTS comments and recent activity, most commented first.
 * Only topics the viewer may see (public communities, or ones they belong to). An empty list means "show nothing".
 */
export async function trendingTopics(viewer: IUser | null, limit = 5): Promise<TopicDTO[]> {
  const since = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);
  const hidden = await hiddenUserIds(viewer?._id ?? null);
  const pool = await Topic.find({ commentCount: { $gte: TRENDING_MIN_COMMENTS }, lastActivityAt: { $gte: since }, ...(hidden.length ? { authorId: { $nin: hidden } } : {}) })
    .sort({ commentCount: -1, lastActivityAt: -1 })
    .limit(limit * 4)
    .lean<ITopic[]>();
  if (!pool.length) return [];
  const ids = await withoutAdult([...new Set(pool.map((t) => sid(t.communityId)))]);
  const [communities, mine] = await Promise.all([
    Community.find({ _id: { $in: ids } }).select("privacy").lean<Pick<ICommunity, "_id" | "privacy">[]>(),
    viewer ? Membership.find({ userId: viewer._id, communityId: { $in: ids }, subcommunityId: null, status: "active" }).select("communityId").lean<Pick<IMembership, "communityId">[]>() : [],
  ]);
  const member = new Set(mine.map((m) => sid(m.communityId)));
  const open = new Set(communities.filter((c) => c.privacy === "public" || member.has(sid(c._id))).map((c) => sid(c._id)));
  return toTopics(pool.filter((t) => open.has(sid(t.communityId))).slice(0, limit), viewer);
}

async function loadTopic(space: Space, topicId: string): Promise<ITopic> {
  if (!Types.ObjectId.isValid(topicId)) throw notFound("That topic is gone.");
  const t = await Topic.findOne({ _id: topicId, communityId: space.community._id }).lean<ITopic>();
  if (!t) throw notFound("That topic is gone.");
  return t;
}

/** One post, its chat (made on first open; see ensureTopicThread) and the chat's newest page, so it opens in one go. */
export async function getTopic(viewer: IUser | null, space: Space, access: SpaceAccess, topicId: string): Promise<TopicDetailDTO> {
  assertCommunity(space);
  assertCanView(access, "this topic");
  const row = await loadTopic(space, topicId);
  const [topic] = await toTopics([row], viewer);
  if (!topic) throw notFound("That topic is gone.");
  const thread = await ensureTopicThread(viewer, access, row);
  return { topic, thread, messages: await listMessages(viewer, space, access, thread.slug, {}) };
}

/** "Hot sauce", "Lagos " → "hot sauce", "lagos": short, lowercase, at most three, no repeats. */
const cleanTags = (tags: string[] | undefined) => [...new Set((tags ?? []).map((t) => t.trim().toLowerCase().replace(/\s+/g, " ").slice(0, LIMITS.topicTag)).filter(Boolean))].slice(0, LIMITS.topicTags);

/** Follow a post (hear about new replies) or stop. */
export async function setFollow(viewer: IUser, space: Space, access: SpaceAccess, topicId: string, on: boolean): Promise<{ following: boolean }> {
  assertCommunity(space);
  assertCanView(access, "this topic");
  const t = await loadTopic(space, topicId);
  if (on) await TopicFollow.updateOne({ topicId: t._id, userId: viewer._id }, { $setOnInsert: { topicId: t._id, userId: viewer._id } }, { upsert: true });
  else await TopicFollow.deleteOne({ topicId: t._id, userId: viewer._id });
  return { following: on };
}

export async function createTopic(viewer: IUser, space: Space, access: SpaceAccess, input: z.infer<typeof topicCreateSchema>): Promise<TopicDTO> {
  assertCommunity(space);
  assertCanPost(access);
  const board = await resolveBoard(space, input.board);
  if (!canPostIn(board, access)) throw forbidden(`Only owners and admins can post in ${board.name}.`);
  rateLimit(`topic:${sid(viewer._id)}`, 10, 10 * 60_000);
  const doc = await Topic.create({ communityId: space.community._id, boardId: board._id, authorId: viewer._id, title: input.title, body: input.body ?? "", media: (input.media ?? []).map((m) => ({ kind: m.kind, url: m.url, poster: m.poster ?? null })), tags: cleanTags(input.tags) });
  await TopicFollow.create({ topicId: doc._id, userId: viewer._id }); // you hear about replies to your own post
  return (await toTopics([doc.toObject() as ITopic], viewer))[0];
}

export async function updateTopic(viewer: IUser, space: Space, access: SpaceAccess, topicId: string, patch: z.infer<typeof topicUpdateSchema>): Promise<TopicDTO> {
  assertCommunity(space);
  assertCanView(access, "this topic");
  const t = await loadTopic(space, topicId);
  const mine = sid(t.authorId) === sid(viewer._id);
  const set: Record<string, unknown> = {};

  const touchesContent = patch.title !== undefined || patch.body !== undefined || patch.media !== undefined || patch.tags !== undefined;
  if (touchesContent) {
    if (!(mine && access.isMember)) {
      const authorM = mine ? null : await Membership.findOne({ communityId: t.communityId, subcommunityId: null, userId: t.authorId, status: "active" }).select("role").lean<Pick<IMembership, "role">>();
      if (!access.canManage || !(authorM === null || outranks(access.role, authorM.role))) throw forbidden("You can only edit your own topics.");
    }
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.body !== undefined) set.body = patch.body;
    if (patch.tags !== undefined) set.tags = cleanTags(patch.tags);
    if (patch.media !== undefined) {
      set.media = patch.media.map((m) => ({ kind: m.kind, url: m.url, poster: m.poster ?? null }));
      set.imageUrl = null;
    }
    set.editedAt = new Date();
  }
  if (patch.pinned !== undefined || patch.locked !== undefined) {
    if (!access.canManage) throw forbidden("Only owners and admins can pin or lock topics.");
    if (patch.pinned !== undefined) set.pinned = patch.pinned;
    if (patch.locked !== undefined) set.locked = patch.locked;
  }
  if (touchesContent) {
    const body = (set.body as string | undefined) ?? t.body;
    const media = (set.media as unknown[] | undefined) ?? (t.media?.length ? t.media : t.imageUrl ? [t.imageUrl] : []);
    if (!body.trim() && media.length === 0) throw new ApiError(422, "Write something, or add a picture or video.", { errors: { body: "Write something, or add a picture or video" } });
  }
  if (Object.keys(set).length) {
    rateLimit(`topic-edit:${sid(viewer._id)}`, 40, 60_000);
    await Topic.updateOne({ _id: t._id }, { $set: set });
    // files dropped by the edit (removed pictures/videos, or the old single image) leave storage
    if (set.media !== undefined) {
      const kept = new Set(topicFileUrls({ imageUrl: null, media: set.media as ITopic["media"] }));
      deleteUploads(topicFileUrls(t).filter((u) => u && !kept.has(u)));
    }
  }
  const fresh = await Topic.findById(t._id).lean<ITopic>();
  if (set.locked !== undefined || set.title !== undefined) await syncTopicThread(fresh as ITopic);
  if (Object.keys(set).length) emitTopic(t.communityId, t._id);
  return (await toTopics([fresh as ITopic], viewer))[0];
}

export async function deleteTopic(viewer: IUser, space: Space, access: SpaceAccess, topicId: string) {
  assertCommunity(space);
  assertCanView(access, "this topic");
  const t = await loadTopic(space, topicId);
  if (sid(t.authorId) !== sid(viewer._id)) {
    if (!access.canManage) throw forbidden("You can only delete your own topics.");
    const authorM = await Membership.findOne({ communityId: t.communityId, subcommunityId: null, userId: t.authorId, status: "active" }).select("role").lean<Pick<IMembership, "role">>();
    if (authorM && !outranks(access.role, authorM.role)) throw forbidden("You can't remove a topic from someone of equal or higher rank.");
  }
  await Promise.all([TopicComment.deleteMany({ topicId: t._id }), TopicLike.deleteMany({ topicId: t._id }), TopicFollow.deleteMany({ topicId: t._id }), deleteTopicThread(t._id), Topic.deleteOne({ _id: t._id })]);
  deleteUploads(topicFileUrls(t));
  return { deleted: true };
}

/* ------------------------------------------------------------------ */
/* Comments                                                            */
/* ------------------------------------------------------------------ */

async function topicForComment(space: Space, access: SpaceAccess, topicId: string) {
  assertCommunity(space);
  assertCanView(access, "this topic");
  return loadTopic(space, topicId);
}

export async function createComment(viewer: IUser, space: Space, access: SpaceAccess, topicId: string, input: z.infer<typeof commentCreateSchema>): Promise<TopicCommentDTO> {
  const t = await topicForComment(space, access, topicId);
  assertCanPost(access);
  if (t.locked && !access.canManage) throw forbidden("This topic is locked.");
  rateLimit(`comment:${sid(viewer._id)}`, 30, 5 * 60_000);
  let parentId: Types.ObjectId | null = null;
  let parentAuthor: Types.ObjectId | null = null;
  if (input.parentId) {
    const parent = await TopicComment.findOne({ _id: input.parentId, topicId: t._id }).select("_id deletedAt authorId").lean<Pick<ITopicComment, "_id" | "deletedAt" | "authorId">>();
    if (!parent) throw notFound("The comment you're replying to is gone.");
    parentId = parent._id;
    parentAuthor = parent.deletedAt ? null : parent.authorId;
  }
  const doc = await TopicComment.create({ topicId: t._id, communityId: t.communityId, authorId: viewer._id, parentId, body: input.body });
  emitTopic(t.communityId, t._id);
  await Topic.updateOne({ _id: t._id }, { $inc: { commentCount: 1 }, $set: { lastActivityAt: doc.createdAt } });
  // the topic's author and the person answered hear about it (never yourself), bundled per topic
  const board = await Board.findById(t.boardId).select("slug").lean<{ slug: string }>();
  const href = `/communities/${space.community.slug}?view=topics${board ? `&b=${board.slug}` : ""}&t=${sid(t._id)}`;
  const me = sid(viewer._id);
  if (parentAuthor && sid(parentAuthor) !== me) {
    notify([parentAuthor], { title: `${viewer.displayName} replied to your comment`, body: input.body.slice(0, 140), data: { href } }, { actorId: viewer._id, category: "replies", groupKey: `topic:${sid(t._id)}`, many: (n) => `${n} new replies and comments on "${t.title}"`, ref: `topic:${sid(t._id)}` });
  }
  if (sid(t.authorId) !== me && (!parentAuthor || sid(parentAuthor) !== sid(t.authorId))) {
    notify([t.authorId], { title: `${viewer.displayName} commented on "${t.title}"`, body: input.body.slice(0, 140), data: { href } }, { actorId: viewer._id, category: "replies", groupKey: `topic:${sid(t._id)}`, many: (n) => `${n} new comments on "${t.title}"`, ref: `topic:${sid(t._id)}` });
  }
  const [topic] = await toTopics([{ ...t, commentCount: t.commentCount + 1 }], viewer);
  return (await toComments([doc.toObject() as ITopicComment], viewer, topic))[0];
}

async function ownComment(viewer: IUser, topic: ITopic, commentId: string) {
  if (!Types.ObjectId.isValid(commentId)) throw notFound("That comment is gone.");
  const c = await TopicComment.findOne({ _id: commentId, topicId: topic._id }).lean<ITopicComment>();
  if (!c || c.deletedAt) throw notFound("That comment is gone.");
  return { c, mine: sid(c.authorId) === sid(viewer._id) };
}

export async function updateComment(viewer: IUser, space: Space, access: SpaceAccess, topicId: string, commentId: string, input: z.infer<typeof commentUpdateSchema>): Promise<TopicCommentDTO> {
  const t = await topicForComment(space, access, topicId);
  const { c, mine } = await ownComment(viewer, t, commentId);
  if (!(mine && access.isMember)) {
    const authorM = mine ? null : await Membership.findOne({ communityId: t.communityId, subcommunityId: null, userId: c.authorId, status: "active" }).select("role").lean<Pick<IMembership, "role">>();
    if (!access.canManage || !(authorM === null || outranks(access.role, authorM.role))) throw forbidden("You can only edit your own comments.");
  }
  if (t.locked && !access.canManage) throw forbidden("This topic is locked.");
  rateLimit(`comment-edit:${sid(viewer._id)}`, 30, 60_000);
  const editedAt = input.body === c.body ? c.editedAt : new Date();
  await TopicComment.updateOne({ _id: c._id }, { $set: { body: input.body, editedAt } });
  emitTopic(t.communityId, t._id);
  const [topic] = await toTopics([t], viewer);
  return (await toComments([{ ...c, body: input.body, editedAt }], viewer, topic))[0];
}

export async function deleteComment(viewer: IUser, space: Space, access: SpaceAccess, topicId: string, commentId: string) {
  const t = await topicForComment(space, access, topicId);
  const { c, mine } = await ownComment(viewer, t, commentId);
  if (!mine) {
    if (!access.canManage) throw forbidden("You can only delete your own comments.");
    const authorM = await Membership.findOne({ communityId: t.communityId, subcommunityId: null, userId: c.authorId, status: "active" }).select("role").lean<Pick<IMembership, "role">>();
    if (authorM && !outranks(access.role, authorM.role)) throw forbidden("You can't remove a comment from someone of equal or higher rank.");
  }
  await Promise.all([
    TopicComment.updateOne({ _id: c._id }, { $set: { body: "", deletedAt: new Date(), likeCount: 0 } }),
    Topic.updateOne({ _id: t._id, commentCount: { $gt: 0 } }, { $inc: { commentCount: -1 } }),
    TopicLike.deleteMany({ targetType: "comment", targetId: c._id }),
  ]);
  emitTopic(t.communityId, t._id);
  return { deleted: true };
}

/* ------------------------------------------------------------------ */
/* Likes                                                               */
/* ------------------------------------------------------------------ */

/** Toggle your like on a topic (`commentId` omitted) or on one of its comments. Returns the new state. */
export async function toggleLike(viewer: IUser, space: Space, access: SpaceAccess, topicId: string, commentId?: string): Promise<{ liked: boolean; likeCount: number }> {
  const t = await topicForComment(space, access, topicId);
  assertCanPost(access);
  rateLimit(`topic-like:${sid(viewer._id)}`, 120, 60_000);
  let targetType: "topic" | "comment" = "topic";
  let targetId = t._id;
  if (commentId) {
    const { c } = await ownComment(viewer, t, commentId);
    targetType = "comment";
    targetId = c._id;
  }
  const bump = (by: 1 | -1) =>
    targetType === "topic"
      ? Topic.updateOne(by === -1 ? { _id: targetId, likeCount: { $gt: 0 } } : { _id: targetId }, { $inc: { likeCount: by } })
      : TopicComment.updateOne(by === -1 ? { _id: targetId, likeCount: { $gt: 0 } } : { _id: targetId }, { $inc: { likeCount: by } });
  const existing = await TopicLike.findOneAndDelete({ userId: viewer._id, targetType, targetId });
  let liked: boolean;
  if (existing) {
    liked = false;
    await bump(-1);
  } else {
    try {
      await TopicLike.create({ userId: viewer._id, topicId: t._id, targetType, targetId });
      liked = true;
      await bump(1);
      // an upvote on a board post earns its author points (once per person per post)
      if (targetType === "topic") awardPointsLater(t.authorId, "boardUpvote", `topic:${sid(t._id)}:${sid(viewer._id)}`, viewer._id);
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err; // two taps at once: the like already exists
      liked = true;
    }
  }
  const row = targetType === "topic" ? await Topic.findById(targetId).select("likeCount").lean<{ likeCount: number }>() : await TopicComment.findById(targetId).select("likeCount").lean<{ likeCount: number }>();
  return { liked, likeCount: row?.likeCount ?? 0 };
}
