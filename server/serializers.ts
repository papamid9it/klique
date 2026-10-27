import type { Types } from "mongoose";
import { isAdult } from "./policies/adult";
import { Payment } from "./models/Money";
import { canHostInSpace, isSiteAdmin } from "./policies/hosting";
import { isKlique } from "./services/klique-id";
import type {
  CommunityCardDTO,
  CommunityDTO,
  EventDTO,
  PostDTO,
  SubcommunityDTO,
  UserBrief,
  UserMe,
  UserProfile,
  ViewerAccess,
} from "@/lib/types";
import { Community, type ICommunity } from "./models/Community";
import { Crew } from "./models/Crew";
import type { IEvent } from "./models/Event";
import { Membership, type IMembership } from "./models/Membership";
import { MembershipRequest } from "./models/MembershipRequest";
import type { IPost } from "./models/Post";
import { Rsvp, SavedEvent } from "./models/Rsvp";
import { Subcommunity, type ISubcommunity } from "./models/Subcommunity";
import { User, type IUser } from "./models/User";
import { canCreateGroup, communityAccessFrom, gateOf, type SpaceAccess } from "./policies/access";

const sid = (id: Types.ObjectId | string) => String(id);

/** Strip the server-only access fields before sending to a client. */
export function viewerAccess(a: SpaceAccess): ViewerAccess {
  return {
    role: a.role,
    isMember: a.isMember,
    pendingRequest: a.pendingRequest,
    canManage: a.canManage,
    canView: a.canView,
    canPost: a.canPost,
    ...(a.canModerate ? { canModerate: true } : {}),
    ...(a.pointsToPost ? { pointsToPost: a.pointsToPost } : {}),
  };
}

/* ------------------------------- users ------------------------------ */

export const toBrief = (u: Pick<IUser, "_id" | "handle" | "displayName" | "avatarUrl" | "country" | "city"> & Partial<Pick<IUser, "avatarFrame" | "nameEffect">>): UserBrief => ({
  id: sid(u._id),
  handle: u.handle,
  displayName: u.displayName,
  avatarUrl: u.avatarUrl ?? null,
  avatarFrame: u.avatarFrame ?? null,
  nameEffect: u.nameEffect ?? null,
  country: u.country ?? "NG",
  city: u.city,
});

export const toProfile = (u: IUser): UserProfile => ({
  ...toBrief(u),
  bio: u.bio,
  bannerUrl: u.bannerUrl ?? null,
  bannerColor: u.bannerColor ?? null,
  region: u.region ?? "",
  neighborhood: u.neighborhood,
  interests: u.interests,
  joinedAt: u.createdAt.toISOString(),
  points: u.points ?? 0,
  pronouns: u.pronouns ?? "",
  presence: u.presence ?? "online",
  profileTheme: u.profileTheme ?? null,
  profileEffect: u.profileEffect ?? null,
});

export const toMe = (u: IUser, unreadMessages = 0, unreadNotifications = 0): UserMe => ({
  ...toProfile(u),
  email: u.email,
  emailVerified: !!u.emailVerifiedAt,
  onboarded: !!u.onboardedAt,
  hasPassword: u.hasPassword !== false,
  googleLinked: !!u.googleId,
  mood: u.mood,
  privacy: { profileVisibility: u.profileVisibility, attendancePublic: u.attendancePublic },
  dmPolicy: u.dmPolicy,
  unreadMessages,
  unreadNotifications,
  hype: u.hype ?? 0,
  isAdmin: isSiteAdmin(u),
  dob: u.dob ? u.dob.toISOString().slice(0, 10) : null,
  dobLocked: !!u.dobSetAt,
  isAdult: isAdult(u),
  adultConfirmed: !!u.adultConfirmedAt,
  explicitOnAt: u.explicitOptInAt ? u.explicitOptInAt.toISOString() : null,
});

const BRIEF_FIELDS = "handle displayName avatarUrl avatarFrame nameEffect country city";

