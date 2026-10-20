import { Types } from "mongoose";
import type { Role, ViewerAccess } from "@/lib/types";
import { forbidden, notFound } from "../http/errors";
import type { IChannel } from "../models/Channel";
import type { ICommunity } from "../models/Community";
import type { IEvent } from "../models/Event";
import { Membership, type IMembership } from "../models/Membership";
import { MembershipRequest } from "../models/MembershipRequest";
import type { ISubcommunity } from "../models/Subcommunity";
import type { IUser } from "../models/User";
import { isSiteAdmin } from "./hosting";

/**
 * AUTHORIZATION POLICIES — the single source of truth for "who may do what".
 * Services call these before reading or writing; the UI merely mirrors the
 * result (e.g. hiding a button) and is never the access-control mechanism.
 */

export interface Space {
  community: ICommunity;
  sub: ISubcommunity | null;
}

export interface SpaceAccess extends ViewerAccess {
  banned: boolean;
  /** role in the parent community (subcommunities only; equals `role` for communities) */
  parentRole: Role | null;
  /** may join immediately, without approval or an invite */
  canJoinDirectly: boolean;
  /** parent owner/admin who can moderate a subcommunity (delete it) without being able to read a private one */
  canModerate: boolean;
}

const isManager = (r: Role | null) => r === "owner" || r === "admin";

export async function findMembership(
  userId: Types.ObjectId | string,
  communityId: Types.ObjectId | string,
  subcommunityId: Types.ObjectId | string | null,
): Promise<IMembership | null> {
  return Membership.findOne({ userId, communityId, subcommunityId }).lean<IMembership>();
}

function activeRole(m: IMembership | null): Role | null {
  return m && m.status === "active" ? m.role : null;
}

/** Pure community-level access from already-loaded rows (lets list pages batch the lookups). */
export function communityAccessFrom(
  community: Pick<ICommunity, "privacy">,
  membership: IMembership | null,
  pendingRequest: boolean,
): SpaceAccess {
  const role = activeRole(membership);
  const banned = membership?.status === "banned";
  const isPublic = community.privacy === "public";
  return {
    role,
    isMember: role !== null,
    pendingRequest: role ? false : pendingRequest,
    canManage: isManager(role),
    canView: isPublic ? true : role !== null,
    canPost: role !== null,
    banned,
    parentRole: role,
    canJoinDirectly: isPublic && !banned && role === null,
    canModerate: false,
  };
}

/**
 * Pure group access from already-loaded rows (lets list pages batch the lookups).
 * Every group is private. Its own members can see and use it; the community's owner and site admins can also
 * see, enter and manage every group (to add themselves or others, and to moderate). Nobody joins a group:
 * its owner and admins add people from the community.
 */
export function subAccessFrom(
  _sub: unknown,
  parentMembership: IMembership | null,
  subMembership: IMembership | null,
  viewerIsSiteAdmin = false,
): SpaceAccess {
  const parentRole = activeRole(parentMembership);
  const role = activeRole(subMembership);
  const banned = subMembership?.status === "banned";
  const overseer = parentRole === "owner" || viewerIsSiteAdmin;
  return {
    role,
    isMember: role !== null,
    pendingRequest: false,
    canManage: isManager(role) || overseer,
    canView: role !== null || overseer,
    canPost: role !== null,
    banned,
    parentRole,
    canJoinDirectly: false,
    canModerate: overseer,
  };
}

/** What `viewer` (possibly signed-out) may do in this space. */
export async function spaceAccess(space: Space, viewer: IUser | null): Promise<SpaceAccess> {
  const none: SpaceAccess = {
    role: null,
    isMember: false,
    pendingRequest: false,
    canManage: false,
    canView: false,
    canPost: false,
    banned: false,
    parentRole: null,
    canJoinDirectly: false,
    canModerate: false,
  };

  const { community, sub } = space;

  if (!sub) {
    if (!viewer) return { ...none, canView: community.privacy === "public" };
    const m = await findMembership(viewer._id, community._id, null);
    const role = activeRole(m);
    const pending = role
      ? false
      : !!(await MembershipRequest.exists({
          userId: viewer._id,
          communityId: community._id,
          subcommunityId: null,
          status: "pending",
        }));
    return communityAccessFrom(community, m, pending);
  }

  // ---- subcommunity ----
  if (!viewer) return none;

  const [parentM, subM] = await Promise.all([
    findMembership(viewer._id, community._id, null),
    findMembership(viewer._id, community._id, sub._id),
  ]);
  return subAccessFrom(sub, parentM, subM, isSiteAdmin(viewer));
}

/* ---------------------------- assertions ---------------------------- */

export function assertCanView(access: SpaceAccess, what = "this") {
  if (!access.canView) throw forbidden(`You need to be a member to see ${what}.`);
}

