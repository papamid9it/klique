import { Types } from "mongoose";
import { adultCommunityIds, adultGate, type AdultGate } from "./adult";
import type { Role, ViewerAccess } from "@/lib/types";
import { forbidden, notFound } from "../http/errors";
import type { IChannel } from "../models/Channel";
import { Community, type ICommunity } from "../models/Community";
import type { IEvent } from "../models/Event";
import { Membership, type IMembership } from "../models/Membership";
import { MembershipRequest } from "../models/MembershipRequest";
import type { ISubcommunity } from "../models/Subcommunity";
import type { IUser } from "../models/User";
import { isSiteAdmin } from "./hosting";
import { kliqueId } from "../services/klique-id";
import { CommunityRole, type ICommunityRole } from "../models/CommunityRole";
import { ADMIN_PERMISSIONS, ALL_PERMISSIONS, isPermission, type Permission } from "@/lib/roles";

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
  /**
   * A member without the points this space asks for to post in its Posts section: the minimum they need (0:
   * nothing in the way). Chat, boards, comments, votes and reactions are never held back by it.
   */
  pointsToPost: number;
  /** an 18+ community this person may not enter yet, and why (policies/adult); they're treated as an outsider */
  adultGate?: AdultGate;
  /** timed out in the community (and so in its groups) until then: `canPost` is false meanwhile */
  timedOutUntil?: string | null;
  /** what their roles let them do in the community (owners: everything; admins: lib/roles ADMIN_PERMISSIONS) */
  perms?: Permission[];
  /** how high up they are: owner highest, then their highest role's position (0 with no roles) */
  rank?: number;
  /** the community roles they hold (for channel overrides) */
  roleIds?: string[];
  /** they must accept the community's rules (welcome screen) before posting: `canPost` is false meanwhile */
  needsRules?: boolean;
  /** the welcome screen is waiting for them */
  welcomePending?: boolean;
}

/** where "admin" sits when the Admin role hasn't been made yet (migrations/roles makes it at this position) */
export const ADMIN_RANK = 1000;
const OWNER_RANK = 1e9;

/** A member's permissions, rank and role ids from their community membership and the roles it holds. */
export function rolePowers(role: Role | null, roles: Pick<ICommunityRole, "_id" | "position" | "permissions">[]): { perms: Permission[]; rank: number; roleIds: string[] } {
  if (role === "owner") return { perms: [...ALL_PERMISSIONS], rank: OWNER_RANK, roleIds: roles.map((r) => String(r._id)) };
  const perms = new Set<Permission>(role === "admin" ? ADMIN_PERMISSIONS : []);
  for (const r of roles) for (const p of r.permissions) if (isPermission(p)) perms.add(p);
  const rank = Math.max(role === "admin" ? ADMIN_RANK : 0, ...roles.map((r) => r.position));
  return { perms: [...perms], rank: role ? rank : 0, roleIds: role ? roles.map((r) => String(r._id)) : [] };
}

/** May they do this in the community? (site admins can, everywhere) */
export const can = (access: Pick<SpaceAccess, "perms" | "canManage">, p: Permission) => !!access.perms?.includes(p);

/**
 * Who may see a community's member list: its owner and admins, and anyone whose roles let them moderate people
 * (remove, ban, time out, give roles). Site admins have every permission. Members don't see each other's list.
 */
export const canSeeMembers = (access: Pick<SpaceAccess, "perms" | "canManage">) => access.canManage || (["kick", "ban", "timeout", "manageRoles"] as Permission[]).some((p) => can(access, p));

/** Throws unless they have that permission. */
export function assertPerm(access: Pick<SpaceAccess, "perms" | "canManage">, p: Permission, what = "do that") {
  if (!can(access, p)) throw forbidden(`You don't have permission to ${what}.`);
}

/** The roles a membership holds (one query; none when it has none). */
export async function rolesOf(m: Pick<IMembership, "roleIds" | "status"> | null): Promise<Pick<ICommunityRole, "_id" | "position" | "permissions">[]> {
  if (!m || m.status !== "active" || !m.roleIds?.length) return [];
  return CommunityRole.find({ _id: { $in: m.roleIds } }).select("position permissions").lean<Pick<ICommunityRole, "_id" | "position" | "permissions">[]>();
}

