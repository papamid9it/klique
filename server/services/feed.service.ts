import "server-only";
import { Types } from "mongoose";
import type { z } from "zod";
import type { FeedCommentDTO, FeedPostDTO, FeedSidebarDTO, HomeFeedItem, Paginated, ReactionDTO } from "@/lib/types";
import type { ReactionKind } from "@/lib/reactions";
import { badRequest, forbidden, notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import { Community, type ICommunity } from "../models/Community";
import { FeedComment, FeedPost, FeedVote, type IFeedComment, type IFeedPost } from "../models/FeedPost";
import { Membership, type IMembership } from "../models/Membership";
import type { IUser } from "../models/User";
import { assertCanView, outranks, type Space, type SpaceAccess } from "../policies/access";
import { loadBriefs } from "../serializers";
import type { feedCommentSchema, feedPostSchema } from "../validators/schemas";
import { hiddenUserIds } from "./blocks";
import { sid } from "./helpers";
import { awardPointsLater } from "./points.service";
import { deleteUploads } from "./media.service";
import { notify } from "./push.service";
import { purgeReactions, summarizeReactions, toggleReaction } from "./reactions";
import { previewOf } from "./replies";
import { TEXT_CARD_MAX, textStyleOf } from "@/lib/feedText";
import { assertStickerUrl, noteStickerUse } from "./stickers.service";

const PAGE = 10;
const COMMENT_CAP = 500;
type Role = IMembership["role"];
const isManager = (r?: Role | null) => r === "owner" || r === "admin";
const fileUrls = (p: Pick<IFeedPost, "media">) => p.media.flatMap((m) => [m.url, m.poster]);

/** Posts live in the community (not in its groups), and only when the community has turned them on. */
function assertFeed(space: Space) {
  if (space.sub) throw notFound("Posts live in the community, not in a group.");
  if ((space.community.feedPolicy ?? "off") === "off") throw notFound("This community doesn't have posts turned on.");
}

/** Owners and admins always; members too when the community lets them (and they have the points it asks for). */
function canPostIn(c: Pick<ICommunity, "feedPolicy">, access: SpaceAccess) {
  const policy = c.feedPolicy ?? "off";
  return policy !== "off" && !access.banned && (access.canManage || (policy === "members" && access.canPost && !access.pointsToPost));
}

/* ------------------------------------------------------------------ */
/* Serialisation                                                       */
/* ------------------------------------------------------------------ */

/** Posts → DTOs in a few batched queries; works across communities (the home feed), with the viewer's real role in each. */
async function toPosts(rows: IFeedPost[], viewer: IUser | null): Promise<FeedPostDTO[]> {
  if (!rows.length) return [];
  const communityIds = [...new Set(rows.map((r) => sid(r.communityId)))];
  const [authors, communities, votes, roles, authorRoles] = await Promise.all([
    loadBriefs(rows.map((r) => r.authorId)),
    Community.find({ _id: { $in: communityIds } }).select("slug name interest coverImage privacy explicit").lean<Pick<ICommunity, "_id" | "slug" | "name" | "interest" | "coverImage" | "privacy" | "explicit">[]>(),
    viewer ? FeedVote.find({ userId: viewer._id, postId: { $in: rows.map((r) => r._id) } }).select("postId value").lean<{ postId: Types.ObjectId; value: 1 | -1 }[]>() : [],
    viewer ? Membership.find({ userId: viewer._id, communityId: { $in: communityIds }, subcommunityId: null, status: "active" }).select("communityId role").lean<Pick<IMembership, "communityId" | "role">[]>() : [],
    Membership.find({ communityId: { $in: communityIds }, subcommunityId: null, status: "active", userId: { $in: rows.map((r) => r.authorId) } }).select("communityId userId role").lean<Pick<IMembership, "communityId" | "userId" | "role">[]>(),
  ]);
  const byCommunity = new Map(communities.map((c) => [sid(c._id), c]));
  const voteOf = new Map(votes.map((v) => [sid(v.postId), v.value]));
  const roleIn = new Map(roles.map((m) => [sid(m.communityId), m.role]));
  const authorRole = new Map(authorRoles.map((m) => [`${sid(m.communityId)}:${sid(m.userId)}`, m.role]));
  const me = viewer ? sid(viewer._id) : "";
  return rows.flatMap((p) => {
    const author = authors.get(sid(p.authorId));
    const c = byCommunity.get(sid(p.communityId));
    if (!author || !c) return [];
    const role = roleIn.get(sid(p.communityId));
    const mine = !!me && sid(p.authorId) === me;
    const target = authorRole.get(`${sid(p.communityId)}:${sid(p.authorId)}`);
    return [
      {
        id: sid(p._id),
        community: { id: sid(c._id), slug: c.slug, name: c.name, interest: c.interest, coverImage: c.coverImage ?? null, privacy: c.privacy, explicit: !!c.explicit },
        author,
        caption: p.caption,
        title: p.title ?? "",
        explicit: !!p.explicit,
        textBg: p.media.length ? null : (p.textBg ?? null),
        media: p.media.map((m) => ({ kind: m.kind, url: m.url, poster: m.poster ?? null })),
        upCount: p.upCount,
        downCount: p.downCount,
        myVote: voteOf.get(sid(p._id)) ?? 0,
        commentCount: p.commentCount,
        createdAt: p.createdAt.toISOString(),
        editedAt: p.editedAt ? p.editedAt.toISOString() : null,
        isMember: role !== undefined,
        canEdit: mine && role !== undefined,
        // owners/admins remove anyone they outrank
        canDelete: mine || (isManager(role) && (target === undefined || outranks(role ?? null, target))),
      },
    ];
  });
}

async function toComments(rows: IFeedComment[], viewer: IUser | null, managerRole: Role | null): Promise<FeedCommentDTO[]> {
  if (!rows.length) return [];
  const [authors, reactions, authorRoles] = await Promise.all([
    loadBriefs(rows.map((r) => r.authorId)),
    summarizeReactions("feedComment", rows.map((r) => r._id), viewer?._id ?? null),
    isManager(managerRole) ? Membership.find({ communityId: rows[0].communityId, subcommunityId: null, status: "active", userId: { $in: rows.map((r) => r.authorId) } }).select("userId role").lean<Pick<IMembership, "userId" | "role">[]>() : [],
  ]);
  const roleOf = new Map(authorRoles.map((m) => [sid(m.userId), m.role]));
  const me = viewer ? sid(viewer._id) : "";
  return rows.flatMap((c) => {
    const author = authors.get(sid(c.authorId));
    if (!author) return [];
    const gone = !!c.deletedAt;
    const target = roleOf.get(sid(c.authorId));
    return [
      {
        id: sid(c._id),
        postId: sid(c.postId),
        parentId: c.parentId ? sid(c.parentId) : null,
        body: gone ? "" : c.body,
        sticker: gone ? null : (c.sticker ?? null),
        stickerUrl: gone ? null : (c.stickerUrl ?? null),
        deleted: gone,
        createdAt: c.createdAt.toISOString(),
        editedAt: !gone && c.editedAt ? c.editedAt.toISOString() : null,
        author,
        reactions: gone ? [] : (reactions.get(sid(c._id)) ?? []),
        canEdit: !gone && sid(c.authorId) === me,
        canDelete: !gone && (sid(c.authorId) === me || (isManager(managerRole) && (target === undefined || outranks(managerRole, target)))),
      },
    ];
  });
}

/* ------------------------------------------------------------------ */
/* A community's posts                                                 */
/* ------------------------------------------------------------------ */

/** Newest first. `at` (from page 1) leaves out what was posted since, so later pages don't shift. */
export async function listPosts(viewer: IUser | null, space: Space, access: SpaceAccess, page: number, at?: number): Promise<Paginated<FeedPostDTO> & { at: number }> {
  assertFeed(space);
  assertCanView(access, "posts");
  const hidden = await hiddenUserIds(viewer?._id ?? null);
  const now = at && at <= Date.now() && at > Date.now() - 24 * HOUR ? at : Date.now();
  const rows = await FeedPost.find({ communityId: space.community._id, createdAt: { $lte: new Date(now) }, hiddenAt: null, ...(hidden.length ? { authorId: { $nin: hidden } } : {}) })
    .sort({ createdAt: -1 })
    .skip((page - 1) * PAGE)
    .limit(PAGE + 1)
    .lean<IFeedPost[]>();
  return { items: await toPosts(rows.slice(0, PAGE), viewer), page, hasMore: rows.length > PAGE, at: now };
}

export async function createPost(viewer: IUser, space: Space, access: SpaceAccess, input: z.infer<typeof feedPostSchema>): Promise<FeedPostDTO> {
  assertFeed(space);
  if (!canPostIn(space.community, access)) throw forbidden(space.community.feedPolicy === "admins" ? "Only owners and admins post here." : access.pointsToPost ? `You need ${access.pointsToPost.toLocaleString("en-NG")} points to post here.` : "Join this community to post.");
  rateLimit(`feed-post:${sid(viewer._id)}`, 15, 60 * 60_000);
  // a title and a card colour only mean something on a post without pictures or a video
  const style = textStyleOf(input);
  const doc = await FeedPost.create({
    communityId: space.community._id,
    authorId: viewer._id,
    caption: input.caption,
    title: input.media.length ? "" : input.title,
    textBg: style === "card" ? (input.textBg ?? "sunset") : null,
    // only a community that allows explicit content takes explicit posts
    explicit: !!space.community.explicit && input.explicit,
    media: input.media.map((m) => ({ kind: m.kind, url: m.url, poster: m.poster ?? null })),
  });
  return (await toPosts([doc.toObject() as IFeedPost], viewer))[0];
}

async function loadPost(space: Space, postId: string): Promise<IFeedPost> {
  if (!Types.ObjectId.isValid(postId)) throw notFound("That post is gone.");
  // hidden pending review (a "minor or non-consensual" report): gone until an admin decides
  const p = await FeedPost.findOne({ _id: postId, communityId: space.community._id, hiddenAt: null }).lean<IFeedPost>();
  if (!p) throw notFound("That post is gone.");
  return p;
}

export async function getPost(viewer: IUser | null, space: Space, access: SpaceAccess, postId: string): Promise<FeedPostDTO> {
  assertFeed(space);
  assertCanView(access, "this post");
  const [dto] = await toPosts([await loadPost(space, postId)], viewer);
  if (!dto) throw notFound("That post is gone.");
  return dto;
}

export async function editCaption(viewer: IUser, space: Space, access: SpaceAccess, postId: string, caption: string): Promise<FeedPostDTO> {
  assertFeed(space);
  const p = await loadPost(space, postId);
  if (sid(p.authorId) !== sid(viewer._id) || !access.isMember) throw forbidden("You can only edit your own posts.");
  // a text post keeps some text, and long text keeps a title (lib/feedText)
  if (!p.media.length && !caption) throw badRequest("A post without pictures or a video needs some text.");
  if (!p.media.length && caption.length > TEXT_CARD_MAX && !p.title) throw badRequest(`Keep it under ${TEXT_CARD_MAX} characters: longer posts need a title.`);
  await FeedPost.updateOne({ _id: p._id }, { $set: { caption, editedAt: new Date() } });
  return getPost(viewer, space, access, postId);
}

/** Mark a post explicit or not (blurred until tapped): its author, or the community's owner and admins; only where explicit content is allowed. */
export async function setPostExplicit(viewer: IUser, space: Space, access: SpaceAccess, postId: string, on: boolean): Promise<FeedPostDTO> {
  assertFeed(space);
  if (on && !space.community.explicit) throw badRequest("Only a community that allows explicit content can have explicit posts.");
  const p = await loadPost(space, postId);
  if (!((sid(p.authorId) === sid(viewer._id) && access.isMember) || access.canManage)) throw forbidden("Only the poster and this community's owner and admins can do that.");
  await FeedPost.updateOne({ _id: p._id }, { $set: { explicit: on } });
  return getPost(viewer, space, access, postId);
}

export async function deletePost(viewer: IUser, space: Space, access: SpaceAccess, postId: string) {
  assertFeed(space);
  const p = await loadPost(space, postId);
  if (sid(p.authorId) !== sid(viewer._id)) {
    if (!access.canManage) throw forbidden("You can only delete your own posts.");
    const authorM = await Membership.findOne({ communityId: p.communityId, subcommunityId: null, userId: p.authorId, status: "active" }).select("role").lean<Pick<IMembership, "role">>();
    if (authorM && !outranks(access.role, authorM.role)) throw forbidden("You can't remove a post from someone of equal or higher rank.");
  }
  const comments = await FeedComment.find({ postId: p._id }).select("_id").lean<{ _id: Types.ObjectId }[]>();
  await Promise.all([purgeReactions("feedComment", comments.map((c) => c._id)), FeedComment.deleteMany({ postId: p._id }), FeedVote.deleteMany({ postId: p._id }), FeedPost.deleteOne({ _id: p._id })]);
  deleteUploads(fileUrls(p));
  return { deleted: true };
}

/** Vote up (1), down (-1) or take your vote back (0). Members only. Returns the post's fresh counts. */
export async function vote(viewer: IUser, space: Space, access: SpaceAccess, postId: string, value: 1 | -1 | 0): Promise<Pick<FeedPostDTO, "upCount" | "downCount" | "myVote">> {
  assertFeed(space);
  // anyone signed in may vote on a public community's posts (suggested posts in the home feed); private ones need you in
  if (access.banned || (!access.isMember && space.community.privacy !== "public")) throw forbidden("Join this community to vote.");
  rateLimit(`feed-vote:${sid(viewer._id)}`, 120, 60_000);
  const p = await loadPost(space, postId);
  // read the old vote and write the new one in one step, so two quick clicks can't both count
  const who = { postId: p._id, userId: viewer._id };
  const before =
    value === 0
      ? await FeedVote.findOneAndDelete(who).select("value").lean<{ value: 1 | -1 }>()
      : await FeedVote.findOneAndUpdate(who, { $set: { value }, $setOnInsert: { createdAt: new Date() } }, { upsert: true, returnDocument: "before" }).select("value").lean<{ value: 1 | -1 }>();
  const was = before?.value ?? 0;
  if (was !== value) {
    const inc = { upCount: (value === 1 ? 1 : 0) - (was === 1 ? 1 : 0), downCount: (value === -1 ? 1 : 0) - (was === -1 ? 1 : 0) };
    await FeedPost.updateOne({ _id: p._id }, { $inc: inc });
    // an upvote earns the author points (once per person per post, however often it's taken back and given again)
    if (value === 1) awardPointsLater(p.authorId, "postUpvote", `feed:${sid(p._id)}:${sid(viewer._id)}`, viewer._id);
  }
  const fresh = await FeedPost.findById(p._id).select("upCount downCount").lean<Pick<IFeedPost, "upCount" | "downCount">>();
  return { upCount: Math.max(0, fresh?.upCount ?? 0), downCount: Math.max(0, fresh?.downCount ?? 0), myVote: value };
}

/** Beside a community's Posts on wide screens: who posted the most this week, and how well it went down. */
export async function feedSidebar(viewer: IUser | null, space: Space, access: SpaceAccess): Promise<FeedSidebarDTO> {
  assertFeed(space);
  assertCanView(access, "posts");
  const hidden = await hiddenUserIds(viewer?._id ?? null);
  const rows = await FeedPost.aggregate<{ _id: Types.ObjectId; posts: number; upvotes: number }>([
    { $match: { communityId: space.community._id, createdAt: { $gte: new Date(Date.now() - 7 * 24 * HOUR) }, ...(hidden.length ? { authorId: { $nin: hidden } } : {}) } },
    { $group: { _id: "$authorId", posts: { $sum: 1 }, upvotes: { $sum: "$upCount" } } },
    { $sort: { upvotes: -1, posts: -1 } },
    { $limit: 3 },
  ]);
  const people = await loadBriefs(rows.map((r) => r._id));
  return { topPosters: rows.flatMap((r) => (people.has(sid(r._id)) ? [{ user: people.get(sid(r._id))!, posts: r.posts, upvotes: r.upvotes }] : [])) };
}

/* ------------------------------------------------------------------ */
/* Comments                                                            */
/* ------------------------------------------------------------------ */

export async function listComments(viewer: IUser | null, space: Space, access: SpaceAccess, postId: string): Promise<FeedCommentDTO[]> {
  assertFeed(space);
  assertCanView(access, "this post");
  const p = await loadPost(space, postId);
  const hidden = await hiddenUserIds(viewer?._id ?? null);
  const rows = await FeedComment.find({ postId: p._id, ...(hidden.length ? { authorId: { $nin: hidden } } : {}) }).sort({ _id: 1 }).limit(COMMENT_CAP).lean<IFeedComment[]>();
  return toComments(rows, viewer, access.role);
}

export async function addComment(viewer: IUser, space: Space, access: SpaceAccess, postId: string, input: z.infer<typeof feedCommentSchema>): Promise<FeedCommentDTO> {
  assertFeed(space);
  if (!access.isMember || access.banned) throw forbidden("Join this community to comment.");
  rateLimit(`feed-comment:${sid(viewer._id)}`, 30, 5 * 60_000);
  const sticker = input.sticker ?? null;
  const stickerUrl = input.stickerUrl && !sticker ? assertStickerUrl(input.stickerUrl) : null;
  const p = await loadPost(space, postId);
  let parent: Pick<IFeedComment, "_id" | "authorId" | "deletedAt"> | null = null;
  if (input.parentId) {
    parent = await FeedComment.findOne({ _id: input.parentId, postId: p._id }).select("_id authorId deletedAt").lean<Pick<IFeedComment, "_id" | "authorId" | "deletedAt">>();
    if (!parent) throw badRequest("The comment you're replying to is gone.");
  }
  const doc = await FeedComment.create({ postId: p._id, communityId: p.communityId, authorId: viewer._id, parentId: parent?._id ?? null, body: input.body, sticker, stickerUrl });
  await FeedPost.updateOne({ _id: p._id }, { $inc: { commentCount: 1 } });
  noteStickerUse(viewer._id, stickerUrl);
  const said = previewOf({ body: input.body, sticker, stickerUrl }).slice(0, 140);
  // the post's author and the person answered hear about it (never yourself), bundled per post
  const href = `/communities/${space.community.slug}?view=posts&p=${sid(p._id)}`;
  const me = sid(viewer._id);
  const told = new Set<string>([me]);
  if (parent && !parent.deletedAt && !told.has(sid(parent.authorId))) {
    told.add(sid(parent.authorId));
    notify([parent.authorId], { title: `${viewer.displayName} replied to your comment`, body: said, data: { href } }, { actorId: viewer._id, category: "replies", groupKey: `feed:${sid(p._id)}`, many: (n) => `${n} new replies on your post`, ref: `feed:${sid(p._id)}` });
  }
  if (!told.has(sid(p.authorId))) {
    notify([p.authorId], { title: `${viewer.displayName} commented on your post`, body: said, data: { href } }, { actorId: viewer._id, category: "replies", groupKey: `feed:${sid(p._id)}`, many: (n) => `${n} new comments on your post`, ref: `feed:${sid(p._id)}` });
  }
  return (await toComments([doc.toObject() as IFeedComment], viewer, access.role))[0];
}

async function loadComment(postId: string, commentId: string) {
  if (!Types.ObjectId.isValid(commentId)) throw notFound("That comment is gone.");
  const c = await FeedComment.findOne({ _id: commentId, postId }).lean<IFeedComment>();
  if (!c || c.deletedAt) throw notFound("That comment is gone.");
  return c;
}

/** Change your own comment's text (a sticker stays; with no sticker, some text has to stay too). */
export async function editComment(viewer: IUser, space: Space, access: SpaceAccess, postId: string, commentId: string, body: string): Promise<FeedCommentDTO> {
  assertFeed(space);
  const p = await loadPost(space, postId);
  const c = await loadComment(sid(p._id), commentId);
  if (sid(c.authorId) !== sid(viewer._id) || !access.isMember) throw forbidden("You can only edit your own comments.");
  if (!body && !c.sticker && !c.stickerUrl) throw badRequest("Write something, or delete the comment.");
  await FeedComment.updateOne({ _id: c._id }, { $set: { body, editedAt: new Date() } });
  return (await toComments([{ ...c, body, editedAt: new Date() }], viewer, access.role))[0];
}

export async function deleteComment(viewer: IUser, space: Space, access: SpaceAccess, postId: string, commentId: string) {
  assertFeed(space);
  const p = await loadPost(space, postId);
  const c = await loadComment(sid(p._id), commentId);
  if (sid(c.authorId) !== sid(viewer._id)) {
    if (!access.canManage) throw forbidden("You can only delete your own comments.");
    const authorM = await Membership.findOne({ communityId: p.communityId, subcommunityId: null, userId: c.authorId, status: "active" }).select("role").lean<Pick<IMembership, "role">>();
    if (authorM && !outranks(access.role, authorM.role)) throw forbidden("You can't remove a comment from someone of equal or higher rank.");
  }
  // the row stays as "deleted" so the replies under it keep their place
  await Promise.all([FeedComment.updateOne({ _id: c._id }, { $set: { body: "", sticker: null, stickerUrl: null, deletedAt: new Date() } }), FeedPost.updateOne({ _id: p._id, commentCount: { $gt: 0 } }, { $inc: { commentCount: -1 } }), purgeReactions("feedComment", [c._id])]);
  return { deleted: true };
}

/** An emoji reaction on a comment (one per person; the same one again takes it back). */
export async function reactToComment(viewer: IUser, space: Space, access: SpaceAccess, postId: string, commentId: string, kind: ReactionKind): Promise<ReactionDTO[]> {
  assertFeed(space);
  if (!access.isMember || access.banned) throw forbidden("Join this community to react.");
  rateLimit(`react:${sid(viewer._id)}`, 60, 30_000);
  const p = await loadPost(space, postId);
  const c = await loadComment(sid(p._id), commentId);
  return toggleReaction("feedComment", c._id, viewer._id, kind);
}

/* ------------------------------------------------------------------ */
/* Home feed                                                           */
/* ------------------------------------------------------------------ */

const HOUR = 3_600_000;
/** Newer, busier posts first; videos rank above pictures, and pictures above text-only posts (still shown, lower). */
function rank(p: IFeedPost, now: number) {
  const engagement = 1 + Math.max(0, p.upCount - p.downCount) + p.commentCount * 0.5;
  const media = p.media.some((m) => m.kind === "video") ? 1.8 : p.media.length ? 1.5 : 0.6;
  return (engagement * media) / Math.pow((now - p.createdAt.getTime()) / HOUR + 2, 1.3);
}

/**
 * Text-only posts never open the feed and come at most one in four: each waits until at least three posts with
 * pictures or a video have gone by since the last one (they still all show, at the end if they run out).
 * Deterministic, so pages still line up.
 */
function spaceOutText(ranked: IFeedPost[]): IFeedPost[] {
  const out: IFeedPost[] = [];
  const waiting: IFeedPost[] = [];
  let sinceText = 0;
  for (const p of ranked) {
    if (!p.media.length) {
      waiting.push(p);
    } else {
      out.push(p);
      sinceText++;
    }
    if (sinceText >= 3 && waiting.length) {
      out.push(waiting.shift()!);
      sinceText = 0;
    }
  }
  return [...out, ...waiting];
}

/** after how many of your own posts a suggested one comes in */
const SUGGEST_EVERY = 5;

/**
 * Posts from your communities, best first (see rank), a page at a time, with suggested posts from public
 * communities you're not in mixed in: one after every SUGGEST_EVERY of yours, then only suggestions once yours run
 * out, so the feed keeps going. Suggestions are what's taking off (the same rank: recent votes and comments), with
 * pictures and video first; never from private communities, people you've hidden, or a community whose points
 * minimum you can't meet yet. Each appears once (marked `trending`, shown with Join).
 */
export async function homeFeed(viewer: IUser, page: number, at?: number): Promise<{ items: HomeFeedItem[]; page: number; hasMore: boolean; at: number }> {
  const mine = await Membership.find({ userId: viewer._id, subcommunityId: null, status: "active" }).select("communityId").lean<Pick<IMembership, "communityId">[]>();
  const mineIds = mine.map((m) => m.communityId);
  const [open, hidden, elsewhere] = await Promise.all([
    // 18+ communities' posts stay inside them
    Community.find({ _id: { $in: mineIds }, feedPolicy: { $in: ["admins", "members"] }, adult: { $ne: true } }).select("_id").lean<{ _id: Types.ObjectId }[]>(),
    hiddenUserIds(viewer._id),
    Community.find({ _id: { $nin: mineIds }, privacy: "public", feedPolicy: { $in: ["admins", "members"] }, $or: [{ minPointsJoin: { $exists: false } }, { minPointsJoin: { $lte: viewer.points ?? 0 } }] }).select("_id").limit(500).lean<{ _id: Types.ObjectId }[]>(),
  ]);
  // later pages rank as of page 1 and leave out what was posted since, so the pages line up
  const now = at && at <= Date.now() && at > Date.now() - 24 * HOUR ? at : Date.now();
  const notHidden = { hiddenAt: null, ...(hidden.length ? { authorId: { $nin: hidden } } : {}) };
  const [pool, suggestions] = await Promise.all([
    open.length ? FeedPost.find({ communityId: { $in: open.map((c) => c._id) }, createdAt: { $gte: new Date(now - 60 * 24 * HOUR), $lte: new Date(now) }, ...notHidden }).sort({ createdAt: -1 }).limit(400).lean<IFeedPost[]>() : [],
    elsewhere.length ? FeedPost.find({ communityId: { $in: elsewhere.map((c) => c._id) }, createdAt: { $gte: new Date(now - 14 * 24 * HOUR), $lte: new Date(now) }, ...notHidden }).sort({ createdAt: -1 }).limit(200).lean<IFeedPost[]>() : [],
  ]);
  pool.sort((a, b) => rank(b, now) - rank(a, now));
  // what's taking off, pictures and video first
  suggestions.sort((a, b) => Number(b.media.length > 0) - Number(a.media.length > 0) || rank(b, now) - rank(a, now));

  // yours with a suggestion after every few, then suggestions only (the same order every time, so pages line up)
  const merged: { post: IFeedPost; trending: boolean }[] = [];
  let s = 0;
  spaceOutText(pool).forEach((p, i) => {
    merged.push({ post: p, trending: false });
    if ((i + 1) % SUGGEST_EVERY === 0 && s < suggestions.length) merged.push({ post: suggestions[s++], trending: true });
  });
  while (s < suggestions.length) merged.push({ post: suggestions[s++], trending: true });

  const slice = merged.slice((page - 1) * PAGE, page * PAGE);
  const dtos = await toPosts(slice.map((x) => x.post), viewer);
  const byId = new Map(dtos.map((d) => [d.id, d]));
  const items: HomeFeedItem[] = slice.flatMap((x) => (byId.has(sid(x.post._id)) ? [{ post: byId.get(sid(x.post._id))!, trending: x.trending }] : []));
  return { items, page, hasMore: merged.length > page * PAGE, at: now };
}
