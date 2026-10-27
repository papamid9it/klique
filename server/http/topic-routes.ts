import { boardCreateSchema, boardUpdateSchema, commentCreateSchema, commentUpdateSchema, topicCreateSchema, topicListQuery, topicUpdateSchema } from "../validators/schemas";
import { resolveSpaceFor } from "../services/spaces.service";
import { boardSidebar, createBoard, deleteBoard, listBoards, updateBoard } from "../services/boards.service";
import { createComment, createTopic, deleteComment, deleteTopic, getTopic, listTopics, setFollow, toggleLike, topicFeed, trendingTopics, updateComment, updateTopic } from "../services/topics.service";
import { remember } from "../cache";
import { created, readJson, readQuery, withApi } from "./api";

/** Handlers for a community's topics board (`/api/communities/[slug]/topics/…`). Authorization lives in policies + services. */
type Slug = { slug: string };
type Topic = Slug & { topicId: string };
type Comment = Topic & { commentId: string };

export const boardsList = withApi<Slug>({ auth: "optional" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return listBoards(viewer, space, access);
});

export const boardsCreate = withApi<Slug, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const input = await readJson(req, boardCreateSchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return created(await createBoard(viewer, space, access, input));
});

export const boardUpdate = withApi<Slug & { boardId: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const patch = await readJson(req, boardUpdateSchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return updateBoard(viewer, space, access, params.boardId, patch);
});

/** GET …/boards/:boardId/sidebar — trending topics and top contributors this week, for the desktop sidebar. */
export const boardSidebarGet = withApi<Slug & { boardId: string }>({ auth: "optional" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return boardSidebar(viewer, space, access, params.boardId);
});

export const boardDelete = withApi<Slug & { boardId: string }, "required">({ auth: "required" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return deleteBoard(viewer, space, access, params.boardId);
});

export const topicsList = withApi<Slug>({ auth: "optional" }, async ({ req, params, viewer }) => {
  const q = readQuery(req, topicListQuery);
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return listTopics(viewer, space, access, q);
});

export const topicsCreate = withApi<Slug, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const input = await readJson(req, topicCreateSchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return created(await createTopic(viewer, space, access, input));
});

export const topicGet = withApi<Topic>({ auth: "optional" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return getTopic(viewer, space, access, params.topicId);
});

export const topicUpdate = withApi<Topic, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const patch = await readJson(req, topicUpdateSchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return updateTopic(viewer, space, access, params.topicId, patch);
});

export const topicDelete = withApi<Topic, "required">({ auth: "required" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return deleteTopic(viewer, space, access, params.topicId);
});

export const topicLike = withApi<Topic, "required">({ auth: "required" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return toggleLike(viewer, space, access, params.topicId);
});

/** Follow a post (hear about new replies), or stop following it. */
export const topicFollow = withApi<Topic, "required">({ auth: "required" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return setFollow(viewer, space, access, params.topicId, true);
});

export const topicUnfollow = withApi<Topic, "required">({ auth: "required" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return setFollow(viewer, space, access, params.topicId, false);
});

/** Threaded comments: posts now reply in their own chat, but these stay for older app versions. */
export const commentCreate = withApi<Topic, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const input = await readJson(req, commentCreateSchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return created(await createComment(viewer, space, access, params.topicId, input));
});

export const commentUpdate = withApi<Comment, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const input = await readJson(req, commentUpdateSchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return updateComment(viewer, space, access, params.topicId, params.commentId, input);
});

export const commentDelete = withApi<Comment, "required">({ auth: "required" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return deleteComment(viewer, space, access, params.topicId, params.commentId);
});

export const commentLike = withApi<Comment, "required">({ auth: "required" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return toggleLike(viewer, space, access, params.topicId, params.commentId);
});

/** Topics from the communities you've joined: the home feed mixes these with events. */
export const topicsFeed = withApi<Record<string, never>, "required">({ auth: "required" }, async ({ viewer }) => topicFeed(viewer));

/** Trending topics for the home page (30+ comments). Signed-out visitors share one cached copy. */
export const topicsTrending = withApi<Record<string, never>, "optional">({ auth: "optional", publicCache: 30 }, async ({ viewer }) => {
  if (!viewer) return remember("public", "trending", 60, () => trendingTopics(null));
  return trendingTopics(viewer);
});
