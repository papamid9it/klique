import { feedCaptionSchema, feedCommentEditSchema, feedCommentSchema, feedPostSchema, feedReactSchema, feedVoteSchema, homeFeedQuery, reelsQuery } from "../validators/schemas";
import { resolveSpaceFor } from "../services/spaces.service";
import { assertReelsOn, addComment, createPost, deleteComment, deletePost, editCaption, editComment, feedSidebar, getPost, homeFeed, popularFeed, reelsFeed, reelsReady, postCommunitySlug, listComments, listPosts, reactToComment, setPostExplicit, setPostMediaFit, setPostSpoiler, setPostTag, vote, whoLoved, whoReactedToComment } from "../services/feed.service";
import { created, readJson, readQuery, withApi } from "./api";

/** Handlers for a community's Posts section (`/api/communities/[slug]/feed/…`) and the home feed. Authorization lives in the service. */
type Slug = { slug: string };
type Post = Slug & { postId: string };
type Comment = Post & { commentId: string };

export const feedList = withApi<Slug>({ auth: "optional" }, async ({ req, params, viewer }) => {
  const { page, at, tag, order, since } = readQuery(req, homeFeedQuery);
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return listPosts(viewer, space, access, page, at, tag, order, since);
});

/** GET …/feed/sidebar — top posters this week, for the panel beside Posts. */
export const feedSide = withApi<Slug>({ auth: "optional" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return feedSidebar(viewer, space, access);
});

export const feedCreate = withApi<Slug, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const input = await readJson(req, feedPostSchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return created(await createPost(viewer, space, access, input));
});

export const feedGet = withApi<Post>({ auth: "optional" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return getPost(viewer, space, access, params.postId);
});

/** A post by its own link (/p/[id]): the same rules as from inside its community (private, 18+, blocked). */
export const postById = withApi<{ id: string }>({ auth: "optional", limit: { name: "post-view", max: 120, windowMs: 60_000 } }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, await postCommunitySlug(params.id));
  return getPost(viewer, space, access, params.id);
});

export const feedEdit = withApi<Post, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { caption, explicit, spoiler, mediaFit, tagId } = await readJson(req, feedCaptionSchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  if (tagId !== undefined) {
    const p = await setPostTag(viewer, space, access, params.postId, tagId);
    if (caption === undefined && explicit === undefined && mediaFit === undefined && spoiler === undefined) return p;
  }
  if (spoiler !== undefined) {
    const p = await setPostSpoiler(viewer, space, access, params.postId, spoiler);
    if (caption === undefined && explicit === undefined && mediaFit === undefined) return p;
  }
  if (mediaFit !== undefined) {
    const p = await setPostMediaFit(viewer, space, access, params.postId, mediaFit);
    if (caption === undefined && explicit === undefined) return p;
  }
  if (explicit !== undefined) {
    const p = await setPostExplicit(viewer, space, access, params.postId, explicit);
    if (caption === undefined) return p;
  }
  return editCaption(viewer, space, access, params.postId, caption!);
});

export const feedDelete = withApi<Post, "required">({ auth: "required" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return deletePost(viewer, space, access, params.postId);
});

export const feedVote = withApi<Post, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { value } = await readJson(req, feedVoteSchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return vote(viewer, space, access, params.postId, value);
});

/** GET …/vote — who loved the post. */
export const feedLoves = withApi<Post>({ auth: "optional" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return whoLoved(viewer, space, access, params.postId);
});

/** GET …/comments/[id]/reactions — who reacted to the comment, and with what. */
export const feedCommentReactors = withApi<Comment>({ auth: "optional" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return whoReactedToComment(viewer, space, access, params.postId, params.commentId);
});

export const feedComments = withApi<Post>({ auth: "optional" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return listComments(viewer, space, access, params.postId);
});

export const feedCommentCreate = withApi<Post, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const input = await readJson(req, feedCommentSchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return created(await addComment(viewer, space, access, params.postId, input));
});

export const feedCommentEdit = withApi<Comment, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { body } = await readJson(req, feedCommentEditSchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return editComment(viewer, space, access, params.postId, params.commentId, body);
});

export const feedCommentDelete = withApi<Comment, "required">({ auth: "required" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return deleteComment(viewer, space, access, params.postId, params.commentId);
});

export const feedCommentReact = withApi<Comment, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { kind } = await readJson(req, feedReactSchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return reactToComment(viewer, space, access, params.postId, params.commentId, kind);
});

/** GET /api/me/feed?page=&at= — posts from your communities, best first, with a trending one from elsewhere now and then. */
export const reelsGet = withApi<Record<string, never>, "required">({ auth: "required" }, async ({ req, viewer }) => {
  await assertReelsOn();
  const { page, at, start } = readQuery(req, reelsQuery);
  return reelsFeed(viewer, page, at, start);
});

export const reelsReadyGet = withApi<Record<string, never>, "required">({ auth: "required" }, async ({ viewer }) => reelsReady(viewer));

export const homeFeedGet = withApi<Record<string, never>, "required">({ auth: "required" }, async ({ req, viewer }) => {
  const { page, at, sort, range } = readQuery(req, homeFeedQuery);
  return sort === "popular" ? popularFeed(viewer, page, range, at) : homeFeed(viewer, page, at);
});
