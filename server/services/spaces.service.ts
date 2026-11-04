import { isKlique } from "./klique-id";
import type { Types } from "mongoose";
import { deleteUploads } from "./media.service";
import type {
  InviteDTO,
  InvitePreviewDTO,
  JoinResult,
  MemberDTO,
  MembershipRequestDTO,
  Paginated,
  PostDTO,
  Role,
} from "@/lib/types";
import { ApiError, badRequest, conflict, forbidden, notFound } from "../http/errors";
import { ChannelMember } from "../models/Channel";
import { Community, type ICommunity } from "../models/Community";
import { Invitation, type IInvitation } from "../models/Invitation";
import { Membership, type IMembership } from "../models/Membership";
import { MembershipRequest, type IMembershipRequest } from "../models/MembershipRequest";
import { Post, type IPost } from "../models/Post";
import { Subcommunity, type ISubcommunity } from "../models/Subcommunity";
import { User, type IUser } from "../models/User";
import {
  assertCanManage,
  assertCanPost,
  assertCanView,
  assertSubVisibleOrHidden,
  canSetRole,
  gateOf,
  pointsShort,
  spaceAccess,
  type Space,
  type SpaceAccess,
  canSeeMembers,
} from "../policies/access";
import { loadBriefs, toPosts } from "../serializers";
import { escapeRegex, newInviteCode, recountMembers, sid } from "./helpers";
import { rateLimit } from "../http/rate-limit";
import { notify } from "./push.service";
import { leaveSpaceCrews } from "./crews.service";
import { assertCanJoinCommunity } from "./space-limits";
import { checkAnswers } from "./screening.service";
import { timeoutOf } from "../policies/access";
import { ModAction } from "../models/ModAction";
import { isSiteAdmin } from "../policies/hosting";
import { ADMIN_RANK, can } from "../policies/access";

/* ------------------------------------------------------------------ */
/* Resolving a space from URL params                                   */
/* ------------------------------------------------------------------ */

export async function resolveSpace(slug: string, subSlug?: string): Promise<Space> {
  const community = await Community.findOne({ slug: slug.toLowerCase() }).lean<ICommunity>();
  if (!community) throw notFound("We couldn't find that community.");
  if (!subSlug) return { community, sub: null };
  const sub = await Subcommunity.findOne({ communityId: community._id, slug: subSlug.toLowerCase() }).lean<ISubcommunity>();
  if (!sub) throw notFound("We couldn't find that group.");
  return { community, sub };
}

/** Resolve + authorise visibility in one step. Private groups 404 for outsiders, and so do 18+ communities for under-18s. */
export async function resolveSpaceFor(viewer: IUser | null, slug: string, subSlug?: string) {
  const space = await resolveSpace(slug, subSlug);
  const access = await spaceAccess(space, viewer);
  assertAdultGate(access);
  assertSubVisibleOrHidden(space, access);
  return { space, access };
}

/** An 18+ community this person may not enter: not found for under-18s, otherwise what they still need to do. */
export function assertAdultGate(access: SpaceAccess) {
  const gate = access.adultGate;
  if (!gate) return;
  if (gate === "under_18") throw notFound("We couldn't find that community.");
  throw new ApiError(403, ADULT_GATE_MESSAGE[gate], { code: "age_gate", errors: { gate } });
}

const ADULT_GATE_MESSAGE: Record<Exclude<NonNullable<SpaceAccess["adultGate"]>, "under_18">, string> = {
  sign_in: "Sign in to see this community. It's for people 18 and over.",
  dob_required: "This community is for people 18 and over. Add your date of birth to continue.",
  confirm_adult: "This community is for people 18 and over. Confirm you're 18 or older to continue.",
  explicit_optin: "This community shows explicit content. Turn on Show explicit content in Settings to see it.",
};

const spaceFilter = (space: Space) => ({
  communityId: space.community._id,
  subcommunityId: space.sub?._id ?? null,
});

const spaceLabel = (space: Space) => (space.sub ? space.sub.name : space.community.name);

/* ------------------------------------------------------------------ */
/* Joining & leaving                                                   */
/* ------------------------------------------------------------------ */

