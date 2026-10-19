import type { z } from "zod";
import type { SubcommunityDTO } from "@/lib/types";
import { forbidden } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import type { ICommunity } from "../models/Community";
import { Event } from "../models/Event";
import { Membership, type IMembership } from "../models/Membership";
import { Subcommunity, type ISubcommunity } from "../models/Subcommunity";
import type { IUser } from "../models/User";
import { canCreateGroup, spaceAccess, subAccessFrom } from "../policies/access";
import { ensureDefaultGroupChannels } from "./channels.service";
import { toSubcommunity } from "../serializers";
import type { subCreateSchema, subUpdateSchema } from "../validators/schemas";
import { purgeSpaceData, recountMembers, sid, uniqueSubSlug } from "./helpers";
import { resolveSpace, resolveSpaceFor } from "./spaces.service";

/**
 * The groups of `community` that `viewer` is allowed to know about, with their access.
 *  - "parent" groups: visible to members of the parent community
 *  - private groups: visible to their own members (and, redacted, to parent moderators)
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
    .map((s) => ({ sub: s, access: subAccessFrom(s, parentM, bySub.get(sid(s._id)) ?? null) }))
    .filter(({ access }) => access.canView || access.canModerate);
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
  // Locked (parent-visibility, viewer outside the parent) and moderator views are redacted by the serializer.
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
    visibility: input.visibility,
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
  if (patch.visibility && patch.visibility !== space.sub!.visibility && access.role !== "owner") {
    throw forbidden("Only the group's owner can change its visibility.");
  }

  const set: Partial<ISubcommunity> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.visibility !== undefined) set.visibility = patch.visibility;
  await Subcommunity.updateOne({ _id: space.sub!._id }, set);

  if (patch.visibility && patch.visibility !== space.sub!.visibility) {
    await Event.updateMany(
      { subcommunityId: space.sub!._id },
      { audience: patch.visibility === "private" ? "subcommunity" : "community" },
    );
  }
  return getSubcommunity(viewer, slug, subSlug);
}

export async function deleteSubcommunity(viewer: IUser, slug: string, subSlug: string) {
  const { space, access } = await resolveSpaceFor(viewer, slug, subSlug);
  // The group's owner, or an owner/admin of the parent community (moderation).
  if (access.role !== "owner" && !access.canModerate) throw forbidden("Only the group's owner or a community admin can delete it.");
  await purgeSpaceData(space.community._id, space.sub!._id);
  await Subcommunity.deleteOne({ _id: space.sub!._id });
  return { deleted: true };
}
