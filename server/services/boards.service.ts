import { Types } from "mongoose";
import { deleteUploads } from "./media.service";
import type { z } from "zod";
import type { BoardDTO, BoardSidebarDTO } from "@/lib/types";
import { LIMITS } from "@/lib/constants";
import { ApiError, forbidden, notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import { Board, Topic, TopicComment, TopicLike, type IBoard, type ITopic } from "../models/Topic";
import { assertCanView, type Space, type SpaceAccess } from "../policies/access";
import type { IUser } from "../models/User";
import type { boardCreateSchema, boardUpdateSchema } from "../validators/schemas";
import { loadBriefs } from "../serializers";
import { hiddenUserIds } from "./blocks";
import { sid, slugify, topicFileUrls } from "./helpers";
import { emitTopic } from "./realtime";

function assertCommunity(space: Space) {
  if (space.sub) throw notFound("Boards live in the community, not in a group.");
}

/**
 * A community with no boards yet gets a default one called "Topics", and topics made before boards
 * existed move into it. Cheap and idempotent: runs on the first read.
 */
export async function ensureBoards(space: Space, ownerId: Types.ObjectId): Promise<IBoard[]> {
  const communityId = space.community._id;
  let rows = await Board.find({ communityId }).sort({ position: 1, _id: 1 }).lean<IBoard[]>();
  if (!rows.length) {
    try {
      await Board.create({ communityId, slug: "topics", name: "Topics", description: "", postPolicy: "members", position: 0, createdById: ownerId });
    } catch {
      /* someone else created it a moment ago: fine */
    }
    rows = await Board.find({ communityId }).sort({ position: 1, _id: 1 }).lean<IBoard[]>();
  }
  if (rows.length && (await Topic.exists({ communityId, boardId: null }))) {
    await Topic.updateMany({ communityId, boardId: null }, { $set: { boardId: rows[0]._id } });
  }
  return rows;
}

const canPostIn = (b: Pick<IBoard, "postPolicy">, access: SpaceAccess) => (b.postPolicy === "admins" ? access.canManage : access.canPost);

export async function listBoards(viewer: IUser | null, space: Space, access: SpaceAccess): Promise<BoardDTO[]> {
  assertCommunity(space);
  assertCanView(access, "boards");
  const rows = await ensureBoards(space, space.community.ownerId);
  const counts = await Topic.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { communityId: space.community._id } }, { $group: { _id: "$boardId", n: { $sum: 1 } } }]);
  const byId = new Map(counts.map((c) => [sid(c._id), c.n]));
  return rows.map((b) => ({
    id: sid(b._id),
    slug: b.slug,
    name: b.name,
    description: b.description,
    rules: b.rules ?? "",
    postPolicy: b.postPolicy,
    topicCount: byId.get(sid(b._id)) ?? 0,
    canPost: !!viewer && canPostIn(b, access),
  }));
}

/** Finds the board a topic goes in: by slug, or the first board when none is given. */
export async function resolveBoard(space: Space, slug: string | undefined): Promise<IBoard> {
  const rows = await ensureBoards(space, space.community.ownerId);
  const b = slug ? rows.find((r) => r.slug === slug) : rows[0];
  if (!b) throw notFound("That board doesn't exist.");
  return b;
}

export { canPostIn };

function assertManager(access: SpaceAccess) {
  if (!access.canManage) throw forbidden("Only owners and admins can manage boards.");
}