async function addMember(space: Space, userId: Types.ObjectId, role: Role = "member") {
  const res = await Membership.updateOne(
    { userId, ...spaceFilter(space) },
    { $setOnInsert: { role }, $set: { status: "active" } },
    { upsert: true },
  );
  // a new member of the community: the welcome greeting in its chosen channel; its bots hear about it
  if (!space.sub && res.upsertedCount) {
    void (await import("./welcome.service")).greetNewMember(space.community, userId);
    const joiner = (await loadBriefs([userId])).get(sid(userId)) ?? { id: sid(userId) };
    void import("./bots.service").then((b) => b.emitBotEvent(space.community._id, "member.join", { user: joiner }));
  }
  await MembershipRequest.updateMany(
    { userId, ...spaceFilter(space), status: "pending" },
    { status: "approved", decidedAt: new Date() },
  );
  await recountMembers(space.community._id, space.sub?._id ?? null);
}

export async function joinSpace(
  viewer: IUser,
  space: Space,
  input: { message?: string; inviteCode?: string; answers?: Record<string, string | boolean> },
  access: SpaceAccess,
): Promise<JoinResult> {
  if (access.isMember) return { status: "already_member", message: `You're already in ${spaceLabel(space)}.` };
  // groups are private and nobody joins them: a group's owner or admins add people from the community
  if (space.sub) throw forbidden("Groups are private. Ask one of the group's admins to add you.");
  if (access.banned) throw forbidden("You can't join this one.");
  // how many communities their plan lets them be in (asking to join counts too)
  if (!space.community.official) await assertCanJoinCommunity(viewer, space.community._id);
  // the community's entry questions, when it has them on: answered before anything else (invite links too)
  const answers = checkAnswers(space.community, input.answers);
  const keepAnswers = async () => {
    if (answers.length) await Membership.updateOne({ userId: viewer._id, communityId: space.community._id, subcommunityId: null }, { $set: { answers } });
  };

  // 1) Invite link — the one way into a private space without approval.
  if (input.inviteCode) {
    await requireParentSeat(viewer, space);
    await consumeInvite(input.inviteCode, space);
    await addMember(space, viewer._id);
    await keepAnswers();
    return { status: "joined", message: `Welcome to ${spaceLabel(space)}.` };
  }

  // the points this community asks for, to join or to ask to (site admins never need any; Klique never asks)
  const short = pointsShort(space.community.minPointsJoin, null, gateOf(viewer), !!space.community.official);
  if (short) throw forbidden(`${space.community.name} needs ${short.toLocaleString("en-NG")} points to join. You have ${(viewer.points ?? 0).toLocaleString("en-NG")}.`);

  // raid protection (AutoMod) may have locked joining for a while: paused, or through approval
  const { raidLock, noteJoin } = await import("./automod.service");
  const lock = space.sub ? null : raidLock(space.community);
  if (lock === "pause" && access.canJoinDirectly) throw forbidden(`Joining ${space.community.name} is paused for a little while. Try again later.`);

  // 2) Open to this person (public community, or a group open to its parent's members).
  if (access.canJoinDirectly && !lock) {
    await addMember(space, viewer._id);
    await keepAnswers();
    void noteJoin(space.community).catch((e) => console.warn("[automod] raid check:", (e as Error).message));
    return { status: "joined", message: `You joined ${spaceLabel(space)}.` };
  }

  // 3) Private community (or a public one whose joins need approval during a raid): ask an admin.
  if (!space.sub && (space.community.privacy === "private" || lock === "approval")) {
    if (access.pendingRequest) {
      return { status: "already_requested", message: "Your request is waiting for an admin." };
    }
    rateLimit(`join-request:${sid(viewer._id)}`, 10, 60 * 60 * 1000);
    const request = await MembershipRequest.create({
      userId: viewer._id,
      ...spaceFilter(space),
      message: input.message ?? "",
      answers,
    });
    // the people who decide hear about it, bundled: one line per community however many ask
    const staff = await Membership.find({ communityId: space.community._id, subcommunityId: null, status: "active", role: { $in: ["owner", "admin"] } }).select("userId").lean<{ userId: Types.ObjectId }[]>();
    notify(
      staff.map((m) => m.userId),
      { title: `${viewer.displayName} wants to join ${space.community.name}`, body: input.message ? `"${input.message}"` : "Tap to review the request.", data: { href: `/communities/${space.community.slug}?settings=requests` } },
      { actorId: viewer._id, action: { kind: "communityRequest", slug: space.community.slug, requestId: sid(request._id) }, category: "admin", groupKey: `join-req:${sid(space.community._id)}`, many: (n) => `${n} people want to join ${space.community.name}`, ref: `requests:${sid(space.community._id)}` },
    );
    return { status: "requested", message: "Request sent. An admin will take a look." };
  }

  // 4) Everything else is closed.
  throw forbidden("You can't join this one.");
}

