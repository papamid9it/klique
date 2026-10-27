import { parseScope, scopeFilter } from "@/lib/places";
import type { Types } from "mongoose";
import type { z } from "zod";
import type { Paginated, ProfileView, UserBrief, UserMe } from "@/lib/types";
import { ApiError, forbidden, notFound } from "../http/errors";
import { Community, type ICommunity } from "../models/Community";
import { Membership } from "../models/Membership";
import { Rsvp } from "../models/Rsvp";
import { User, type IUser } from "../models/User";
import { isAdult } from "../policies/adult";
import { toBrief, toCommunityCards, toMe, toProfile } from "../serializers";
import { deleteUploads } from "./media.service";
import { sameFile } from "@/lib/focal";
import type { peopleQuery, profileUpdateSchema } from "../validators/schemas";
import { blockedByMe, blockedEitherWay, hiddenUserIds, shareCommunity } from "./blocks";
import { assertPlace, escapeRegex, sid } from "./helpers";
import { hostedEventsOf, upcomingRsvpEventsOf } from "./events.service";
import { friendStatus, mutualFriends } from "./friends.service";
import { messagingEligibility, unreadTotal } from "./messaging.service";
import { unreadNotificationCount } from "./notifications.service";
import { assertEffectAvailable } from "./effects.service";
import { assertCanWear } from "./wallet.service";

export async function getMe(viewer: IUser): Promise<UserMe> {
  const [dms, bell] = await Promise.all([unreadTotal(viewer._id), unreadNotificationCount(viewer._id)]);
  return toMe(viewer, dms, bell);
}

