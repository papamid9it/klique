import type { z } from "zod";
import type { SubcommunityDTO, UserBrief } from "@/lib/types";
import { LIMITS } from "@/lib/constants";
import { ApiError, badRequest, forbidden } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import type { ICommunity } from "../models/Community";
import { Membership, type IMembership } from "../models/Membership";
import { Subcommunity, type ISubcommunity } from "../models/Subcommunity";
import { User, type IUser } from "../models/User";
import { canCreateGroup, spaceAccess, subAccessFrom } from "../policies/access";
import { isSiteAdmin } from "../policies/hosting";
import { ensureDefaultGroupChannels } from "./channels.service";
import { toBrief, toSubcommunity } from "../serializers";
import { hiddenUserIds } from "./blocks";
import { notify } from "./push.service";
import type { subCreateSchema, subUpdateSchema } from "../validators/schemas";
import { escapeRegex, purgeSpaceData, recountMembers, sid, uniqueSubSlug } from "./helpers";
import { resolveSpace, resolveSpaceFor } from "./spaces.service";

/**
 * The groups of `community` that `viewer` may see, with their access. Every group is private: you see the
 * groups you're in; the community's owner and site admins see them all.
 */
async function visibleSubs(viewer: IUser | null, community: ICommunity) {
  const subs = await Subcommunity.find({ communityId: community._id })
    .sort({ memberCount: -1, createdAt: 1 })
    .lean<ISubcommunity[]>();
  if (!subs.length || !viewer) return [];

  const memberships = await Membership.find({ userId: viewer._id, communityId: community._id }).lean<IMembership[]>();
  const parentM = memberships.find((m) => !m.subcommunityId) ?? null;
  const bySub = new Map(memberships.filter((m) => m.subcommunityId).map((m) => [sid(m.subcommunityId!), m]));

  return subs
    .map((s) => ({ sub: s, access: subAccessFrom(s, parentM, bySub.get(sid(s._id)) ?? null, isSiteAdmin(viewer)) }))
    .filter(({ access }) => access.canView);
}

export async function countVisibleSubs(viewer: IUser | null, community: ICommunity): Promise<number> {
  return (await visibleSubs(viewer, community)).length;
}

export async function listSubcommunities(viewer: IUser | null, slug: string): Promise<SubcommunityDTO[]> {
  const space = await resolveSpace(slug);
  const parentAccess = await spaceAccess(space, viewer);
  if (!parentAccess.canView) throw forbidden("Join this community to see its groups.");

  const rows = await visibleSubs(viewer, space.community);
  return rows.map(({ sub, access }) => toSubcommunity(sub, space.community, access));
}

export async function getSubcommunity(viewer: IUser | null, slug: string, subSlug: string): Promise<SubcommunityDTO> {
  const { space, access } = await resolveSpaceFor(viewer, slug, subSlug);
  return toSubcommunity(space.sub!, space.community, access);
}

export async function createSubcommunity(
  viewer: IUser,
  slug: string,
  input: z.infer<typeof subCreateSchema>,
): Promise<SubcommunityDTO> {
  const space = await resolveSpace(slug);
  const access = await spaceAccess(space, viewer);

  if (!access.isMember) throw forbidden("Join this community to start a group inside it.");
  if (!canCreateGroup(space.community, access)) {
    throw forbidden(space.community.groupPolicy === "off" ? "This community doesn't use groups." : "Only the owners and admins of this community can start groups.");
  }
  rateLimit(`sub-create:${sid(viewer._id)}`, 8, 24 * 60 * 60 * 1000);

  const subSlug = await uniqueSubSlug(space.community._id, input.name);
  const doc = await Subcommunity.create({
    communityId: space.community._id,
    slug: subSlug,
    name: input.name,
    description: input.description,
    visibility: "private",
    ownerId: viewer._id,
  });
  await Membership.create({ userId: viewer._id, communityId: space.community._id, subcommunityId: doc._id, role: "owner" });
  await recountMembers(space.community._id, doc._id);
  await ensureDefaultGroupChannels(doc._id, space.community._id, viewer._id);
  return getSubcommunity(viewer, slug, subSlug);
}

export async function updateSubcommunity(
  viewer: IUser,
  slug: string,
  subSlug: string,
  patch: z.infer<typeof subUpdateSchema>,
): Promise<SubcommunityDTO> {
  const { space, access } = await resolveSpaceFor(viewer, slug, subSlug);
  if (!access.canManage) throw forbidden("Only the group's owners and admins can edit it.");

  const set: Partial<ISubcommunity> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.description !== undefined) set.description = patch.description;
  await Subcommunity.updateOne({ _id: space.sub!._id }, set);
  return getSubcommunity(viewer, slug, subSlug);
}