/**
 * Being in a group always means being in its parent community. An invite to a group of a public
 * community therefore also seats you in the community; for a private community you must already
 * be a member (or have been approved), so a group invite can never be a back door into it.
 */
async function requireParentSeat(viewer: IUser, space: Space) {
  if (!space.sub) return;
  const parent = await Membership.findOne({ userId: viewer._id, communityId: space.community._id, subcommunityId: null }).lean<IMembership>();
  if (parent?.status === "active") return;
  if (parent?.status === "banned") throw forbidden("You can't join this one.");
  if (space.community.privacy === "private") throw forbidden(`Join ${space.community.name} first, then use this invite.`);
  await Membership.updateOne({ userId: viewer._id, communityId: space.community._id, subcommunityId: null }, { $setOnInsert: { role: "member" }, $set: { status: "active" } }, { upsert: true });
  await recountMembers(space.community._id, null);
}

export async function leaveSpace(viewer: IUser, space: Space, access: SpaceAccess): Promise<{ left: boolean; cancelledRequest: boolean }> {
  if (!access.isMember) {
    const cancelled = await MembershipRequest.deleteOne({ userId: viewer._id, ...spaceFilter(space), status: "pending" });
    if (cancelled.deletedCount) return { left: false, cancelledRequest: true };
    throw conflict("You're not a member of this one.");
  }
  if (access.role === "owner") {
    throw conflict("Owners can't leave. Delete it instead, or ask a member to take over.");
  }
  if (!space.sub && isKlique(space.community)) throw conflict("Everyone's in Klique: it's where announcements and Klique's own events are, so it can't be left.");

  await Membership.deleteOne({ userId: viewer._id, ...spaceFilter(space) });
  await ChannelMember.deleteMany({ userId: viewer._id, ...spaceFilter(space) });
  await recountMembers(space.community._id, space.sub?._id ?? null);
  if (!space.sub) await dropParentOnlyGroups(space.community._id, [viewer._id]);
  // their crews here go with it (the leave button warned them)
  await leaveSpaceCrews(viewer._id, space.community._id, space.sub?._id ?? null);
  if (!space.sub) void import("./bots.service").then((b) => b.emitBotEvent(space.community._id, "member.leave", { user: { id: sid(viewer._id), handle: viewer.handle }, reason: "left" }));
  return { left: true, cancelledRequest: false };
}

/**
 * Group members are always members of the parent, so leaving or being removed from the
 * parent takes you out of its groups (and off their private channels) too.
 */
async function dropParentOnlyGroups(communityId: Types.ObjectId, userIds: Types.ObjectId[]) {
  const subs = await Subcommunity.find({ communityId }).select("_id").lean<{ _id: Types.ObjectId }[]>();
  if (!subs.length) return;
  await Membership.deleteMany({ userId: { $in: userIds }, subcommunityId: { $in: subs.map((s) => s._id) } });
  await ChannelMember.deleteMany({ userId: { $in: userIds }, communityId });
  await Promise.all(subs.map((s) => recountMembers(communityId, s._id)));
}

/* ------------------------------------------------------------------ */
/* Members & roles                                                     */
/* ------------------------------------------------------------------ */

