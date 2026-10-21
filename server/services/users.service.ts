import { parseScope, scopeFilter } from "@/lib/places";
import type { Types } from "mongoose";
import type { z } from "zod";
import type { Paginated, ProfileView, UserBrief, UserMe } from "@/lib/types";
import { notFound } from "../http/errors";
import { Community, type ICommunity } from "../models/Community";
import { Membership } from "../models/Membership";
import { Rsvp } from "../models/Rsvp";
import { User, type IUser } from "../models/User";
import { toBrief, toCommunityCards, toMe, toProfile } from "../serializers";
import { deleteUploads } from "./media.service";
import type { peopleQuery, profileUpdateSchema } from "../validators/schemas";
import { blockedByMe, blockedEitherWay, hiddenUserIds, shareCommunity } from "./blocks";
import { assertPlace, escapeRegex, sid } from "./helpers";
import { hostedEventsOf, upcomingRsvpEventsOf } from "./events.service";
import { friendStatus, mutualFriends } from "./friends.service";
import { messagingEligibility, unreadTotal } from "./messaging.service";
import { unreadNotificationCount } from "./notifications.service";
import { assertCanWear } from "./points.service";

export async function getMe(viewer: IUser): Promise<UserMe> {
  const [dms, bell] = await Promise.all([unreadTotal(viewer._id), unreadNotificationCount(viewer._id)]);
  return toMe(viewer, dms, bell);
}

export async function updateMe(viewer: IUser, patch: z.infer<typeof profileUpdateSchema>): Promise<UserMe> {
  const set: Partial<IUser> = {};
  if (patch.displayName !== undefined) set.displayName = patch.displayName;
  if (patch.bio !== undefined) set.bio = patch.bio;
  assertPlace(patch, false);
  if (patch.country !== undefined) set.country = patch.country;
  if (patch.region !== undefined) set.region = patch.region;
  if (patch.city !== undefined) set.city = patch.city;
  if (patch.neighborhood !== undefined) set.neighborhood = patch.neighborhood;
  if (patch.interests !== undefined) set.interests = patch.interests as IUser["interests"];
  if (patch.avatarUrl !== undefined) set.avatarUrl = patch.avatarUrl || null;
  if (patch.bannerUrl !== undefined) set.bannerUrl = patch.bannerUrl || null;
  if (patch.bannerColor !== undefined) set.bannerColor = patch.bannerColor || null;
  // frames and name styles cost points: putting on one you haven't unlocked is refused
  if (patch.avatarFrame || patch.nameEffect) await assertCanWear(viewer, patch);
  if (patch.avatarFrame !== undefined) set.avatarFrame = patch.avatarFrame || null;
  if (patch.nameEffect !== undefined) set.nameEffect = patch.nameEffect || null;
  if (patch.mood !== undefined) set.mood = patch.mood as IUser["mood"];
  if (patch.profileVisibility !== undefined) set.profileVisibility = patch.profileVisibility as IUser["profileVisibility"];
  if (patch.attendancePublic !== undefined) set.attendancePublic = patch.attendancePublic;
  if (patch.dmPolicy !== undefined) set.dmPolicy = patch.dmPolicy as IUser["dmPolicy"];

  const updated = await User.findByIdAndUpdate(viewer._id, set, { new: true, runValidators: true }).lean<IUser>();
  if (!updated) throw notFound("We couldn't find your account.");
  // a replaced or removed picture/banner is gone for good: clear the old file out of storage
  deleteUploads([
    viewer.avatarUrl && viewer.avatarUrl !== updated.avatarUrl ? viewer.avatarUrl : null,
    viewer.bannerUrl && viewer.bannerUrl !== updated.bannerUrl ? viewer.bannerUrl : null,
  ]);
  return getMe(updated);
}

/**
 * A profile as `viewer` is allowed to see it. Privacy is decided here, on the
 * server — a hidden profile never leaves this function with its body attached.
 */