/** When a community membership's timeout runs out (null: not timed out now). Owners are never timed out. */
export function timeoutOf(m: Pick<IMembership, "timeoutUntil" | "role" | "status"> | null | undefined): string | null {
  if (!m || m.status !== "active" || m.role === "owner" || !m.timeoutUntil) return null;
  return +new Date(m.timeoutUntil) > Date.now() ? new Date(m.timeoutUntil).toISOString() : null;
}

/** "You're timed out here until 3:40 PM." (with the reason they were given) */
export function timeoutMessage(until: string): string {
  const d = new Date(until);
  const soon = +d - Date.now() < 20 * 60 * 60 * 1000;
  const when = d.toLocaleString("en-NG", { timeZone: "Africa/Lagos", hour12: true, ...(soon ? { hour: "numeric", minute: "2-digit" } : { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) });
  return `You're timed out in this community until ${when}. You can still read.`;
}

/** Throws when this person is timed out in that community (for writes that don't go through spaceAccess). */
export async function assertNoCommunityTimeout(userId: Types.ObjectId, communityId: Types.ObjectId | null | undefined) {
  if (!communityId) return;
  const m = await Membership.findOne({ userId, communityId, subcommunityId: null }).select("timeoutUntil role status").lean<IMembership>();
  const until = timeoutOf(m);
  if (until) throw forbidden(timeoutMessage(until));
}

/** Throws for a timed-out member (posting, reacting, voting, starting events or kliques). */
export function assertNotTimedOut(access: Pick<SpaceAccess, "timedOutUntil" | "needsRules">) {
  if (access.timedOutUntil) throw forbidden(timeoutMessage(access.timedOutUntil));
  if (access.needsRules) throw forbidden("Accept the community's rules first (open the community to see them).");
}

const isManager = (r: Role | null) => r === "owner" || r === "admin";

/** Who's asking, for a space's points minimums (lib/points): their points, and whether they're a site admin. */
export interface PointsGate {
  points: number;
  siteAdmin: boolean;
}
export const gateOf = (viewer: Pick<IUser, "points" | "email"> | null): PointsGate | undefined => (viewer ? { points: viewer.points ?? 0, siteAdmin: isSiteAdmin(viewer) } : undefined);

/**
 * The points a space asks for that this person doesn't have (0 when they're fine). Owners, admins and site admins
 * never need any, and the Klique community never asks.
 */
export function pointsShort(min: number | undefined, role: Role | null, gate: PointsGate | undefined, official = false): number {
  if (!min || official || !gate || gate.siteAdmin || isManager(role)) return 0;
  return gate.points >= min ? 0 : min;
}

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
  community: Pick<ICommunity, "privacy"> & Partial<Pick<ICommunity, "official" | "minPointsPost" | "welcome">>,
  membership: IMembership | null,
  pendingRequest: boolean,
  gate?: PointsGate,
  roles: Pick<ICommunityRole, "_id" | "position" | "permissions">[] = [],
): SpaceAccess {
  const role = activeRole(membership);
  const banned = membership?.status === "banned";
  const isPublic = community.privacy === "public";
  const short = role ? pointsShort(community.minPointsPost, role, gate, !!community.official) : 0;
  const timedOutUntil = timeoutOf(membership);
  // the welcome screen: rules to accept first (owners and admins never), and whether they've seen it
  const welcome = community.welcome?.enabled ? community.welcome : null;
  const needsRules = !!welcome && welcome.requireAccept && welcome.rules.length > 0 && role === "member" && !membership?.rulesAcceptedAt;
  const welcomePending = !!welcome && role !== null && !membership?.welcomedAt && (needsRules || role === "member");
  return {
    role,
    isMember: role !== null,
    pendingRequest: role ? false : pendingRequest,
    canManage: isManager(role),
    canView: isPublic ? true : role !== null,
    canPost: role !== null && !timedOutUntil && !needsRules,
    needsRules,
    welcomePending,
    timedOutUntil,
    ...rolePowers(role, roles),
    pointsToPost: short,
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
  sub: Partial<Pick<ISubcommunity, "minPointsPost">> | null,
  parentMembership: IMembership | null,
  subMembership: IMembership | null,
  viewerIsSiteAdmin = false,
  points?: number,
  parentRoles: Pick<ICommunityRole, "_id" | "position" | "permissions">[] = [],
): SpaceAccess {
  const parentRole = activeRole(parentMembership);
  const role = activeRole(subMembership);
  const banned = subMembership?.status === "banned";
  const overseer = parentRole === "owner" || viewerIsSiteAdmin;
  const short = role && points !== undefined ? pointsShort(sub?.minPointsPost, overseer ? "owner" : role, { points, siteAdmin: viewerIsSiteAdmin }) : 0;
  // a timeout in the community holds in its groups too
  const timedOutUntil = timeoutOf(parentMembership);
  return {
    role,
    isMember: role !== null,
    pendingRequest: false,
    canManage: isManager(role) || overseer,
    canView: role !== null || overseer,
    canPost: role !== null && !timedOutUntil,
    timedOutUntil,
    // in a group: its own admins can manage it; the community's roles carry over (a moderator there moderates here)
    ...(() => {
      const fromParent = rolePowers(parentRole, parentRoles);
      const own = rolePowers(overseer ? "owner" : role, []);
      return { perms: [...new Set([...fromParent.perms, ...own.perms])], rank: Math.max(fromParent.rank, own.rank), roleIds: fromParent.roleIds };
    })(),
    pointsToPost: short,
    banned,
    parentRole,
    canJoinDirectly: false,
    canModerate: overseer,
  };
}

/**
 * What `viewer` (possibly signed-out) may do in this space. An 18+ community they may not enter yet (too young,
 * no date of birth, not confirmed, explicit content off) makes them an outsider there, members included, whatever
 * else they'd have; site admins pass, to moderate.
 */
export async function spaceAccess(space: Space, viewer: IUser | null): Promise<SpaceAccess> {
  const access = await rawSpaceAccess(space, viewer);
  const gate = viewer && isSiteAdmin(viewer) ? null : adultGate(space.community, viewer);
  if (!gate) return access;
  return { ...access, role: null, isMember: false, canView: false, canPost: false, canManage: false, canJoinDirectly: false, canModerate: false, pendingRequest: false, adultGate: gate };
}

async function rawSpaceAccess(space: Space, viewer: IUser | null): Promise<SpaceAccess> {
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
    pointsToPost: 0,
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
    const access = communityAccessFrom(community, m, pending, gateOf(viewer), await rolesOf(m));
    // site admins can do anything a moderator can, anywhere
    return isSiteAdmin(viewer) ? { ...access, perms: [...ALL_PERMISSIONS] } : access;
  }

  // ---- subcommunity ----
  if (!viewer) return none;

  const [parentM, subM] = await Promise.all([
    findMembership(viewer._id, community._id, null),
    findMembership(viewer._id, community._id, sub._id),
  ]);
  return subAccessFrom(sub, parentM, subM, isSiteAdmin(viewer), viewer.points ?? 0, await rolesOf(parentM));
}

