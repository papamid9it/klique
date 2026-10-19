import { readJson, readQuery, created, withApi } from "./api";
import { resolveSpaceFor } from "../services/spaces.service";
import {
  addChannelMember,
  createCategory,
  createChannel,
  deleteCategory,
  deleteChannel,
  deleteMessage,
  editMessage,
  listChannelMembers,
  listChannels,
  listMessages,
  joinVoice,
  listPins,
  listStaff,
  markRead,
  mentionable,
  pinMessage,
  postMessage,
  reactToMessage,
  reactionsFor,
  removeChannelMember,
  renameCategory,
  searchSpaceMembers,
  updateChannel,
} from "../services/channels.service";
import { categorySchema, channelCreateSchema, channelMemberSchema, channelUpdateSchema, chatBodySchema, chatListQuery, editMessageSchema, memberSearchQuery, pinSchema, reactSchema, reactionIdsQuery } from "../validators/schemas";

/**
 * Handlers for chat channels of a community (`/api/communities/[slug]/…`) and of its groups
 * (`/api/communities/[slug]/groups/[subSlug]/…`): `subSlug` is simply absent for a community.
 * Authorization lives in policies + services.
 */
type Slug = { slug: string; subSlug?: string };
type Chan = Slug & { channelSlug: string };
type Msg = Chan & { messageId: string };
type Cat = Slug & { categoryId: string };

export const channelsList = withApi<Slug>({ auth: "optional" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return listChannels(viewer, space, access);
});

export const channelsCreate = withApi<Slug, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const input = await readJson(req, channelCreateSchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return created(await createChannel(viewer, space, access, input));
});

export const channelUpdate = withApi<Chan, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const patch = await readJson(req, channelUpdateSchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return updateChannel(viewer, space, access, params.channelSlug, patch);
});

export const channelDelete = withApi<Chan, "required">({ auth: "required" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return deleteChannel(viewer, space, access, params.channelSlug);
});

export const messagesList = withApi<Chan>({ auth: "optional", limit: { name: "chat-read", max: 240, windowMs: 60_000 } }, async ({ req, params, viewer }) => {
  const q = readQuery(req, chatListQuery);
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return listMessages(viewer, space, access, params.channelSlug, q);
});

export const messagePost = withApi<Chan, "required">({ auth: "required", limit: { name: "chat-write", max: 90, windowMs: 60_000 } }, async ({ req, params, viewer }) => {
  const input = await readJson(req, chatBodySchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return created(await postMessage(viewer, space, access, params.channelSlug, input));
});

export const messageEdit = withApi<Msg, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { body } = await readJson(req, editMessageSchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return editMessage(viewer, space, access, params.channelSlug, params.messageId, body);
});

export const messagePin = withApi<Msg, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { pinned } = await readJson(req, pinSchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return pinMessage(viewer, space, access, params.channelSlug, params.messageId, pinned);
});

export const voiceJoin = withApi<Chan, "required">({ auth: "required" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return joinVoice(viewer, space, access, params.channelSlug);
});

export const pinsList = withApi<Chan>({ auth: "optional" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return listPins(viewer, space, access, params.channelSlug);
});

export const messageDelete = withApi<Msg, "required">({ auth: "required" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return deleteMessage(viewer, space, access, params.channelSlug, params.messageId);
});

export const channelRead = withApi<Chan, "required">({ auth: "required" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return markRead(viewer, space, access, params.channelSlug);
});

export const categoryCreate = withApi<Slug, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const input = await readJson(req, categorySchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return created(await createCategory(space, access, input));
});

export const categoryRename = withApi<Cat, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const input = await readJson(req, categorySchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return renameCategory(space, access, params.categoryId, input);
});

export const categoryDelete = withApi<Cat, "required">({ auth: "required" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return deleteCategory(space, access, params.categoryId);
});

export const staffList = withApi<Slug>({ auth: "optional" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return listStaff(space, access);
});

type Who = Chan & { userId: string };

export const channelMembersList = withApi<Chan, "required">({ auth: "required" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return listChannelMembers(viewer, space, access, params.channelSlug);
});

export const channelMemberAdd = withApi<Chan, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { userId } = await readJson(req, channelMemberSchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return created(await addChannelMember(viewer, space, access, params.channelSlug, userId));
});

export const channelMemberRemove = withApi<Who, "required">({ auth: "required" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return removeChannelMember(viewer, space, access, params.channelSlug, params.userId);
});

export const mentionableList = withApi<Chan, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { q } = readQuery(req, memberSearchQuery);
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return mentionable(viewer, space, access, params.channelSlug, q);
});

export const memberSearch = withApi<Slug, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { q } = readQuery(req, memberSearchQuery);
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return searchSpaceMembers(viewer, space, access, q);
});

export const messageReact = withApi<Msg, "required">({ auth: "required", limit: { name: "chat-react", max: 90, windowMs: 60_000 } }, async ({ req, params, viewer }) => {
  const { kind } = await readJson(req, reactSchema);
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return reactToMessage(viewer, space, access, params.channelSlug, params.messageId, kind);
});

export const reactionsGet = withApi<Chan>({ auth: "optional", limit: { name: "chat-read", max: 240, windowMs: 60_000 } }, async ({ req, params, viewer }) => {
  const { ids } = readQuery(req, reactionIdsQuery);
  const { space, access } = await resolveSpaceFor(viewer, params.slug, params.subSlug);
  return reactionsFor(viewer, space, access, params.channelSlug, ids);
});