export async function loadBriefs(ids: (Types.ObjectId | string)[]): Promise<Map<string, UserBrief>> {
  const unique = [...new Set(ids.map(sid))];
  if (!unique.length) return new Map();
  const users = await User.find({ _id: { $in: unique } })
    .select(BRIEF_FIELDS)
    .lean<IUser[]>();
  return new Map(users.map((u) => [sid(u._id), toBrief(u)]));
}

export const GHOST: UserBrief = { id: "", handle: "deleted", displayName: "Deleted user", avatarUrl: null, country: "NG", city: "lagos" };

/* ---------------------------- communities --------------------------- */

/**
 * Cards for a list of communities. Viewer access is resolved in two batched
 * queries rather than one per card.
 */
export async function toCommunityCards(
  communities: ICommunity[],
  viewer: IUser | null,
): Promise<CommunityCardDTO[]> {
  if (!communities.length) return [];
  const ids = communities.map((c) => c._id);

  let memberships = new Map<string, IMembership>();
  let pending = new Set<string>();
  if (viewer) {
    const [ms, reqs] = await Promise.all([
      Membership.find({ userId: viewer._id, communityId: { $in: ids }, subcommunityId: null }).lean<IMembership[]>(),
      MembershipRequest.find({
        userId: viewer._id,
        communityId: { $in: ids },
        subcommunityId: null,
        status: "pending",
      })
        .select("communityId")
        .lean<{ communityId: Types.ObjectId }[]>(),
    ]);
    memberships = new Map(ms.map((m) => [sid(m.communityId), m]));
    pending = new Set(reqs.map((r) => sid(r.communityId)));
  }

  return communities.map((c) => {
    const access = communityAccessFrom(c, memberships.get(sid(c._id)) ?? null, pending.has(sid(c._id)), gateOf(viewer));
    return communityCard(c, access);
  });
}

export function communityCard(c: ICommunity, access: SpaceAccess): CommunityCardDTO {
  const locked = c.privacy === "private" && !access.isMember;
  return {
    id: sid(c._id),
    slug: c.slug,
    name: c.name,
    official: !!c.official,
    description: locked ? "" : c.description,
    interest: c.interest,
    country: c.country ?? "NG",
    region: c.region ?? "",
    city: c.city,
    neighborhood: c.neighborhood,
    privacy: c.privacy,
    memberCount: locked ? null : c.memberCount,
    coverImage: locked ? null : c.coverImage,
    locked,
    // points minimums (never on Klique)
    minPointsJoin: c.official ? 0 : (c.minPointsJoin ?? 0),
    minPointsPost: c.official ? 0 : (c.minPointsPost ?? 0),
    adult: !!c.adult,
    explicit: !!c.explicit,
    viewer: viewerAccess(access),
  };
}

export async function toCommunityDetail(
  c: ICommunity,
  access: SpaceAccess,
  extra: { subcommunityCount: number | null; upcomingEventCount: number | null; inviteCode?: string },
): Promise<CommunityDTO> {
  const card = communityCard(c, access);
  const owner = card.locked ? null : (await loadBriefs([c.ownerId])).get(sid(c.ownerId)) ?? null;
  return {
    ...card,
    createdAt: c.createdAt.toISOString(),
    ageGate: access.adultGate ?? null,
    groupPolicy: c.groupPolicy ?? "admins",
    canCreateGroup: canCreateGroup(c, access),
    feedPolicy: c.feedPolicy ?? "off",
    // the Posts section: owners/admins when it's on, everyone who's a member when members may post
    canPostToFeed: (c.feedPolicy ?? "off") !== "off" && !access.banned && (access.canManage || (c.feedPolicy === "members" && access.canPost && !access.pointsToPost)),
    // Klique: only site admins post its events (its owner here; the others from Admin → Events)
    canHostEvents: isKlique(c) ? access.role === "owner" : canHostInSpace(access),
    memberEvents: c.memberEvents !== false,
    canSubmitEvents: !isKlique(c) && !canHostInSpace(access) && access.isMember && !access.banned && c.memberEvents !== false,
    owner,
    subcommunityCount: card.locked ? null : extra.subcommunityCount,
    upcomingEventCount: card.locked ? null : extra.upcomingEventCount,
    ...(extra.inviteCode ? { inviteCode: extra.inviteCode } : {}),
  };
}