/* ---------------------------- assertions ---------------------------- */

export function assertCanView(access: SpaceAccess, what = "this") {
  if (!access.canView) throw forbidden(`You need to be a member to see ${what}.`);
}

export function assertCanPost(access: SpaceAccess) {
  assertNotTimedOut(access);
  if (access.needsRules) throw forbidden("Accept the community's rules first (open the community to see them).");
  if (!access.canPost) throw forbidden("Join this community to post or host here.");
}

/** For a new post in the Posts section: the points this space asks for (nothing else needs them). */
export function assertPointsToPost(access: SpaceAccess) {
  if (access.pointsToPost) throw forbidden(`You need ${access.pointsToPost.toLocaleString("en-NG")} points to post here.`);
}

export function assertCanManage(access: SpaceAccess) {
  if (!access.canManage) throw forbidden("Only owners and admins can do that.");
}

/** A group must look like it doesn't exist to anyone who can't see it. */
export function assertSubVisibleOrHidden(space: Space, access: SpaceAccess) {
  if (space.sub && !access.canView) throw notFound("We couldn't find that group.");
}

/* ------------------------------ events ------------------------------ */

/**
 * Mongo filter of the events this viewer sees in feeds: home, Events, search, profiles, ads. Use it in EVERY event
 * list/search query. The rule: Klique's own events (the default community, posted by site admins) are for
 * everyone; every other event is for the members of its community, and a group's events for the group's members
 * only, public community or not. The host always sees their own. Membership decides, not the stored audience.
 * (A public community's own page still lists its events to visitors: see listEvents.)
 */