export async function listMembers(
  viewer: IUser,
  space: Space,
  access: SpaceAccess,
  page: number,
  q?: string,
): Promise<Paginated<MemberDTO>> {
  // A community's member list is for its owner, admins and moderators (canSeeMembers); a group's (small and
  // private) for its members. Site admins see both.
  if (space.sub ? !access.isMember && !access.canModerate : !canSeeMembers(access)) throw forbidden(space.sub ? "Join to see who's in here." : "Only the community's admins can see its member list.");

  const size = 24;
  const base: Record<string, unknown> = { ...spaceFilter(space), status: "active" as const };
  // Name search: match display name or handle, then keep only those people's memberships.
  if (q) {
    const rx = new RegExp(escapeRegex(q.replace(/^@/, "")), "i");
    const ids = await User.find({ $or: [{ displayName: rx }, { handle: rx }] }).select("_id").limit(1000).lean<{ _id: Types.ObjectId }[]>();
    base.userId = { $in: ids.map((u) => u._id) };
  }
  const [managers, rows] = await Promise.all([
    page === 1
      ? Membership.find({ ...base, role: { $in: ["owner", "admin"] } })
          .sort({ role: 1, createdAt: 1 }) // "admin" < "owner" alphabetically; fixed below
          .lean<IMembership[]>()
      : [],
    Membership.find({ ...base, role: "member" })
      .sort({ createdAt: 1 })
      .skip((page - 1) * size)
      .limit(size + 1)
      .lean<IMembership[]>(),
  ]);

  const hasMore = rows.length > size;
  const ordered = [...managers.sort((a, b) => (a.role === b.role ? 0 : a.role === "owner" ? -1 : 1)), ...rows.slice(0, size)];
  const briefs = await loadBriefs(ordered.map((m) => m.userId));
  // their roles and rank in the community: you act only on people below you, with the matching permission
  const { standings } = await import("./roles.service");
  const standing = await standings(space.community._id, ordered.map((m) => m.userId));
  const myRank = access.rank ?? 0;

  const items: MemberDTO[] = ordered.flatMap((m) => {
    const user = briefs.get(sid(m.userId));
    if (!user) return [];
    const isSelf = sid(m.userId) === sid(viewer._id);
    const st = standing.get(sid(m.userId));
    const theirRank = space.sub ? Math.max(st?.rank ?? 0, m.role === "owner" ? 1e9 : m.role === "admin" ? ADMIN_RANK : 0) : (st?.rank ?? 0);
    const below = !isSelf && m.role !== "owner" && theirRank < myRank;
    return [
      {
        user,
        role: m.role,
        joinedAt: m.createdAt.toISOString(),
        canChangeRole: !isSelf && canSetRole(access.role, m.role, m.role === "admin" ? "member" : "admin"),
        canRemove: below && (can(access, "kick") || can(access, "ban")),
        ...(!space.sub ? { roles: st?.roles ?? [], canEditRoles: can(access, "manageRoles") && (below || (isSelf && m.role !== "owner")) } : {}),
        // timeouts are community-wide (set from the community, not a group)
        ...(!space.sub && (can(access, "timeout") || access.canManage) ? { canTimeout: below && can(access, "timeout"), timedOutUntil: timeoutOf(m), timeoutReason: timeoutOf(m) ? (m.timeoutReason ?? null) : null } : {}),
        // what they answered to the entry questions: for the owner and admins only
        ...(access.canManage && m.answers?.length ? { answers: m.answers } : {}),
      },
    ];
  });
  return { items, page, hasMore };
}

async function targetMembership(space: Space, userId: string): Promise<IMembership> {
  const m = await Membership.findOne({ userId, ...spaceFilter(space), status: "active" }).lean<IMembership>();
  if (!m) throw notFound("That person isn't a member.");
  return m;
}

