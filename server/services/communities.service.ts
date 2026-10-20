import { parseScope, scopeFilter } from "@/lib/places";
import { deleteUploads } from "./media.service";
import { assertVerified } from "./account.service";
import type { QueryFilter, Types } from "mongoose";
import type { z } from "zod";
import type { CommunityCardDTO, CommunityDTO, Paginated } from "@/lib/types";
import { forbidden, unauthorized } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import { Community, type ICommunity } from "../models/Community";
import { Event } from "../models/Event";
import { Membership } from "../models/Membership";
import { Subcommunity, type ISubcommunity } from "../models/Subcommunity";
import type { IUser } from "../models/User";
import { spaceAccess } from "../policies/access";
import { ensureDefaultChannels } from "./channels.service";
import { toCommunityCards, toCommunityDetail } from "../serializers";
import type { communityCreateSchema, communityListQuery, communityUpdateSchema } from "../validators/schemas";
import { assertPlace, escapeRegex, PAGE_SIZE, purgeSpaceData, recountMembers, sid, uniqueCommunitySlug } from "./helpers";
import { resolveSpace } from "./spaces.service";
import { countVisibleSubs } from "./subcommunities.service";

type ListQuery = z.infer<typeof communityListQuery>;

export async function listCommunities(viewer: IUser | null, q: ListQuery): Promise<Paginated<CommunityCardDTO>> {
  let filter: QueryFilter<ICommunity>;

  if (q.scope === "joined") {
    if (!viewer) throw unauthorized();
    const ms = await Membership.find({ userId: viewer._id, status: "active", subcommunityId: null })
      .select("communityId")
      .lean<{ communityId: Types.ObjectId }[]>();
    filter = { _id: { $in: ms.map((m) => m.communityId) } };
  } else {
    // Public discovery NEVER includes private communities, whoever is asking.
    filter = { privacy: "public" };
  }

  const where = parseScope(q.where);
  if (where) Object.assign(filter, scopeFilter(where));
  if (q.interest) filter.interest = q.interest;
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), "i");
    filter.$or = [{ name: rx }, { description: rx }, { neighborhood: rx }];
  }

  const rows = await Community.find(filter)
    .sort({ memberCount: -1, createdAt: -1 })
    .skip((q.page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE + 1)
    .lean<ICommunity[]>();

  return {
    items: await toCommunityCards(rows.slice(0, PAGE_SIZE), viewer),
    page: q.page,
    hasMore: rows.length > PAGE_SIZE,
  };
}

export async function getCommunity(viewer: IUser | null, slug: string): Promise<CommunityDTO> {
  const space = await resolveSpace(slug);
  const access = await spaceAccess(space, viewer);

  let subcommunityCount: number | null = null;
  let upcomingEventCount: number | null = null;
  if (access.canView) {
    [subcommunityCount, upcomingEventCount] = await Promise.all([
      countVisibleSubs(viewer, space.community),
      Event.countDocuments({
        communityId: space.community._id,
        subcommunityId: null,
        cancelled: false,
        startsAt: { $gte: new Date() },
      }),
    ]);
  }
  return toCommunityDetail(space.community, access, { subcommunityCount, upcomingEventCount });
}

export async function createCommunity(viewer: IUser, input: z.infer<typeof communityCreateSchema>): Promise<CommunityDTO> {
  assertVerified(viewer);
  assertPlace(input, true);
  rateLimit(`community-create:${sid(viewer._id)}`, 5, 24 * 60 * 60 * 1000);
  const slug = await uniqueCommunitySlug(input.name);
  const doc = await Community.create({
    slug,
    name: input.name,
    description: input.description,
    interest: input.interest,
    country: input.country,
    region: input.region,
    city: input.city,
    neighborhood: input.neighborhood,
    privacy: input.privacy,
    groupPolicy: input.groupPolicy,
    coverImage: input.coverImage || null,
    ownerId: viewer._id,
  });
  await Membership.create({ userId: viewer._id, communityId: doc._id, subcommunityId: null, role: "owner" });
  await recountMembers(doc._id, null);
  await ensureDefaultChannels(doc._id, viewer._id);
  return getCommunity(viewer, slug);
}

export async function updateCommunity(viewer: IUser, slug: string, patch: z.infer<typeof communityUpdateSchema>): Promise<CommunityDTO> {
  const space = await resolveSpace(slug);
  const access = await spaceAccess(space, viewer);
  if (!access.canManage) throw forbidden("Only owners and admins can edit this community.");
  if (patch.privacy && patch.privacy !== space.community.privacy && access.role !== "owner") {
    throw forbidden("Only the owner can change whether a community is public or private.");
  }

  const set: Partial<ICommunity> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.interest !== undefined) set.interest = patch.interest as ICommunity["interest"];
  assertPlace(patch, false);
  if (patch.country !== undefined) set.country = patch.country;
  if (patch.region !== undefined) set.region = patch.region;
  if (patch.city !== undefined) set.city = patch.city;
  if (patch.neighborhood !== undefined) set.neighborhood = patch.neighborhood;
  if (patch.coverImage !== undefined) set.coverImage = patch.coverImage || null;
  if (patch.privacy !== undefined) set.privacy = patch.privacy;
  if (patch.groupPolicy !== undefined) set.groupPolicy = patch.groupPolicy;

  await Community.updateOne({ _id: space.community._id }, set);
  if (set.coverImage !== undefined && space.community.coverImage && space.community.coverImage !== set.coverImage) deleteUploads([space.community.coverImage]);

  // Events hosted directly in this community inherit its privacy — keep them in sync.
  if (patch.privacy && patch.privacy !== space.community.privacy) {
    await Event.updateMany(
      { communityId: space.community._id, subcommunityId: null },
      { audience: patch.privacy === "public" ? "public" : "community" },
    );
  }
  return getCommunity(viewer, slug);
}

export async function deleteCommunity(viewer: IUser, slug: string) {
  const space = await resolveSpace(slug);
  const access = await spaceAccess(space, viewer);
  if (access.role !== "owner") throw forbidden("Only the owner can delete a community.");
  await purgeCommunity(space.community);
  return { deleted: true };
}

/** Delete a community with its groups and everything in them (no permission check: callers do that). */
export async function purgeCommunity(community: Pick<ICommunity, "_id" | "coverImage">) {
  const subs = await Subcommunity.find({ communityId: community._id }).select("_id").lean<Pick<ISubcommunity, "_id">[]>();
  await purgeSpaceData(community._id, null);
  for (const s of subs) await purgeSpaceData(community._id, s._id);
  await Subcommunity.deleteMany({ communityId: community._id });
  await Community.deleteOne({ _id: community._id });
  deleteUploads([community.coverImage]);
}
