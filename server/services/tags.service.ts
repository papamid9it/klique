import "server-only";
import { Types } from "mongoose";
import type { FeedPostDTO, TextRefsDTO } from "@/lib/types";
import { extractRefs, extractTags, isTag, normalizeTag } from "@/lib/tags";
import { escapeRegex, sid } from "./helpers";
import { notFound } from "../http/errors";
import { Community, type ICommunity } from "../models/Community";
import { FeedPost, type IFeedPost } from "../models/FeedPost";
import { Membership } from "../models/Membership";
import { User, type IUser } from "../models/User";
import { notAdult } from "../policies/adult";
import { loadBriefs } from "../serializers";
import { hiddenUserIds } from "./blocks";

/**
 * @people, @communities and #tags in posts and comments. Tags are kept on the post (lower-cased) for /tags/<tag>;
 * the people and communities a text names are resolved once, when it's written, to what the author may name:
 * people who haven't blocked them (or been blocked), and communities that are public (not 18+) or theirs.
 * Anything else stays plain text, so tagging can't reveal who or what exists.
 */

export interface ResolvedRefs {
  tags: string[];
  userIds: Types.ObjectId[];
  communityIds: Types.ObjectId[];
}

export async function resolveText(author: IUser, text: string): Promise<ResolvedRefs> {
  const tags = extractTags(text);
  const tokens = extractRefs(text);
  if (!tokens.length) return { tags, userIds: [], communityIds: [] };
  const [users, communities, hidden, mine] = await Promise.all([
    User.find({ handle: { $in: tokens } }).select("_id").lean<{ _id: Types.ObjectId }[]>(),
    Community.find({ slug: { $in: tokens } }).select("_id privacy adult").lean<Pick<ICommunity, "_id" | "privacy" | "adult">[]>(),
    hiddenUserIds(author._id),
    Membership.find({ userId: author._id, subcommunityId: null, status: "active" }).distinct("communityId"),
  ]);
  const hide = new Set(hidden.map(sid));
  const mineSet = new Set(mine.map((id) => sid(id)));
  return {
    tags,
    userIds: users.map((u) => u._id).filter((id) => !hide.has(sid(id)) && sid(id) !== sid(author._id)),
    communityIds: communities.filter((c) => (c.privacy === "public" && !c.adult) || mineSet.has(sid(c._id))).map((c) => c._id),
  };
}

/** The people and communities a batch of texts names, for rendering (one lookup for the whole page). */
export async function refsFor(rows: { mentionIds?: Types.ObjectId[]; communityRefIds?: Types.ObjectId[] }[]): Promise<(row: { mentionIds?: Types.ObjectId[]; communityRefIds?: Types.ObjectId[] }) => TextRefsDTO> {
  const userIds = rows.flatMap((r) => r.mentionIds ?? []);
  const communityIds = rows.flatMap((r) => r.communityRefIds ?? []);
  const [briefs, communities] = await Promise.all([
    userIds.length ? loadBriefs(userIds) : Promise.resolve(new Map()),
    communityIds.length ? Community.find({ _id: { $in: communityIds } }).select("slug name verified official").lean<Pick<ICommunity, "_id" | "slug" | "name" | "verified" | "official">[]>() : Promise.resolve([]),
  ]);
  const byCommunity = new Map(communities.map((c) => [sid(c._id), { slug: c.slug, name: c.name, verified: !!c.verified || !!c.official }]));
  return (row) => ({
    users: (row.mentionIds ?? []).flatMap((id) => {
      const b = briefs.get(sid(id));
      return b ? [{ id: b.id, handle: b.handle, displayName: b.displayName }] : [];
    }),
    communities: (row.communityRefIds ?? []).flatMap((id) => byCommunity.get(sid(id)) ?? []),
  });
}

/** Of these tagged people, the ones who can see a post in this community (public: everyone; private: members). */
export async function whoCanSee(community: Pick<ICommunity, "_id" | "privacy">, userIds: Types.ObjectId[]): Promise<Types.ObjectId[]> {
  if (!userIds.length || community.privacy === "public") return userIds;
  const ok = await Membership.find({ userId: { $in: userIds }, communityId: community._id, subcommunityId: null, status: "active" }).distinct("userId");
  const set = new Set(ok.map((id) => sid(id)));
  return userIds.filter((id) => set.has(sid(id)));
}