export async function deleteSubcommunity(viewer: IUser, slug: string, subSlug: string) {
  const { space, access } = await resolveSpaceFor(viewer, slug, subSlug);
  // The group's owner, the community's owner, or a site admin.
  if (access.role !== "owner" && !access.canModerate) throw forbidden("Only the group's owner or the community's owner can delete it.");
  await purgeSpaceData(space.community._id, space.sub!._id);
  await Subcommunity.deleteOne({ _id: space.sub!._id });
  return { deleted: true };
}

/* ----------------------------- adding people ----------------------------- */

async function managedGroup(viewer: IUser, slug: string, subSlug: string) {
  const { space, access } = await resolveSpaceFor(viewer, slug, subSlug);
  if (!access.canManage) throw forbidden("Only the group's owners and admins can add people.");
  return space;
}

/** People in the community who could be added to the group (not in it yet), matching a name or @handle. */
export async function addableMembers(viewer: IUser, slug: string, subSlug: string, q: string): Promise<UserBrief[]> {
  const space = await managedGroup(viewer, slug, subSlug);
  rateLimit(`group-add-search:${sid(viewer._id)}`, 120, 60_000);
  const inGroup = await Membership.find({ communityId: space.community._id, subcommunityId: space.sub!._id, status: "active" }).select("userId").lean<Pick<IMembership, "userId">[]>();
  const hidden = await hiddenUserIds(viewer._id);
  const exclude = [...inGroup.map((m) => m.userId), ...hidden];
  const parentIds = (
    await Membership.find({ communityId: space.community._id, subcommunityId: null, status: "active", userId: { $nin: exclude } })
      .select("userId")
      .limit(2000)
      .lean<Pick<IMembership, "userId">[]>()
  ).map((m) => m.userId);
  const text = q.trim().replace(/^@/, "");
  const rx = text ? new RegExp(escapeRegex(text), "i") : null;
  const users = await User.find({ _id: { $in: parentIds }, ...(rx ? { $or: [{ handle: rx }, { displayName: rx }] } : {}) })
    .select("handle displayName avatarUrl avatarFrame nameEffect country city")
    .sort({ displayName: 1 })
    .limit(20)
    .lean<IUser[]>();
  return users.map(toBrief);
}

/** Add community members to the group. Groups hold at most LIMITS.groupMembers people. */
export async function addGroupMembers(viewer: IUser, slug: string, subSlug: string, userIds: string[]) {
  const space = await managedGroup(viewer, slug, subSlug);
  const ids = [...new Set(userIds)];
  if (!ids.length) throw badRequest("Pick at least one person to add.");
  // only people in the community; someone banned from the group can be let back in by adding them
  const parents = await Membership.find({ communityId: space.community._id, subcommunityId: null, status: "active", userId: { $in: ids } }).select("userId").lean<Pick<IMembership, "userId">[]>();
  if (parents.length !== ids.length) throw badRequest(`Only members of ${space.community.name} can be added to its groups.`);
  const already = await Membership.find({ communityId: space.community._id, subcommunityId: space.sub!._id, status: "active", userId: { $in: ids } }).select("userId").lean<Pick<IMembership, "userId">[]>();
  const fresh = ids.filter((id) => !already.some((m) => sid(m.userId) === id));
  const count = await Membership.countDocuments({ communityId: space.community._id, subcommunityId: space.sub!._id, status: "active" });
  const room = LIMITS.groupMembers - count;
  if (fresh.length > room) {
    throw new ApiError(409, room <= 0 ? `This group is full (${LIMITS.groupMembers} people).` : `This group has room for ${room} more ${room === 1 ? "person" : "people"} (${LIMITS.groupMembers} max).`, { code: "group_full" });
  }
  for (const id of fresh) {
    await Membership.updateOne(
      { userId: id, communityId: space.community._id, subcommunityId: space.sub!._id },
      { $setOnInsert: { role: "member" }, $set: { status: "active" } },
      { upsert: true },
    );
  }
  await recountMembers(space.community._id, space.sub!._id);
  if (fresh.length) notify(fresh, { title: space.sub!.name, body: `${viewer.displayName} added you to this group in ${space.community.name}.`, data: { type: "group", communitySlug: space.community.slug, subSlug: space.sub!.slug } });
  return { added: fresh.length, memberCount: count + fresh.length };
}
