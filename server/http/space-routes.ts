import { z } from "zod";
import {
  inviteCreateSchema,
  joinSchema,
  memberListQuery,
  postCreateSchema,
  requestDecisionSchema,
  roleSchema,
} from "../validators/schemas";
import {
  changeRole,
  createInvite,
  createPost,
  decideRequest,
  deletePost,
  joinSpace,
  leaveSpace,
  listInvites,
  listMembers,
  listPosts,
  listRequests,
  removeMember,
  resolveSpaceFor,
  revokeInvite,
  transferOwnership,
} from "../services/spaces.service";
import { created, readJson, readQuery, withApi } from "./api";

/**
 * Handlers shared by communities (`/api/communities/[slug]/…`) and their groups
 * (`/api/communities/[slug]/groups/[subSlug]/…`). `subSlug` is simply absent for
 * a community, so one implementation (and one set of access rules) serves both.
 * The authorization itself lives in server/policies + services — never here.
 */
type Base = { slug: string; subSlug?: string };

const banQuery = z.object({ ban: z.preprocess((v) => v === "true", z.boolean()).default(false) });
const pageOnly = memberListQuery;

export const join = withApi<Base, "required">({ auth: "required", limit: { name: "join", max: 60, windowMs: 60_000 } }, async ({ req, params, viewer }) => {
  const input = await readJson(req, joinSchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return joinSpace(viewer, space, input, access);
});

export const leave = withApi<Base, "required">({ auth: "required" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return leaveSpace(viewer, space, access);
});

export const members = withApi<Base, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { page, q } = readQuery(req, pageOnly);
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return listMembers(viewer, space, access, page, q);
});

type WithUser = Base & { userId: string };

export const memberRole = withApi<WithUser, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { role } = await readJson(req, roleSchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return changeRole(viewer, space, access, params.userId, role);
});

export const memberRemove = withApi<WithUser, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { ban } = readQuery(req, banQuery);
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return removeMember(viewer, space, access, params.userId, ban);
});

export const memberTransfer = withApi<WithUser, "required">({ auth: "required" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return transferOwnership(viewer, space, access, params.userId);
});

export const requests = withApi<Base, "required">({ auth: "required" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return listRequests(space, access);
});

type WithRequest = Base & { requestId: string };

export const requestDecide = withApi<WithRequest, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { action } = await readJson(req, requestDecisionSchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return decideRequest(viewer, space, access, params.requestId, action);
});

export const invitesList = withApi<Base, "required">({ auth: "required" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return listInvites(space, access);
});

export const invitesCreate = withApi<Base, "required">({ auth: "required", limit: { name: "invite", max: 30, windowMs: 60 * 60_000 } }, async ({ req, params, viewer }) => {
  const input = await readJson(req, inviteCreateSchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return created(await createInvite(viewer, space, access, input));
});

type WithInvite = Base & { inviteId: string };

export const inviteRevoke = withApi<WithInvite, "required">({ auth: "required" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return revokeInvite(space, access, params.inviteId);
});

export const postsList = withApi<Base, "optional">({ auth: "optional" }, async ({ req, params, viewer }) => {
  const { page } = readQuery(req, pageOnly);
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return listPosts(viewer, space, access, page);
});

export const postsCreate = withApi<Base, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const input = await readJson(req, postCreateSchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return created(await createPost(viewer, space, access, input));
});

type WithPost = Base & { postId: string };

export const postDelete = withApi<WithPost, "required">({ auth: "required" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return deletePost(viewer, space, access, params.postId);
});
