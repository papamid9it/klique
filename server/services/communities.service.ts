import { searchFilter } from "./search-terms";
import { audienceRefusal } from "@/lib/constants";
import { parseScope, scopeFilter } from "@/lib/places";
import { forgetAdultCommunities, isAdult } from "../policies/adult";
import { deleteUploads } from "./media.service";
import { sameFile } from "@/lib/focal";
import { assertVerified } from "./account.service";
import { Types, type QueryFilter } from "mongoose";
import { remember } from "../cache";
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
import { assertPlace, PAGE_SIZE, purgeSpaceData, recountMembers, sid, uniqueCommunitySlug } from "./helpers";
import { resolveSpace } from "./spaces.service";
import { countVisibleSubs } from "./subcommunities.service";
import { assertCanCreateCommunity } from "./space-limits";

type ListQuery = z.infer<typeof communityListQuery>;

/** Lite and Pro owners' communities count as this many members ahead, so only a much bigger community stays above. */
const COMMUNITY_BOOST = 500;
/** And verified ones (checked by hand by the Klique team) this many: they rank above what's only paid for. */
const VERIFIED_BOOST = 2000;

/** Everyone on Lite or Pro now (checked at most every 5 minutes). */
const paidOwnerIds = async () =>
  (await remember("paid-owners", "all", 300, async () => (await User.find({ plan: { $in: ["lite", "pro"] }, planUntil: { $gt: new Date() } }).select("_id").limit(50_000).lean<{ _id: Types.ObjectId }[]>()).map((u) => String(u._id)))).map((id: string) => new Types.ObjectId(id));

/** Adds `rank`, for browsing and search: members, plus a lift for verified communities and for Lite and Pro owners'. */
export async function communityRankStage() {
  const paid = await paidOwnerIds();
  return {
    $addFields: {
      rank: {
        $add: ["$memberCount", { $cond: [{ $in: ["$ownerId", paid] }, COMMUNITY_BOOST, 0] }, { $cond: [{ $or: [{ $eq: ["$verified", true] }, { $eq: ["$official", true] }] }, VERIFIED_BOOST, 0] }],
      },
    },
  };
}

export async function listCommunities(viewer: IUser | null, q: ListQuery): Promise<Paginated<CommunityCardDTO>> {
  let filter: QueryFilter<ICommunity>;
  // what this person may be shown at all: kept apart so the search and filters below can never replace it
  let allowed: QueryFilter<ICommunity> = {};

  if (q.scope === "joined") {
    if (!viewer) throw unauthorized();
    const ms = await Membership.find({ userId: viewer._id, status: "active", subcommunityId: null })
      .select("communityId")
      .lean<{ communityId: Types.ObjectId }[]>();
    filter = { _id: { $in: ms.map((m) => m.communityId) } };
  } else {
    // Public discovery NEVER includes private communities, whoever is asking.
    // The one exception: a women-only or men-only community shows to the people it's for, or nobody could find it.
    // They only see its locked card, and an 18+ one stays out.
    filter = {};
    const mine = viewer?.gender === "woman" ? "women" : viewer?.gender === "man" ? "men" : null;
    allowed = mine ? { $or: [{ privacy: "public" }, { privacy: "private", audience: mine, adult: { $ne: true } }] } : { privacy: "public" };
  }

  const where = parseScope(q.where);
  if (where) Object.assign(filter, scopeFilter(where));
  if (q.interest) filter.interest = q.interest;
  if (q.q) {
    Object.assign(filter, searchFilter(q.q, ["name", "description", "neighborhood", "city", "interest"]));
  }
  if (q.verified) filter.$or = [{ verified: true }, { official: true }];

  const rows = q.sort === "new" || q.scope === "joined"
    ? await Community.find({ $and: [allowed, filter] })
        .sort(q.sort === "new" ? { createdAt: -1 } : { memberCount: -1, createdAt: -1 })
        .skip((q.page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE + 1)
        .lean<ICommunity[]>()
    : await Community.aggregate<ICommunity>([
        { $match: { $and: [allowed, filter] } },
        await communityRankStage(),
        { $sort: { rank: -1, createdAt: -1 } },
        { $skip: (q.page - 1) * PAGE_SIZE },
        { $limit: PAGE_SIZE + 1 },
      ]);

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
  const dto = await toCommunityDetail(space.community, access, { subcommunityCount, upcomingEventCount });
  // your own "Suppress @everyone and @here" here
  if (viewer && access.isMember) dto.suppressEveryone = !!(await Membership.findOne({ userId: viewer._id, communityId: space.community._id, subcommunityId: null }).select("suppressEveryone").lean<{ suppressEveryone?: boolean }>())?.suppressEveryone;
  return dto;
}

/** Your "Suppress @everyone and @here" in this community: those stop pinging you here (your @mentions still do). */
export async function setSuppressEveryone(viewer: IUser, slug: string, on: boolean) {
  const space = await resolveSpace(slug);
  const r = await Membership.updateOne({ userId: viewer._id, communityId: space.community._id, subcommunityId: null, status: "active" }, { $set: { suppressEveryone: on } });
  if (!r.matchedCount) throw notFound("Join first.");
  return { suppressEveryone: on };
}

/** Your own mute for a whole community: its chat stops notifying you, and its unread dot goes. */
export async function setCommunityMuted(viewer: IUser, slug: string, muted: boolean) {
  const space = await resolveSpace(slug);
  const r = await Membership.updateOne({ userId: viewer._id, communityId: space.community._id, subcommunityId: null, status: "active" }, { $set: { muted } });
  if (!r.matchedCount) throw notFound("Join first.");
  return { muted };
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
  if (input.audience !== "everyone") {
    if (input.privacy !== "private") throw new ApiError(422, "Women-only and men-only communities have to be private.", { code: "audience_private" });
    const refusal = audienceRefusal(input.audience, viewer.gender);
    if (refusal) throw forbidden(`Only ${input.audience} can start this kind of community. If that's you, set your gender in your profile settings first.`);
  }
  await assertCanCreateCommunity(viewer);
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
    audience: input.audience,
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
  if (patch.privacy === "public" && space.community.audience && space.community.audience !== "everyone") {
    throw new ApiError(422, "A women-only or men-only community has to stay private.", { code: "audience_private" });
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
  if (patch.membersMassMention !== undefined) set.membersMassMention = patch.membersMassMention;
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
