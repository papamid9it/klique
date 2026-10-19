import type { Types } from "mongoose";
import { adminEmails, eventHostMinMembers } from "../env";
import { forbidden } from "../http/errors";
import { Community, type ICommunity } from "../models/Community";
import { Membership, type IMembership } from "../models/Membership";
import type { HostingOptionsDTO } from "@/lib/types";
import type { IUser } from "../models/User";
import type { SpaceAccess } from "./access";

/**
 * Who may put an event on Klique.
 *  - Inside a community or group: that space's owner and admins (a parent community's admins too). A community can
 *    open it up to every member with its "Who can post events" setting.
 *  - Public events that aren't tied to a community: site admins, hosts a site admin has verified, and owners of a
 *    community with at least EVENT_HOST_MIN_MEMBERS members.
 */

export const isSiteAdmin = (u: Pick<IUser, "email"> | null | undefined): boolean => !!u && adminEmails().has(u.email.toLowerCase());

export function canHostInSpace(community: Pick<ICommunity, "eventPolicy">, access: Pick<SpaceAccess, "isMember" | "canPost" | "canManage" | "canModerate">): boolean {
  if (access.canManage || access.canModerate) return true;
  return (community.eventPolicy ?? "admins") === "members" && access.canPost;
}

export function assertCanHostInSpace(community: Pick<ICommunity, "eventPolicy">, access: Pick<SpaceAccess, "isMember" | "canPost" | "canManage" | "canModerate">) {
  if (!access.isMember && !access.canModerate) throw forbidden("Join this community to host here.");
  if (!canHostInSpace(community, access)) throw forbidden("Only this community's admins can post events here.");
}

export interface PublicHosting {
  allowed: boolean;
  /** why (or why not), in words for the person */
  reason: "admin" | "verified" | "big-community" | "not-yet";
  minMembers: number;
}

export async function publicHosting(u: IUser): Promise<PublicHosting> {
  const minMembers = eventHostMinMembers();
  if (isSiteAdmin(u)) return { allowed: true, reason: "admin", minMembers };
  if (u.canHostPublic) return { allowed: true, reason: "verified", minMembers };
  const big = await Community.exists({ ownerId: u._id as Types.ObjectId, memberCount: { $gte: minMembers } });
  return big ? { allowed: true, reason: "big-community", minMembers } : { allowed: false, reason: "not-yet", minMembers };
}

export async function assertCanHostPublic(u: IUser) {
  const h = await publicHosting(u);
  if (!h.allowed) {
    throw forbidden(`Public events are open to verified hosts and to owners of communities with ${h.minMembers}+ members. You can still host inside a community you run.`);
  }
}

/**
 * Where this person may host, for the "Host a thing" form: public or not, and which communities.
 * A community is listed when they can host at its top level, or run one of its groups (`groupsOnly`).
 */
export async function hostingOptions(u: IUser): Promise<HostingOptionsDTO> {
  const [pub, memberships] = await Promise.all([
    publicHosting(u),
    Membership.find({ userId: u._id, status: "active" }).select("communityId subcommunityId role").lean<Pick<IMembership, "communityId" | "subcommunityId" | "role">[]>(),
  ]);
  const top = new Map(memberships.filter((m) => !m.subcommunityId).map((m) => [String(m.communityId), m.role]));
  const runsGroupIn = new Set(memberships.filter((m) => m.subcommunityId && m.role !== "member").map((m) => String(m.communityId)));
  const ids = [...new Set([...top.keys(), ...runsGroupIn])];
  const communities = ids.length ? await Community.find({ _id: { $in: ids } }).select("slug name privacy eventPolicy").lean<Pick<ICommunity, "_id" | "slug" | "name" | "privacy" | "eventPolicy">[]>() : [];
  const list = communities.flatMap((c) => {
    const role = top.get(String(c._id)) ?? null;
    const atTop = role === "owner" || role === "admin" || (role !== null && (c.eventPolicy ?? "admins") === "members");
    if (!atTop && !runsGroupIn.has(String(c._id))) return [];
    return [{ slug: c.slug, name: c.name, privacy: c.privacy, groupsOnly: !atTop }];
  });
  list.sort((a, b) => a.name.localeCompare(b.name));
  return { public: { allowed: pub.allowed, reason: pub.reason, minMembers: pub.minMembers }, communities: list };
}