export async function updateMe(viewer: IUser, patch: z.infer<typeof profileUpdateSchema>): Promise<UserMe> {
  const set: Partial<IUser> = {};
  if (patch.displayName !== undefined) set.displayName = patch.displayName;
  if (patch.bio !== undefined) set.bio = patch.bio;
  if (patch.pronouns !== undefined) set.pronouns = patch.pronouns;
  if (patch.presence !== undefined) set.presence = patch.presence as IUser["presence"];
  assertPlace(patch, false);
  if (patch.country !== undefined) set.country = patch.country;
  if (patch.region !== undefined) set.region = patch.region;
  if (patch.city !== undefined) set.city = patch.city;
  if (patch.neighborhood !== undefined) set.neighborhood = patch.neighborhood;
  if (patch.interests !== undefined) set.interests = patch.interests as IUser["interests"];
  // date of birth: once; after that only Klique (an admin) changes it
  if (patch.dob !== undefined && patch.dob !== (viewer.dob ? viewer.dob.toISOString().slice(0, 10) : null)) {
    if (viewer.dobSetAt) throw forbidden("Your date of birth is set. Contact Klique support to change it.");
    set.dob = new Date(`${patch.dob}T00:00:00Z`);
    set.dobSetAt = new Date();
  }
  if (patch.avatarUrl !== undefined) set.avatarUrl = patch.avatarUrl || null;
  if (patch.bannerUrl !== undefined) set.bannerUrl = patch.bannerUrl || null;
  if (patch.bannerColor !== undefined) set.bannerColor = patch.bannerColor || null;
  // a profile effect has to be one people can pick; then designs cost Hype: putting on one you haven't unlocked
  // (an animated picture included) is refused
  if (patch.profileEffect && patch.profileEffect !== viewer.profileEffect) await assertEffectAvailable(patch.profileEffect);
  await assertCanWear(viewer, patch);
  if (patch.avatarFrame !== undefined) set.avatarFrame = patch.avatarFrame || null;
  if (patch.nameEffect !== undefined) set.nameEffect = patch.nameEffect || null;
  if (patch.profileTheme !== undefined) set.profileTheme = patch.profileTheme ? { primary: patch.profileTheme.primary.toLowerCase(), accent: patch.profileTheme.accent.toLowerCase() } : null;
  if (patch.profileEffect !== undefined) set.profileEffect = patch.profileEffect || null;
  if (patch.mood !== undefined) set.mood = patch.mood as IUser["mood"];
  if (patch.profileVisibility !== undefined) set.profileVisibility = patch.profileVisibility as IUser["profileVisibility"];
  if (patch.attendancePublic !== undefined) set.attendancePublic = patch.attendancePublic;
  if (patch.dmPolicy !== undefined) set.dmPolicy = patch.dmPolicy as IUser["dmPolicy"];

  const updated = await User.findByIdAndUpdate(viewer._id, set, { returnDocument: "after", runValidators: true }).lean<IUser>();
  if (!updated) throw notFound("We couldn't find your account.");
  // a replaced or removed picture/banner is gone for good: clear the old file out of storage
  deleteUploads([
    // (moving a picture in its frame only changes the position saved on its link: same file, nothing to delete)
    viewer.avatarUrl && !sameFile(viewer.avatarUrl, updated.avatarUrl) ? viewer.avatarUrl : null,
    viewer.bannerUrl && !sameFile(viewer.bannerUrl, updated.bannerUrl) ? viewer.bannerUrl : null,
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
      profile: { ...toBrief(user), bannerUrl: user.bannerUrl ?? null, bannerColor: user.bannerColor ?? null, bio: "", region: "", neighborhood: "", interests: [], joinedAt: user.createdAt.toISOString(), points: user.points ?? 0, pronouns: user.pronouns ?? "", presence: user.presence ?? "online", profileTheme: null, profileEffect: null },
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
  // Someone's membership of a PRIVATE community is only visible to fellow members (and themselves); an 18+ one
  // only to themselves
  const self = !!viewer && sid(viewer._id) === sid(user._id);
  const communities = cards.filter((c) => (c.privacy === "public" || c.viewer.isMember) && (!c.adult || self));

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
    .select("handle displayName avatarUrl avatarFrame nameEffect country city")
    .lean<IUser[]>();
  return { items: rows.slice(0, size).map(toBrief), page: q.page, hasMore: rows.length > size };
}

/** "I'm 18 or older", once, before first entering an 18+ community (policies/adult). Needs an 18+ date of birth. */
export async function confirmAdult(viewer: IUser): Promise<UserMe> {
  if (!viewer.dob) throw new ApiError(422, "Add your date of birth first.", { errors: { dob: "Add your date of birth" } });
  if (!isAdult(viewer)) throw forbidden("You need to be 18 or older.");
  if (!viewer.adultConfirmedAt) await User.updateOne({ _id: viewer._id }, { $set: { adultConfirmedAt: new Date() } });
  return getMe((await User.findById(viewer._id).lean<IUser>())!);
}

/**
 * Show explicit content (policies/adult): off by default. On needs an 18+ date of birth and the agreement ("I'm 18
 * or older and I choose to see explicit content"), and is stored with when they agreed. Phone apps can only switch
 * it off (app store rules): `fromApp` refuses on, pointing to the website.
 */
export async function setExplicit(viewer: IUser, on: boolean, agree: boolean, fromApp: boolean): Promise<UserMe> {
  if (on) {
    if (fromApp) throw forbidden("Turn this on at klique on the web. In the app you can only turn it off.");
    if (!viewer.dob) throw new ApiError(422, "Add your date of birth first.", { errors: { dob: "Add your date of birth" } });
    if (!isAdult(viewer)) throw forbidden("You need to be 18 or older.");
    if (!agree) throw new ApiError(422, "Agree to the terms to turn this on.", { errors: { agree: "Required" } });
    const now = new Date();
    await User.updateOne({ _id: viewer._id }, { $set: { explicitOptInAt: now, ...(viewer.adultConfirmedAt ? {} : { adultConfirmedAt: now }) } });
  } else {
    await User.updateOne({ _id: viewer._id }, { $set: { explicitOptInAt: null } });
  }
  return getMe((await User.findById(viewer._id).lean<IUser>())!);
}