export async function eventVisibilityFilter(viewer: IUser | null): Promise<Record<string, unknown>> {
  const [klique, memberships] = await Promise.all([
    kliqueId(),
    viewer
      ? Membership.find({ userId: viewer._id, status: "active" }).select("communityId subcommunityId").lean<Pick<IMembership, "communityId" | "subcommunityId">[]>()
      : Promise.resolve([] as Pick<IMembership, "communityId" | "subcommunityId">[]),
  ]);
  // Klique's events, and any old event that never had a community
  const forEveryone = { communityId: { $in: klique ? [klique, null] : [null] }, subcommunityId: null };
  // a member's event waiting for approval (or turned down) shows to its host only
  if (!viewer) return { $and: [forEveryone, publishedEvents(null)] };

  // 18+ communities' events (and their groups') stay on their own pages
  const adult = new Set((await adultCommunityIds()).map(String));
  const listed = memberships.filter((m) => !adult.has(String(m.communityId)));
  const communityIds = listed.filter((m) => !m.subcommunityId).map((m) => m.communityId);
  const subIds = listed.filter((m) => m.subcommunityId).map((m) => m.subcommunityId!);
  return {
    $and: [
      {
        $or: [
          forEveryone,
          // community events, but never a group's: those belong to the group
          { communityId: { $in: communityIds }, subcommunityId: null },
          { subcommunityId: { $in: subIds } },
          { hostId: viewer._id },
        ],
      },
      publishedEvents(viewer),
    ],
  };
}

/** Approved events (not waiting for review, not turned down), plus the viewer's own whatever their state. */
export function publishedEvents(viewer: Pick<IUser, "_id"> | null): Record<string, unknown> {
  return viewer ? { $or: [{ review: null }, { hostId: viewer._id }] } : { review: null };
}

/** May this person approve or turn down events in the event's space? Its owners and admins, and site admins. */
export async function canReviewEvent(event: Pick<IEvent, "communityId" | "subcommunityId">, viewer: IUser | null): Promise<boolean> {
  if (!viewer || !event.communityId) return false;
  if (isSiteAdmin(viewer)) return true;
  const rows = await Membership.find({ userId: viewer._id, communityId: event.communityId, status: "active", subcommunityId: { $in: [null, event.subcommunityId ?? null] } }).select("subcommunityId role roleIds status").lean<Pick<IMembership, "subcommunityId" | "role" | "roleIds" | "status">[]>();
  const parentRow = rows.find((m) => !m.subcommunityId) ?? null;
  const parent = parentRow?.role ?? null;
  const own = event.subcommunityId ? (rows.find((m) => m.subcommunityId && String(m.subcommunityId) === String(event.subcommunityId))?.role ?? null) : parent;
  if (isManager(own) || (!!event.subcommunityId && parent === "owner")) return true;
  // a community role with "Manage events"
  return rolePowers(parent, await rolesOf(parentRow)).perms.includes("manageEvents");
}

const inAdultCommunity = async (event: Pick<IEvent, "communityId">) => !!event.communityId && (await adultCommunityIds()).some((id) => String(id) === String(event.communityId));

