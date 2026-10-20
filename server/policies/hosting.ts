import { adminEmails } from "../env";
import { forbidden } from "../http/errors";
import { Community, type ICommunity } from "../models/Community";
import { Membership, type IMembership } from "../models/Membership";
import type { HostingOptionsDTO } from "@/lib/types";
import type { IUser } from "../models/User";
import type { SpaceAccess } from "./access";

/**
 * Who may put an event on Klique.
 *  - Events are posted from inside a community, by that community's owner and admins, for that community only.
 *  - A group's owner and admins may post events in their own group (the community's owner can too, as overseer).
 *  - Site admins may post anywhere, including public events that aren't tied to any community (Admin → Events).
 */

export const isSiteAdmin = (u: Pick<IUser, "email"> | null | undefined): boolean => !!u && adminEmails().has(u.email.toLowerCase());

export function canHostInSpace(access: Pick<SpaceAccess, "canManage">): boolean {
  return access.canManage;
}

export function assertCanHostInSpace(viewer: IUser, access: Pick<SpaceAccess, "canManage">) {
  if (isSiteAdmin(viewer)) return;
  if (!canHostInSpace(access)) throw forbidden("Only this community's owner and admins can post events here.");
}

/** Events outside any community are for site admins only. */
export function assertCanHostPublic(u: IUser) {
  if (!isSiteAdmin(u)) throw forbidden("Events are posted from inside a community, by its owner and admins.");
}

/**
 * Where this person may host, for the new-event form: the communities they own or run (top level), and those
 * where they only run a group (`groupsOnly`). Site admins may host anywhere and pick from every community.
 */
export async function hostingOptions(u: IUser): Promise<HostingOptionsDTO> {
  const memberships = await Membership.find({ userId: u._id, status: "active", role: { $in: ["owner", "admin"] } })
    .select("communityId subcommunityId role")
    .lean<Pick<IMembership, "communityId" | "subcommunityId" | "role">[]>();
  const runsTop = new Set(memberships.filter((m) => !m.subcommunityId).map((m) => String(m.communityId)));
  const runsGroupIn = new Set(memberships.filter((m) => m.subcommunityId).map((m) => String(m.communityId)));
  const ids = [...new Set([...runsTop, ...runsGroupIn])];
  const communities = ids.length ? await Community.find({ _id: { $in: ids } }).select("slug name privacy").lean<Pick<ICommunity, "_id" | "slug" | "name" | "privacy">[]>() : [];
  const list = communities.map((c) => ({ slug: c.slug, name: c.name, privacy: c.privacy, groupsOnly: !runsTop.has(String(c._id)) }));
  list.sort((a, b) => a.name.localeCompare(b.name));
  return { siteAdmin: isSiteAdmin(u), communities: list };
}
