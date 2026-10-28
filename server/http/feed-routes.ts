import { feedCaptionSchema, feedCommentEditSchema, feedCommentSchema, feedPostSchema, feedReactSchema, feedVoteSchema, homeFeedQuery } from "../validators/schemas";
import { resolveSpaceFor } from "../services/spaces.service";
import { addComment, createPost, deleteComment, deletePost, editCaption, editComment, feedSidebar, getPost, homeFeed, postCommunitySlug, listComments, listPosts, reactToComment, setPostExplicit, vote } from "../services/feed.service";
import { created, readJson, readQuery, withApi } from "./api";

/** Handlers for a community's Posts section (`/api/communities/[slug]/feed/…`) and the home feed. Authorization lives in the service. */
type Slug = { slug: string };
type Post = Slug & { postId: string };
type Comment = Post & { commentId: string };

export const feedList = withApi<Slug>({ auth: "optional" }, async ({ req, params, viewer }) => {
  const { page, at } = readQuery(req, homeFeedQuery);
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return listPosts(viewer, space, access, page, at);
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
  const { caption, explicit } = await readJson(req, feedCaptionSchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
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
export const homeFeedGet = withApi<Record<string, never>, "required">({ auth: "required" }, async ({ req, viewer }) => {
  const { page, at } = readQuery(req, homeFeedQuery);
  return homeFeed(viewer, page, at);
});