export function toSubcommunity(
  s: ISubcommunity,
  parent: ICommunity,
  access: SpaceAccess,
  opts: { redact?: boolean } = {},
): SubcommunityDTO {
  // A parent moderator who is not a member sees only that the group exists.
  const redact = opts.redact ?? (!access.canView && access.canModerate);
  return {
    id: sid(s._id),
    slug: s.slug,
    name: s.name,
    description: redact ? "" : s.description,
    visibility: s.visibility,
    memberCount: redact ? null : s.memberCount,
    minPointsJoin: s.minPointsJoin ?? 0,
    minPointsPost: s.minPointsPost ?? 0,
    locked: redact,
    createdAt: s.createdAt.toISOString(),
    parent: {
      id: sid(parent._id),
      slug: parent.slug,
      name: parent.name,
      country: parent.country ?? "NG",
      region: parent.region ?? "",
      city: parent.city,
      interest: parent.interest,
      privacy: parent.privacy,
    },
    viewer: viewerAccess(access),
    ...(redact ? { moderationOnly: true } : {}),
  };
}

export async function toPosts(posts: IPost[], opts: { canDelete: (p: IPost) => boolean }): Promise<PostDTO[]> {
  const authors = await loadBriefs(posts.map((p) => p.authorId));
  return posts.map((p) => ({
    id: sid(p._id),
    body: p.body,
    imageUrl: p.imageUrl,
    pinned: p.pinned,
    createdAt: p.createdAt.toISOString(),
    author: authors.get(sid(p.authorId)) ?? GHOST,
    canDelete: opts.canDelete(p),
  }));
}

/* ------------------------------- events ----------------------------- */

const EVENT_FALLBACK_DURATION_MS = 3 * 60 * 60 * 1000;

