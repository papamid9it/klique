import { adminEmails } from "../env";
import { forbidden } from "../http/errors";
import { Community, type ICommunity } from "../models/Community";
import { Membership, type IMembership } from "../models/Membership";
import type { HostingOptionsDTO } from "@/lib/types";
import type { IUser } from "../models/User";
import type { SpaceAccess } from "./access";
import { isKlique } from "../services/klique-id";

/**
 * Who may put an event on Klique.
 *  - Events are posted from inside a community, by that community's owner and admins, for that community only.
 *  - A group's owner and admins may post events in their own group (the community's owner can too, as overseer).
 *  - Site admins may post anywhere. Only they post in the default "Klique" community, whose events everyone sees
 *    (Admin → Events, or the new-event form with no community picked).
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
 * Where this person may host, for the new-event form: the communities they own or run (top level), those where
 * they only run a group (`groupsOnly`), and those where they're a member who can send one in for approval
 * (`submit`). Site admins may host anywhere and pick from every community.
 */
export async function hostingOptions(u: IUser): Promise<HostingOptionsDTO> {
  const memberships = await Membership.find({ userId: u._id, status: "active" })
    .select("communityId subcommunityId role")
    .lean<Pick<IMembership, "communityId" | "subcommunityId" | "role">[]>();
  const runs = memberships.filter((m) => m.role === "owner" || m.role === "admin");
  const runsTop = new Set(runs.filter((m) => !m.subcommunityId).map((m) => String(m.communityId)));
  const runsGroupIn = new Set(runs.filter((m) => m.subcommunityId).map((m) => String(m.communityId)));
  const memberOf = new Set(memberships.filter((m) => !m.subcommunityId && m.role === "member").map((m) => String(m.communityId)));
  const ids = [...new Set([...runsTop, ...runsGroupIn, ...memberOf])];
  const siteAdmin = isSiteAdmin(u);
  const communities = ids.length ? await Community.find({ _id: { $in: ids } }).select("slug name privacy official memberEvents").lean<Pick<ICommunity, "_id" | "slug" | "name" | "privacy" | "official" | "memberEvents">[]>() : [];
  // Klique's events go to everyone: only site admins post there, whatever their role in it
  const list = communities
    .filter((c) => siteAdmin || !isKlique(c))
    .flatMap((c) => {
      const id = String(c._id);
      if (runsTop.has(id) || runsGroupIn.has(id) || siteAdmin) return [{ slug: c.slug, name: c.name, privacy: c.privacy, groupsOnly: !runsTop.has(id) && !siteAdmin }];
      return c.memberEvents !== false ? [{ slug: c.slug, name: c.name, privacy: c.privacy, groupsOnly: false, submit: true }] : [];
    });
  list.sort((a, b) => a.name.localeCompare(b.name));
  return { siteAdmin, communities: list };
}