export async function changeRole(viewer: IUser, space: Space, access: SpaceAccess, userId: string, role: Exclude<Role, "owner">) {
  assertCanManage(access);
  const target = await targetMembership(space, userId);
  if (sid(target.userId) === sid(viewer._id)) throw forbidden("You can't change your own role.");
  if (!canSetRole(access.role, target.role, role)) throw forbidden("Only the owner can change roles.");
  await Membership.updateOne({ _id: target._id }, { role });
  // the community's Admin role (custom roles) follows "admin"
  if (!space.sub) await (await import("./roles.service")).syncAdminRole(space.community._id, target.userId, role === "admin");
  if (role !== target.role) {
    const href = space.sub ? `/communities/${space.community.slug}?g=${space.sub.slug}` : `/communities/${space.community.slug}`;
    notify(
      [target.userId],
      role === "admin"
        ? { title: `You're now an admin of ${spaceLabel(space)}`, body: `${viewer.displayName} made you an admin. You can manage members, channels and events there.`, data: { href } }
        : { title: `You're no longer an admin of ${spaceLabel(space)}`, body: "You're still a member.", data: { href } },
      { category: "community", ref: `community:${sid(space.community._id)}` },
    );
  }
  return { userId, role };
}

/** The owner hands the space to another member; they stay on as an admin. */
export async function transferOwnership(viewer: IUser, space: Space, access: SpaceAccess, userId: string) {
  if (access.role !== "owner") throw forbidden("Only the owner can hand this over.");
  const target = await targetMembership(space, userId);
  if (sid(target.userId) === sid(viewer._id)) throw conflict("You already own this.");
  await Membership.updateOne({ _id: target._id }, { role: "owner" });
  await Membership.updateOne({ userId: viewer._id, ...spaceFilter(space) }, { role: "admin" });
  if (space.sub) await Subcommunity.updateOne({ _id: space.sub._id }, { ownerId: target.userId });
  else await Community.updateOne({ _id: space.community._id }, { ownerId: target.userId });
  return { ownerId: userId };
}

/** how long a timeout can be: 60 seconds, 5 or 10 minutes, an hour, a day, a week */
export const TIMEOUT_SECONDS = [60, 300, 600, 3600, 86_400, 604_800] as const;

/**
 * Time someone out in the community (an owner or admin above them; site admins too): until it runs out they can read
 * but not post, react, vote or start events or kliques there or in its groups. `seconds: 0` lifts it early. They're
 * told, with the reason; it goes in the moderation log.
 */
export async function setTimeout_(viewer: IUser, space: Space, access: SpaceAccess, userId: string, seconds: number, reason: string) {
  if (space.sub) throw badRequest("Time people out from the community, not a group.");
  if (!can(access, "timeout") && !isSiteAdmin(viewer)) throw forbidden("You don't have permission to time people out.");
  const target = await targetMembership(space, userId);
  if (sid(target.userId) === sid(viewer._id)) throw forbidden("You can't time yourself out.");
  if (!isSiteAdmin(viewer) && (await rankOf(space, target.userId)) >= (access.rank ?? 0)) throw forbidden("You can't time out someone at or above your own rank.");
  if (target.role === "owner") throw forbidden("The owner can't be timed out.");
  const lifting = seconds === 0;
  if (!lifting && !(TIMEOUT_SECONDS as readonly number[]).includes(seconds)) throw badRequest("Pick how long.");
  const until = lifting ? null : new Date(Date.now() + seconds * 1000);
  await Membership.updateOne({ _id: target._id }, { $set: { timeoutUntil: until, timeoutReason: lifting ? null : reason.trim().slice(0, 300) || null, timeoutById: lifting ? null : viewer._id } });
  const who = await User.findById(target.userId).select("displayName").lean<{ displayName: string }>();
  await ModAction.create({ communityId: space.community._id, actorId: viewer._id, action: lifting ? "timeout.remove" : "timeout", targetType: "member", targetId: target.userId, label: lifting ? `${who?.displayName ?? "Someone"}` : `${who?.displayName ?? "Someone"} for ${durationLabel(seconds)}${reason.trim() ? `: ${reason.trim().slice(0, 150)}` : ""}`, authorId: target.userId }).catch(() => {});
  const href = `/communities/${space.community.slug}`;
  notify(
    [target.userId],
    lifting
      ? { title: `Your timeout in ${space.community.name} was lifted`, body: "You can post and react again.", data: { href } }
      : { title: `You're timed out in ${space.community.name} for ${durationLabel(seconds)}`, body: reason.trim() ? `Reason: ${reason.trim().slice(0, 150)}. You can still read.` : "You can still read, but not post or react until it ends.", data: { href } },
    { category: "community", ref: `timeout:${sid(space.community._id)}` },
  );
  return { userId, timedOutUntil: until?.toISOString() ?? null };
}