export async function toEvents(events: IEvent[], viewer: IUser | null): Promise<EventDTO[]> {
  if (!events.length) return [];

  const hostIds = events.map((e) => e.hostId);
  const communityIds = events.map((e) => e.communityId).filter(Boolean) as Types.ObjectId[];
  const subIds = events.map((e) => e.subcommunityId).filter(Boolean) as Types.ObjectId[];
  const eventIds = events.map((e) => e._id);

  const [hosts, communities, subs, rsvps, saved, crewCounts, memberOf] = await Promise.all([
    loadBriefs(hostIds),
    communityIds.length
      ? Community.find({ _id: { $in: communityIds } })
          .select("slug name privacy official adult")
          .lean<Pick<ICommunity, "_id" | "slug" | "name" | "privacy" | "official" | "adult">[]>()
      : [],
    subIds.length
      ? Subcommunity.find({ _id: { $in: subIds } })
          .select("slug name")
          .lean<Pick<ISubcommunity, "_id" | "slug" | "name">[]>()
      : [],
    viewer
      ? Rsvp.find({ userId: viewer._id, eventId: { $in: eventIds } }).lean<{ eventId: Types.ObjectId; status: "going" | "interested" }[]>()
      : [],
    viewer ? SavedEvent.find({ userId: viewer._id, eventId: { $in: eventIds } }).select("eventId").lean<{ eventId: Types.ObjectId }[]>() : [],
    Crew.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { eventId: { $in: eventIds } } }, { $group: { _id: "$eventId", n: { $sum: 1 } } }]),
    viewer && communityIds.length
      ? Membership.find({ userId: viewer._id, communityId: { $in: communityIds }, subcommunityId: null, status: "active" }).select("communityId").lean<{ communityId: Types.ObjectId }[]>()
      : [],
  ]);
  const memberSet = new Set(memberOf.map((m) => sid(m.communityId)));
  const crewMap = new Map(crewCounts.map((c) => [sid(c._id), c.n]));

  const communityMap = new Map(communities.map((c) => [sid(c._id), c]));
  const subMap = new Map(subs.map((s) => [sid(s._id), s]));
  const rsvpMap = new Map(rsvps.map((r) => [sid(r.eventId), r.status]));
  const savedSet = new Set(saved.map((s) => sid(s.eventId)));
  const now = Date.now();

  // chipping in (lib/money): what each has raised, the viewer's units, and whether it's all been paid out
  const chipIn = events.filter((e) => e.contribution).map((e) => e._id);
  const [raisedRows, mineRows] = chipIn.length
    ? await Promise.all([
        Payment.aggregate<{ _id: Types.ObjectId; raised: number; people: Types.ObjectId[]; unpaid: number }>([
          { $match: { eventId: { $in: chipIn }, status: "paid" } },
          { $lookup: { from: "payouts", localField: "payoutId", foreignField: "_id", as: "po" } },
          { $group: { _id: "$eventId", raised: { $sum: "$amount" }, people: { $addToSet: "$userId" }, unpaid: { $sum: { $cond: [{ $eq: [{ $arrayElemAt: ["$po.status", 0] }, "paid"] }, 0, 1] } } } },
        ]),
        viewer ? Payment.aggregate<{ _id: Types.ObjectId; q: number }>([{ $match: { eventId: { $in: chipIn }, status: "paid", userId: viewer._id } }, { $group: { _id: "$eventId", q: { $sum: "$quantity" } } }]) : Promise.resolve([]),
      ])
    : [[], []];
  const raisedMap = new Map(raisedRows.map((r) => [sid(r._id), r]));
  const mineMap = new Map(mineRows.map((r) => [sid(r._id), r.q]));

  return events.map((e) => {
    const c = e.communityId ? communityMap.get(sid(e.communityId)) : undefined;
    const s = e.subcommunityId ? subMap.get(sid(e.subcommunityId)) : undefined;
    const isHost = !!viewer && sid(e.hostId) === sid(viewer._id);
    const end = (e.endsAt ?? new Date(e.startsAt.getTime() + EVENT_FALLBACK_DURATION_MS)).getTime();
    return {
      id: sid(e._id),
      title: e.title,
      description: e.description,
      interest: e.interest,
      country: e.country ?? "NG",
      region: e.region ?? "",
      city: e.city,
      neighborhood: e.neighborhood,
      online: !!e.online,
      ticketUrl: e.ticketUrl ?? null,
      onlineUrl: e.online ? (e.onlineUrl ?? null) : null,
      venue: e.venue,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt ? e.endsAt.toISOString() : null,
      priceNaira: e.priceNaira,
      currency: e.currency ?? "NGN",
      capacity: e.capacity,
      coverImage: e.coverImage,
      host: hosts.get(sid(e.hostId)) ?? GHOST,
      // an event found elsewhere: who runs it, and its own page ("More info / tickets")
      organizer: e.organizerName || e.sourceUrl ? { name: e.organizerName ?? "", url: e.sourceUrl ?? null } : null,
      community: c ? { slug: c.slug, name: c.name, privacy: c.privacy, official: isKlique(c), adult: !!c.adult } : null,
      subcommunity: s ? { slug: s.slug, name: s.name } : null,
      audience: e.audience,
      goingCount: e.goingCount,
      interestedCount: e.interestedCount,
      crewCount: crewMap.get(sid(e._id)) ?? 0,
      isPast: end < now,
      isFull: e.capacity !== null && e.goingCount >= e.capacity,
      review: e.review ? { status: e.review, reason: e.reviewReason ?? "" } : null,
      contribution: e.contribution
        ? (() => {
            const r = raisedMap.get(sid(e._id));
            return { label: e.contribution.label, unitPrice: e.contribution.unitPrice, maxQuantity: e.contribution.maxQuantity, raised: r?.raised ?? 0, contributors: r?.people.length ?? 0, mine: mineMap.get(sid(e._id)) ?? 0, withdrawn: !!r && r.unpaid === 0 };
          })()
        : null,
      viewer: {
        rsvp: rsvpMap.get(sid(e._id)) ?? null,
        saved: savedSet.has(sid(e._id)),
        isHost,
        canEdit: isHost,
        // a community's event (not Klique's): going or saving it means joining the community first
        mustJoin: !isHost && !!c && !isKlique(c) && !memberSet.has(sid(c._id)),
      },
    };
  });
}