async function uniqueSlug(communityId: Types.ObjectId, name: string): Promise<string> {
  const base = slugify(name).slice(0, 36);
  for (let i = 1; i < 50; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    if (!(await Board.exists({ communityId, slug }))) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function dto(b: IBoard, access: SpaceAccess, viewer: IUser): Promise<BoardDTO> {
  return { id: sid(b._id), slug: b.slug, name: b.name, description: b.description, rules: b.rules ?? "", postPolicy: b.postPolicy, topicCount: await Topic.countDocuments({ boardId: b._id }), canPost: !!viewer && canPostIn(b, access) };
}

export async function createBoard(viewer: IUser, space: Space, access: SpaceAccess, input: z.infer<typeof boardCreateSchema>): Promise<BoardDTO> {
  assertCommunity(space);
  assertManager(access);
  rateLimit(`board:${sid(viewer._id)}`, 20, 10 * 60_000);
  const existing = await ensureBoards(space, space.community.ownerId);
  if (existing.length >= LIMITS.maxBoards) throw new ApiError(422, `A community can have up to ${LIMITS.maxBoards} boards.`, { code: "limit" });
  if (existing.some((b) => b.name.toLowerCase() === input.name.toLowerCase())) throw new ApiError(409, "There's already a board with that name.", { errors: { name: "Already used" } });
  const slug = await uniqueSlug(space.community._id, input.name);
  const position = existing.reduce((m, b) => Math.max(m, b.position), 0) + 1;
  const doc = await Board.create({ communityId: space.community._id, slug, name: input.name, description: input.description, postPolicy: input.postPolicy, position, createdById: viewer._id });
  return dto(doc.toObject() as IBoard, access, viewer);
}

async function loadBoard(space: Space, boardId: string): Promise<IBoard> {
  if (!Types.ObjectId.isValid(boardId)) throw notFound("That board doesn't exist.");
  const b = await Board.findOne({ _id: boardId, communityId: space.community._id }).lean<IBoard>();
  if (!b) throw notFound("That board doesn't exist.");
  return b;
}

export async function updateBoard(viewer: IUser, space: Space, access: SpaceAccess, boardId: string, patch: z.infer<typeof boardUpdateSchema>): Promise<BoardDTO> {
  assertCommunity(space);
  assertManager(access);
  const b = await loadBoard(space, boardId);
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined && patch.name !== b.name) {
    const clash = await Board.exists({ communityId: b.communityId, _id: { $ne: b._id }, name: new RegExp(`^${patch.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
    if (clash) throw new ApiError(409, "There's already a board with that name.", { errors: { name: "Already used" } });
    set.name = patch.name; // the slug stays put so links keep working
  }
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.postPolicy !== undefined) set.postPolicy = patch.postPolicy;
  if (patch.rules !== undefined) set.rules = patch.rules;
  if (Object.keys(set).length) {
    await Board.updateOne({ _id: b._id }, { $set: set });
    emitTopic(b.communityId, b._id); // open boards refresh their header and sidebar
  }
  return dto((await Board.findById(b._id).lean<IBoard>()) as IBoard, access, viewer);
}

/** Deleting a board removes its topics (with their comments and likes). The last board can't be deleted. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** The sidebar beside a board on desktop: what's hot this week and who's been most active. */
export async function boardSidebar(viewer: IUser | null, space: Space, access: SpaceAccess, boardId: string): Promise<BoardSidebarDTO> {
  assertCommunity(space);
  assertCanView(access, "boards");
  const b = await loadBoard(space, boardId);
  const since = new Date(Date.now() - WEEK_MS);
  const hidden = viewer ? await hiddenUserIds(viewer._id) : [];
  const active = await Topic.find({ boardId: b._id, lastActivityAt: { $gte: since }, authorId: { $nin: hidden } })
    .select("_id title likeCount commentCount authorId createdAt")
    .lean<Pick<ITopic, "_id" | "title" | "likeCount" | "commentCount" | "authorId" | "createdAt">[]>();
  const trending = [...active]
    .sort((x, y) => y.likeCount + y.commentCount - (x.likeCount + x.commentCount) || +y.createdAt - +x.createdAt)
    .filter((t) => t.likeCount + t.commentCount > 0)
    .slice(0, 5)
    .map((t) => ({ id: sid(t._id), title: t.title, likeCount: t.likeCount, commentCount: t.commentCount }));

  // a comment this week means its topic was active this week, so the comments are all on `active` topics
  const comments = await TopicComment.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { topicId: { $in: active.map((t) => t._id) }, createdAt: { $gte: since }, deletedAt: null, authorId: { $nin: hidden } } },
    { $group: { _id: "$authorId", n: { $sum: 1 } } },
  ]);
  const score = new Map<string, { topics: number; comments: number }>();
  for (const t of active) if (t.createdAt >= since) score.set(sid(t.authorId), { topics: (score.get(sid(t.authorId))?.topics ?? 0) + 1, comments: 0 });
  for (const c of comments) score.set(sid(c._id), { topics: score.get(sid(c._id))?.topics ?? 0, comments: c.n });
  const top = [...score.entries()].sort((x, y) => y[1].topics * 3 + y[1].comments - (x[1].topics * 3 + x[1].comments)).slice(0, 5);
  const briefs = await loadBriefs(top.map(([id]) => new Types.ObjectId(id)));
  const contributors = top.flatMap(([id, s]) => {
    const user = briefs.get(id);
    return user ? [{ user, ...s }] : [];
  });
  return { trending, contributors, canEdit: !!viewer && access.canManage };
}

export async function deleteBoard(viewer: IUser, space: Space, access: SpaceAccess, boardId: string) {
  assertCommunity(space);
  assertManager(access);
  const b = await loadBoard(space, boardId);
  if ((await Board.countDocuments({ communityId: b.communityId })) <= 1) throw new ApiError(422, "A community needs at least one board.", { code: "last_board" });
  const topics = await Topic.find({ boardId: b._id }).select("_id imageUrl media").lean<Pick<ITopic, "_id" | "imageUrl" | "media">[]>();
  const topicIds = topics.map((t) => t._id);
  deleteUploads(topics.flatMap(topicFileUrls));
  await Promise.all([TopicLike.deleteMany({ topicId: { $in: topicIds } }), TopicComment.deleteMany({ topicId: { $in: topicIds } }), Topic.deleteMany({ boardId: b._id })]);
  await Board.deleteOne({ _id: b._id });
  return { deleted: true };
}