export async function getProfile(viewer: IUser | null, handle: string): Promise<ProfileView> {
  const user = await User.findOne({ handle: handle.toLowerCase() }).lean<IUser>();
  if (!user) throw notFound("We couldn't find that person.");

  const isSelf = !!viewer && sid(viewer._id) === sid(user._id);
  if (viewer && !isSelf && (await blockedEitherWay(viewer._id, user._id))) {
    // Blocks are mutual-invisible: neither side can open the other's profile.
    throw notFound("We couldn't find that person.");
  }

  let visible = true;
  let hiddenReason: ProfileView["hiddenReason"];
  if (!isSelf) {
    if (user.profileVisibility === "private") {
      visible = false;
      hiddenReason = "private";
    } else if (user.profileVisibility === "members") {
      if (!viewer || !(await shareCommunity(viewer._id, user._id))) {
        visible = false;
        hiddenReason = "members";
      }
    }
  }

  const [messaging, iBlocked, friendship, mutual] = await Promise.all([
    messagingEligibility(viewer, user),
    viewer && !isSelf ? blockedByMe(viewer._id, user._id) : Promise.resolve(false),
    viewer && !isSelf ? friendStatus(viewer._id, user._id) : Promise.resolve({ state: "none" as const }),
    viewer && !isSelf ? mutualFriends(viewer._id, user._id) : Promise.resolve([]),
  ]);

  const emptyStats = { communities: 0, hosted: 0, going: 0 };

  if (!visible) {
    return {
      // a hidden profile still wears its banner and name style; only the details stay private
      profile: { ...toBrief(user), bannerUrl: user.bannerUrl ?? null, bannerColor: user.bannerColor ?? null, bio: "", region: "", neighborhood: "", interests: [], joinedAt: user.createdAt.toISOString() },
      isSelf,
      visible: false,
      hiddenReason,
      communities: [],
      hostedEvents: [],
      upcomingEvents: [],
      attendanceHidden: false,
      stats: emptyStats,
      messaging,
      blockedByMe: iBlocked,
      friendship,
      mutualFriends: [],
    };
  }

  const memberships = await Membership.find({ userId: user._id, status: "active", subcommunityId: null })
    .sort({ createdAt: -1 })
    .select("communityId")
    .lean<{ communityId: Types.ObjectId }[]>();
  const communityRows = await Community.find({ _id: { $in: memberships.map((m) => m.communityId) } }).lean<ICommunity[]>();
  const cards = await toCommunityCards(communityRows, viewer);
  // Someone's membership of a PRIVATE community is only visible to fellow members (and themselves).
  const communities = cards.filter((c) => c.privacy === "public" || c.viewer.isMember);

  const attendanceShown = isSelf || user.attendancePublic;
  const [hostedEvents, upcomingEvents, goingCount] = await Promise.all([
    hostedEventsOf(viewer, user._id, 6),
    attendanceShown ? upcomingRsvpEventsOf(viewer, user._id, 8) : Promise.resolve([]),
    attendanceShown ? Rsvp.countDocuments({ userId: user._id, status: "going" }) : Promise.resolve(0),
  ]);

  return {
    profile: toProfile(user),
    isSelf,
    visible: true,
    communities,
    hostedEvents,
    upcomingEvents,
    attendanceHidden: !attendanceShown,
    stats: { communities: communities.length, hosted: hostedEvents.length, going: goingCount },
    messaging,
    blockedByMe: iBlocked,
    friendship,
    mutualFriends: mutual,
  };
}

/** People directory. Private profiles and blocked people never appear. */
export async function listPeople(viewer: IUser | null, q: z.infer<typeof peopleQuery>): Promise<Paginated<UserBrief>> {
  const size = 18;
  const hidden = await hiddenUserIds(viewer?._id ?? null);
  const filter: Record<string, unknown> = {
    profileVisibility: viewer ? { $ne: "private" } : "public",
    _id: { $nin: [...hidden, ...(viewer ? [viewer._id] : [])] },
  };
  const where = parseScope(q.where);
  if (where) Object.assign(filter, scopeFilter(where));
  if (q.interest) filter.interests = q.interest;
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), "i");
    filter.$or = [{ handle: rx }, { displayName: rx }];
  }
  const rows = await User.find(filter)
    .sort({ createdAt: -1 })
    .skip((q.page - 1) * size)
    .limit(size + 1)
    .select("handle displayName avatarUrl avatarFrame nameEffect rank country city")
    .lean<IUser[]>();
  return { items: rows.slice(0, size).map(toBrief), page: q.page, hasMore: rows.length > size };
}