/** "60 seconds", "5 minutes", "1 hour", "1 day", "1 week" */
export function durationLabel(seconds: number): string {
  if (seconds < 120) return `${seconds} seconds`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} ${seconds === 3600 ? "hour" : "hours"}`;
  if (seconds < 604_800) return `${Math.round(seconds / 86_400)} ${seconds === 86_400 ? "day" : "days"}`;
  return "1 week";
}

/** Someone's rank in the community (their roles; owner highest), and in a group its own admins above its members. */
async function rankOf(space: Space, userId: Types.ObjectId): Promise<number> {
  const { standings } = await import("./roles.service");
  const inCommunity = (await standings(space.community._id, [userId])).get(sid(userId))?.rank ?? 0;
  if (!space.sub) return inCommunity;
  const m = await Membership.findOne({ ...spaceFilter(space), userId, status: "active" }).select("role").lean<Pick<IMembership, "role">>();
  return Math.max(inCommunity, m?.role === "owner" ? 1e9 : m?.role === "admin" ? ADMIN_RANK : 0);
}

export async function removeMember(viewer: IUser, space: Space, access: SpaceAccess, userId: string, ban: boolean) {
  if (!can(access, ban ? "ban" : "kick")) throw forbidden(ban ? "You don't have permission to ban people." : "You don't have permission to remove people.");
  const target = await targetMembership(space, userId);
  if (sid(target.userId) === sid(viewer._id)) throw forbidden("Use “Leave” to remove yourself.");
  if (target.role === "owner" || (await rankOf(space, target.userId)) >= (access.rank ?? 0)) throw forbidden("You can't remove someone at or above your own rank.");

  void ModAction.create({ communityId: space.community._id, actorId: viewer._id, action: ban ? "ban" : "kick", targetType: "member", targetId: target.userId, label: (await User.findById(target.userId).select("displayName").lean<{ displayName: string }>())?.displayName ?? "Someone", authorId: target.userId }).catch(() => {});
  if (ban) await Membership.updateOne({ _id: target._id }, { status: "banned", role: "member", roleIds: [] });
  else await Membership.deleteOne({ _id: target._id });
  await ChannelMember.deleteMany({ userId: target.userId, ...spaceFilter(space) });

  await recountMembers(space.community._id, space.sub?._id ?? null);
  if (!space.sub) await dropParentOnlyGroups(space.community._id, [target.userId]);
  await leaveSpaceCrews(target.userId, space.community._id, space.sub?._id ?? null);
  if (!space.sub) void import("./bots.service").then((b) => b.emitBotEvent(space.community._id, "member.leave", { user: { id: sid(target.userId) }, reason: ban ? "banned" : "removed" }));
  return { userId, removed: true, banned: ban };
}

/* ------------------------------------------------------------------ */
/* Join requests (private communities)                                 */
/* ------------------------------------------------------------------ */

export async function listRequests(space: Space, access: SpaceAccess): Promise<MembershipRequestDTO[]> {
  assertCanManage(access);
  // private communities, and public ones that asked for approval during a raid
  if (space.sub) return [];
  const rows = await MembershipRequest.find({ ...spaceFilter(space), status: "pending" })
    .sort({ createdAt: 1 })
    .limit(100)
    .lean<IMembershipRequest[]>();
  const briefs = await loadBriefs(rows.map((r) => r.userId));
  return rows.flatMap((r) => {
    const user = briefs.get(sid(r.userId));
    return user ? [{ id: sid(r._id), user, message: r.message, answers: r.answers ?? [], status: r.status, createdAt: r.createdAt.toISOString() }] : [];
  });
}

export async function decideRequest(
  viewer: IUser,
  space: Space,
  access: SpaceAccess,
  requestId: string,
  action: "approve" | "reject",
) {
  assertCanManage(access);
  const req = await MembershipRequest.findOne({ _id: requestId, ...spaceFilter(space), status: "pending" }).lean<IMembershipRequest>();
  if (!req) throw notFound("That request was already handled.");

  if (action === "approve") {
    const existing = await Membership.findOne({ userId: req.userId, ...spaceFilter(space) }).lean<IMembership>();
    if (existing?.status === "banned") throw forbidden("That person is banned from here.");
    await addMember(space, req.userId); // also marks the request approved
    // their answers to the entry questions go with them
    if (req.answers?.length && !space.sub) await Membership.updateOne({ userId: req.userId, communityId: space.community._id, subcommunityId: null }, { $set: { answers: req.answers } });
    await MembershipRequest.updateOne({ _id: req._id }, { decidedBy: viewer._id });
    notify([req.userId], { title: `You're in ${spaceLabel(space)}`, body: "Your request to join was approved. Come say hi.", data: { href: `/communities/${space.community.slug}` } }, { category: "community", ref: `community:${sid(space.community._id)}` });
  } else {
    await MembershipRequest.updateOne({ _id: req._id }, { status: "rejected", decidedBy: viewer._id, decidedAt: new Date() });
  }
  return { requestId, action };
}