/* ------------------------------ /tags ------------------------------ */

/** Communities whose posts may appear on a public tag page: public, not 18+. */
async function publicCommunityIds(): Promise<Types.ObjectId[]> {
  return Community.find({ privacy: "public", ...notAdult }).distinct("_id");
}

/**
 * /tags/<tag>: public posts with this tag, newest first (a page at a time). `toPosts` turns them into cards for the
 * viewer (it's the feed's own, passed in to keep this file free of the feed).
 */
export async function postsWithTag(viewer: IUser | null, tagRaw: string, page: number, toPosts: (rows: IFeedPost[], viewer: IUser | null) => Promise<FeedPostDTO[]>): Promise<{ tag: string; items: FeedPostDTO[]; hasMore: boolean; total: number }> {
  const tag = normalizeTag(tagRaw);
  if (!isTag(tag)) throw notFound("That isn't a tag.");
  const size = 12;
  const [ids, hidden] = await Promise.all([publicCommunityIds(), hiddenUserIds(viewer?._id ?? null)]);
  const filter = { tags: tag, communityId: { $in: ids }, hiddenAt: null, explicit: { $ne: true }, ...(hidden.length ? { authorId: { $nin: hidden } } : {}) };
  const [rows, total] = await Promise.all([FeedPost.find(filter).sort({ createdAt: -1 }).skip((page - 1) * size).limit(size + 1).lean<IFeedPost[]>(), FeedPost.countDocuments(filter)]);
  return { tag, items: await toPosts(rows.slice(0, size), viewer), hasMore: rows.length > size, total };
}

/** The tags most used in public posts over the last two weeks (for search and the tag pages). */
export async function trendingTags(limit = 12): Promise<{ tag: string; count: number }[]> {
  const ids = await publicCommunityIds();
  const rows = await FeedPost.aggregate<{ _id: string; count: number }>([
    { $match: { communityId: { $in: ids }, hiddenAt: null, createdAt: { $gte: new Date(Date.now() - 14 * 86_400_000) }, "tags.0": { $exists: true } } },
    { $unwind: "$tags" },
    { $group: { _id: "$tags", count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: limit },
  ]);
  return rows.map((r) => ({ tag: r._id, count: r.count }));
}

/** What to suggest as someone types "@que" (people and communities) or "#que" (tags in use). */
export async function suggest(viewer: IUser, kind: "@" | "#", q: string) {
  const needle = q.trim().toLowerCase();
  if (kind === "#") {
    if (!needle) return { tags: (await trendingTags(8)).map((t) => t.tag), people: [], communities: [] };
    const rows = await FeedPost.aggregate<{ _id: string; count: number }>([
      { $match: { tags: { $regex: `^${escapeRegex(needle)}` } } },
      { $unwind: "$tags" },
      { $match: { tags: { $regex: `^${escapeRegex(needle)}` } } },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]);
    return { tags: rows.map((r) => r._id), people: [], communities: [] };
  }
  const rx = new RegExp(`^${escapeRegex(needle)}`, "i");
  const hidden = await hiddenUserIds(viewer._id);
  const mine = await Membership.find({ userId: viewer._id, subcommunityId: null, status: "active" }).distinct("communityId");
  const [people, communities] = await Promise.all([
    User.find({ $or: [{ handle: rx }, { displayName: rx }], _id: { $nin: [...hidden, viewer._id] }, suspendedAt: null }).select("_id").limit(6).lean<{ _id: Types.ObjectId }[]>(),
    Community.find({ $and: [{ $or: [{ slug: rx }, { name: rx }] }, { $or: [{ privacy: "public", ...notAdult }, { _id: { $in: mine } }] }] }).select("slug name verified official").limit(4).lean<Pick<ICommunity, "slug" | "name" | "verified" | "official">[]>(),
  ]);
  const briefs = await loadBriefs(people.map((p) => p._id));
  return { tags: [], people: [...briefs.values()], communities: communities.map((c) => ({ slug: c.slug, name: c.name, verified: !!c.verified || !!c.official })) };
}