/** The same rule for one event: would it show up in this viewer's feeds (and ads)? */
export async function canSeeEventInFeeds(event: IEvent, viewer: IUser | null): Promise<boolean> {
  // an 18+ community's events stay on its own pages
  if (await inAdultCommunity(event)) return false;
  if (viewer && String(event.hostId) === String(viewer._id)) return true;
  if (event.review) return false;
  if (!event.subcommunityId && (!event.communityId || String(event.communityId) === String(await kliqueId()))) return true;
  if (!viewer) return false;
  const m = await findMembership(viewer._id, event.communityId!, event.subcommunityId ?? null);
  return activeRole(m) !== null;
}

/**
 * Can this viewer open the event's page? Everything they'd see in feeds, plus the events of a public community
 * (its page lists them to visitors so they can decide to join; going needs joining). A private community's and a
 * group's events stay with their members.
 */
export async function canViewEvent(event: IEvent, viewer: IUser | null): Promise<boolean> {
  // waiting for approval or turned down: its host, and whoever can approve it
  if (event.review) return (!!viewer && String(event.hostId) === String(viewer._id)) || (await canReviewEvent(event, viewer));
  // an 18+ community's event: its members who may enter it (policies/adult), and site admins
  if (await inAdultCommunity(event)) {
    if (!viewer) return false;
    if (isSiteAdmin(viewer)) return true;
    const c = await Community.findById(event.communityId).select("adult explicit").lean<Pick<ICommunity, "adult" | "explicit">>();
    if (!c || adultGate(c, viewer)) return false;
    const m = await findMembership(viewer._id, event.communityId!, event.subcommunityId ?? null);
    return activeRole(m) !== null || String(event.hostId) === String(viewer._id);
  }
  if (await canSeeEventInFeeds(event, viewer)) return true;
  if (event.subcommunityId || !event.communityId) return false;
  const c = await Community.findById(event.communityId).select("privacy").lean<Pick<ICommunity, "privacy">>();
  return c?.privacy === "public";
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
export function canSeeChannel(channel: Pick<IChannel, "visibility"> & Partial<Pick<IChannel, "overrides" | "categoryOverrides">>, access: SpaceAccess, invited = false): boolean {
  if (!access.canView) return false;
  if (access.canManage) return true;
  // a role's allow or deny (any allow wins over a deny; a channel's own beats its category's)
  const say = roleSay(channel, access, "view");
  if (say === "allow" && access.isMember) return true;
  if (say === "deny") return false;
  if (channel.visibility === "all") return true;
  return channel.visibility === "invite" && invited;
}

/** Posting needs membership of the space; announcement channels additionally need owner/admin (or a role allowed to). */
export function canPostInChannel(channel: Pick<IChannel, "visibility" | "type"> & Partial<Pick<IChannel, "overrides" | "categoryOverrides">>, access: SpaceAccess, invited = false): boolean {
  if (!canSeeChannel(channel, access, invited) || !access.canPost || access.banned || channel.type === "voice") return false;
  if (access.canManage) return true;
  const say = roleSay(channel, access, "post");
  if (say === "deny") return false;
  return channel.type !== "announcement" || say === "allow";
}

/**
 * What this person's roles say about seeing or posting in a channel: "allow" if any of their roles allows it,
 * else "deny" if any denies it, else null (the channel's usual rule). For each role the channel's own override
 * counts; without one, its category's.
 */
function roleSay(channel: Partial<Pick<IChannel, "overrides" | "categoryOverrides">>, access: Pick<SpaceAccess, "roleIds">, what: "view" | "post"): "allow" | "deny" | null {
  const mine = access.roleIds;
  if (!mine?.length || (!channel.overrides?.length && !channel.categoryOverrides?.length)) return null;
  let deny = false;
  for (const id of mine) {
    const own = channel.overrides?.find((o) => String(o.roleId) === id);
    const value = own?.[what] ?? channel.categoryOverrides?.find((o) => String(o.roleId) === id)?.[what] ?? null;
    if (value === "allow") return "allow";
    if (value === "deny") deny = true;
  }
  return deny ? "deny" : null;
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