/* ------------------------------------------------------------------ */
/* Invite links                                                        */
/* ------------------------------------------------------------------ */

const isInviteOnly = (space: Space) => !space.sub && space.community.privacy === "private";

function inviteActive(i: IInvitation, now = new Date()): { active: boolean; reason?: "expired" | "revoked" | "used_up" } {
  if (i.revokedAt) return { active: false, reason: "revoked" };
  if (i.expiresAt && i.expiresAt <= now) return { active: false, reason: "expired" };
  if (i.maxUses !== null && i.uses >= i.maxUses) return { active: false, reason: "used_up" };
  return { active: true };
}

const toInvite = (i: IInvitation): InviteDTO => ({
  id: sid(i._id),
  code: i.code,
  createdAt: i.createdAt.toISOString(),
  expiresAt: i.expiresAt ? i.expiresAt.toISOString() : null,
  maxUses: i.maxUses,
  uses: i.uses,
  revoked: !!i.revokedAt,
  active: inviteActive(i).active,
});

export async function listInvites(space: Space, access: SpaceAccess): Promise<InviteDTO[]> {
  assertCanManage(access);
  const rows = await Invitation.find({ ...spaceFilter(space) }).sort({ createdAt: -1 }).limit(50).lean<IInvitation[]>();
  return rows.map(toInvite);
}

export async function createInvite(
  viewer: IUser,
  space: Space,
  access: SpaceAccess,
  input: { expiresInDays?: number; maxUses?: number },
): Promise<InviteDTO> {
  if (space.sub) throw badRequest("Groups don't use invite links. Add people from the group's Members page.");
  assertCanManage(access);
  if (!isInviteOnly(space)) {
    throw badRequest("Invite links are for private spaces. Open ones can just share their normal link.");
  }
  const doc = await Invitation.create({
    code: newInviteCode(),
    ...spaceFilter(space),
    createdBy: viewer._id,
    expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
    maxUses: input.maxUses ?? null,
  });
  return toInvite(doc.toObject() as IInvitation);
}

export async function revokeInvite(space: Space, access: SpaceAccess, inviteId: string) {
  assertCanManage(access);
  const res = await Invitation.updateOne({ _id: inviteId, ...spaceFilter(space), revokedAt: null }, { revokedAt: new Date() });
  if (!res.matchedCount) throw notFound("That invite link doesn't exist or was already revoked.");
  return { inviteId, revoked: true };
}

/** Atomically use up one invite slot — validates the code belongs to THIS space. */
async function consumeInvite(code: string, space: Space) {
  const now = new Date();
  const updated = await Invitation.findOneAndUpdate(
    {
      code,
      ...spaceFilter(space),
      revokedAt: null,
      $and: [
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
        { $expr: { $or: [{ $eq: ["$maxUses", null] }, { $lt: ["$uses", "$maxUses"] }] } },
      ],
    },
    { $inc: { uses: 1 } },
  ).lean<IInvitation>();
  if (!updated) throw forbidden("That invite link isn't valid any more.");
}