export function assertCanPost(access: SpaceAccess) {
  if (!access.canPost) throw forbidden("Join this community to post or host here.");
}

export function assertCanManage(access: SpaceAccess) {
  if (!access.canManage) throw forbidden("Only owners and admins can do that.");
}

/** A group must look like it doesn't exist to anyone who can't see it. */
export function assertSubVisibleOrHidden(space: Space, access: SpaceAccess) {
  if (space.sub && !access.canView) throw notFound("We couldn't find that group.");
}

/* ------------------------------ events ------------------------------ */

/** Mongo filter of events this viewer is allowed to see. Use it in EVERY event list/search query. */
export async function eventVisibilityFilter(viewer: IUser | null): Promise<Record<string, unknown>> {
  const publicOnly = { audience: "public" };
  if (!viewer) return publicOnly;

  const memberships = await Membership.find({ userId: viewer._id, status: "active" })
    .select("communityId subcommunityId")
    .lean<Pick<IMembership, "communityId" | "subcommunityId">[]>();

  const communityIds = memberships.filter((m) => !m.subcommunityId).map((m) => m.communityId);
  const subIds = memberships.filter((m) => m.subcommunityId).map((m) => m.subcommunityId!);

  return {
    $or: [
      publicOnly,
      // community events, but never a group's: those belong to the group whatever their stored audience
      { audience: "community", communityId: { $in: communityIds }, subcommunityId: null },
      { subcommunityId: { $in: subIds }, audience: { $ne: "public" } },
      { hostId: viewer._id },
    ],
  };
}

export async function canViewEvent(event: IEvent, viewer: IUser | null): Promise<boolean> {
  if (event.audience === "public") return true;
  if (!viewer) return false;
  if (String(event.hostId) === String(viewer._id)) return true;

  if (event.subcommunityId) {
    const m = await findMembership(viewer._id, event.communityId!, event.subcommunityId);
    return activeRole(m) !== null;
  }
  if (event.audience === "community" && event.communityId) {
    const m = await findMembership(viewer._id, event.communityId, null);
    return activeRole(m) !== null;
  }
  return false;
}

/** Audience an event inherits from the space it is created in. */
export function audienceFor(space: Space | null): IEvent["audience"] {
  if (!space) return "public";
  if (space.sub) return "subcommunity";
  return space.community.privacy === "public" ? "public" : "community";
}

/* ---------------------------- role changes -------------------------- */

const RANK: Record<Role, number> = { owner: 3, admin: 2, member: 1 };

/** Can `actor` remove / re-role `target`? Nobody can touch someone of equal or higher rank. */
export function outranks(actor: Role | null, target: Role): boolean {
  return actor !== null && RANK[actor] > RANK[target];
}

/** Only owners promote to admin / demote admins. */
export function canSetRole(actor: Role | null, target: Role, next: Role): boolean {
  if (next === "owner" || target === "owner") return false; // ownership transfer is out of scope
  if (actor === "owner") return true;
  return false;
}

/* ------------------------------ channels ---------------------------- */

/**
 * Chat channels. `access` is the viewer's access to the channel's own space (the community, or the
 * group it belongs to). Reading follows that space; narrower channels narrow it further:
 *   "all"      everyone who can see the space
 *   "managers" owners/admins of the space only (a staff room)
 *   "invite"   a private room: people on its guest list, plus the space's owners/admins
 * Anything the viewer can't see must look like it doesn't exist (callers answer 404).
 */
export function canSeeChannel(channel: Pick<IChannel, "visibility">, access: SpaceAccess, invited = false): boolean {
  if (!access.canView) return false;
  if (channel.visibility === "all") return true;
  if (access.canManage) return true;
  return channel.visibility === "invite" && invited;
}

/** Posting needs membership of the space; announcement channels additionally need owner/admin. */
export function canPostInChannel(channel: Pick<IChannel, "visibility" | "type">, access: SpaceAccess, invited = false): boolean {
  return canSeeChannel(channel, access, invited) && access.canPost && !access.banned && (channel.type !== "announcement" || access.canManage) && channel.type !== "voice";
}

/** Who may start a group in a community, from its `groupPolicy` setting. */
export function canCreateGroup(community: Pick<ICommunity, "groupPolicy">, access: Pick<SpaceAccess, "isMember" | "canManage">): boolean {
  const policy = community.groupPolicy ?? "admins";
  if (policy === "off" || !access.isMember) return false;
  return policy === "members" ? true : access.canManage;
}

/**
 * Space-role shortcut for list pages that batch lookups (the rail): can someone with this role in the
 * channel's space (null = not a member) see it?
 */
export function channelVisibleToRole(channel: Pick<IChannel, "visibility">, role: Role | null, invited: boolean): boolean {
  if (role === null) return false;
  if (channel.visibility === "all") return true;
  if (role === "owner" || role === "admin") return true;
  return channel.visibility === "invite" && invited;
}
