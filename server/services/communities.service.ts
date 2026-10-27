import { parseScope, scopeFilter } from "@/lib/places";
import { forgetAdultCommunities, isAdult } from "../policies/adult";
import { deleteUploads } from "./media.service";
import { sameFile } from "@/lib/focal";
import { assertVerified } from "./account.service";
import type { QueryFilter, Types } from "mongoose";
import type { z } from "zod";
import type { CommunityCardDTO, CommunityDTO, Paginated } from "@/lib/types";
import { ApiError, forbidden, notFound, unauthorized } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import { Community, type ICommunity } from "../models/Community";
import { Event } from "../models/Event";
import { Membership } from "../models/Membership";
import { Subcommunity, type ISubcommunity } from "../models/Subcommunity";
import { User, type IUser } from "../models/User";
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
  // an 18+ community: under-18s never learn it exists; anyone else not cleared yet gets a page that asks (ageGate)
  if (access.adultGate === "under_18") throw notFound("We couldn't find that community.");

  let subcommunityCount: number | null = null;
  let upcomingEventCount: number | null = null;
  if (access.canView) {
    [subcommunityCount, upcomingEventCount] = await Promise.all([
      countVisibleSubs(viewer, space.community),
      Event.countDocuments({
        communityId: space.community._id,
        subcommunityId: null,
        cancelled: false,
        review: null,
        startsAt: { $gte: new Date() },
      }),
    ]);
  }
  return toCommunityDetail(space.community, access, { subcommunityCount, upcomingEventCount });
}

/**
 * The 18+ and explicit flags (policies/adult): 18+ only on a private community, explicit only on an 18+ one, and
 * only set by someone who could enter it themselves (so they're never locked out of their own community).
 */
async function assertAdultFlags(viewer: IUser, next: { privacy: string; adult: boolean; explicit: boolean }) {
  if (next.explicit && !next.adult) throw new ApiError(422, "Only an 18+ community can allow explicit content.", { errors: { explicit: "Make it 18+ first" } });
  if (next.adult && next.privacy !== "private") throw new ApiError(422, "Only a private community can be 18+.", { errors: { adult: "Make it private first" } });
  if (!next.adult) return;
  if (!viewer.dob) throw new ApiError(422, "Add your date of birth in Settings first: only people 18 and over can run an 18+ community.", { errors: { adult: "Add your date of birth first" } });
  if (!isAdult(viewer)) throw forbidden("Only people 18 and over can run an 18+ community.");
  if (next.explicit && !viewer.explicitOptInAt) throw new ApiError(422, "Turn on Show explicit content in Settings first.", { errors: { explicit: "Turn on Show explicit content first" } });
  // marking it 18+ is their own "I'm 18 or older"
  if (!viewer.adultConfirmedAt) await User.updateOne({ _id: viewer._id }, { $set: { adultConfirmedAt: new Date() } });
}

export async function createCommunity(viewer: IUser, input: z.infer<typeof communityCreateSchema>): Promise<CommunityDTO> {
  assertVerified(viewer);
  assertPlace(input, true);
  await assertAdultFlags(viewer, { privacy: input.privacy, adult: input.adult, explicit: input.explicit });
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
    feedPolicy: input.feedPolicy,
    coverImage: input.coverImage || null,
    adult: input.adult,
    explicit: input.adult && input.explicit,
    ownerId: viewer._id,
  });
  if (input.adult) forgetAdultCommunities();
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
  if (patch.coverImage) set.coverImage = patch.coverImage;
  // a cover can be replaced, not taken away (older communities that never had one can still save)
  else if (patch.coverImage !== undefined && space.community.coverImage) throw new ApiError(422, "A community needs a cover image. Upload a new one to replace it.", { errors: { coverImage: "Upload a new one to replace it" } });
  if (patch.privacy !== undefined) set.privacy = patch.privacy;
  if (patch.groupPolicy !== undefined) set.groupPolicy = patch.groupPolicy;
  if (patch.feedPolicy !== undefined) set.feedPolicy = patch.feedPolicy;
  if (patch.memberEvents !== undefined) set.memberEvents = patch.memberEvents;
  // 18+ and explicit: checked against what the community will be after this change
  if (patch.adult !== undefined || patch.explicit !== undefined || patch.privacy !== undefined) {
    const next = { privacy: patch.privacy ?? space.community.privacy, adult: patch.adult ?? !!space.community.adult, explicit: patch.explicit ?? !!space.community.explicit };
    if (!next.adult) next.explicit = false;
    if (next.adult !== !!space.community.adult || next.explicit !== !!space.community.explicit || next.privacy !== space.community.privacy) {
      if (access.role !== "owner" && (next.adult !== !!space.community.adult || next.explicit !== !!space.community.explicit)) throw forbidden("Only the owner can change whether this community is 18+.");
      await assertAdultFlags(viewer, next);
      set.adult = next.adult;
      set.explicit = next.explicit;
      forgetAdultCommunities();
    }
  }
  // the Klique community never asks for points
  if (!space.community.official) {
    if (patch.minPointsJoin !== undefined) set.minPointsJoin = patch.minPointsJoin;
    if (patch.minPointsPost !== undefined) set.minPointsPost = patch.minPointsPost;
  }

  await Community.updateOne({ _id: space.community._id }, set);
  if (set.coverImage !== undefined && space.community.coverImage && !sameFile(space.community.coverImage, set.coverImage)) deleteUploads([space.community.coverImage]);

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
  if (space.community.official) throw forbidden("Official Klique communities can't be deleted: Klique's own events live there.");
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