async function loadInvite(code: string) {
  const invite = await Invitation.findOne({ code }).lean<IInvitation>();
  if (!invite) return null;
  const community = await Community.findById(invite.communityId).lean<ICommunity>();
  if (!community) return null;
  // group invite links stopped working when groups became add-only
  if (invite.subcommunityId) return null;
  const sub: ISubcommunity | null = null;
  return { invite, space: { community, sub } as Space };
}

/** What an invite link may show BEFORE joining. Deliberately minimal — no posts, members or events. */
export async function previewInvite(code: string, viewer: IUser | null): Promise<InvitePreviewDTO> {
  const loaded = await loadInvite(code);
  if (!loaded) return { code, valid: false, reason: "not_found", target: null, alreadyMember: false };

  const { invite, space } = loaded;
  const state = inviteActive(invite);
  const alreadyMember = viewer ? (await spaceAccess(space, viewer)).isMember : false;

  return {
    code,
    valid: state.active,
    reason: state.reason,
    alreadyMember,
    target: {
      kind: space.sub ? "subcommunity" : "community",
      name: space.sub ? space.sub.name : space.community.name,
      country: space.community.country ?? "NG",
      region: space.community.region ?? "",
      city: space.community.city,
      interest: space.community.interest,
      slug: space.sub ? space.sub.slug : space.community.slug,
      ...(space.sub ? { parentName: space.community.name, parentSlug: space.community.slug } : {}),
    },
  };
}

export async function acceptInvite(code: string, viewer: IUser): Promise<JoinResult & { slug: string; parentSlug?: string }> {
  const loaded = await loadInvite(code);
  if (!loaded) throw notFound("That invite link doesn't exist.");
  const { space } = loaded;
  const access = await spaceAccess(space, viewer);
  const result = await joinSpace(viewer, space, { inviteCode: code }, access);
  return {
    ...result,
    slug: space.sub ? space.sub.slug : space.community.slug,
    ...(space.sub ? { parentSlug: space.community.slug } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Posts / updates                                                     */
/* ------------------------------------------------------------------ */

export async function listPosts(viewer: IUser | null, space: Space, access: SpaceAccess, page: number): Promise<Paginated<PostDTO>> {
  assertCanView(access, "posts");
  const size = 10;
  const rows = await Post.find({ ...spaceFilter(space) })
    .sort({ pinned: -1, createdAt: -1 })
    .skip((page - 1) * size)
    .limit(size + 1)
    .lean<IPost[]>();
  const items = await toPosts(rows.slice(0, size), { canDelete: (p) => canDeletePost(viewer, access, p, space) });
  return { items, page, hasMore: rows.length > size };
}

function canDeletePost(viewer: IUser | null, access: SpaceAccess, post: IPost, space: Space) {
  if (!viewer) return false;
  if (sid(post.authorId) === sid(viewer._id)) return true;
  if (access.canManage) return true;
  return !!space.sub && access.canModerate;
}

export async function createPost(viewer: IUser, space: Space, access: SpaceAccess, input: { body: string; imageUrl?: string | null }) {
  assertCanPost(access);
  rateLimit(`post:${sid(viewer._id)}`, 20, 10 * 60 * 1000);
  const doc = await Post.create({
    ...spaceFilter(space),
    authorId: viewer._id,
    body: input.body,
    imageUrl: input.imageUrl || null,
  });
  const [dto] = await toPosts([doc.toObject() as IPost], { canDelete: () => true });
  return dto;
}

export async function deletePost(viewer: IUser, space: Space, access: SpaceAccess, postId: string) {
  assertCanView(access, "this post");
  const post = await Post.findOne({ _id: postId, ...spaceFilter(space) }).lean<IPost>();
  if (!post) throw notFound("That post is gone.");
  if (!canDeletePost(viewer, access, post, space)) throw forbidden("You can only delete your own posts.");
  await Post.deleteOne({ _id: post._id });
  deleteUploads([post.imageUrl]);
  return { postId, deleted: true };
}
