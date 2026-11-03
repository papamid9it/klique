import "server-only";
import { Types } from "mongoose";
import { z } from "zod";
import { ADMIN_PERMISSIONS, ROLE_CAP, isPermission, PERMISSIONS } from "@/lib/roles";
import type { RoleDTO } from "@/lib/types";
import { badRequest, forbidden, notFound } from "../http/errors";
import { CommunityRole, type ICommunityRole } from "../models/CommunityRole";
import { Membership, type IMembership } from "../models/Membership";
import { ModAction } from "../models/ModAction";
import type { IUser } from "../models/User";
import { ADMIN_RANK, assertPerm, rolePowers, type Space, type SpaceAccess } from "../policies/access";
import { sid } from "./helpers";
import { resolveSpaceFor } from "./spaces.service";

/**
 * Custom roles (lib/roles). The owner, and people with "Manage roles", make and edit roles below their own highest
 * role, and give them to people below them. Up to 50 per community. The built-in Admin role stands for "admin"
 * (Membership.role): giving it makes someone an admin, taking it away makes them a member; its permissions are fixed.
 */

export const roleInput = z.object({
  name: z.string().trim().min(1, "Give the role a name.").max(32, "Up to 32 characters."),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, "Pick a colour.").nullable().optional(),
  icon: z.string().trim().max(16).nullable().optional(),
  permissions: z.array(z.string()).max(20).optional(),
  selfAssignable: z.boolean().optional(),
});
export const roleOrderInput = z.object({ ids: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(ROLE_CAP) });
export const memberRolesInput = z.object({ roleIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(ROLE_CAP) });

const toDto = (r: ICommunityRole, counts?: Map<string, number>): RoleDTO => ({
  id: sid(r._id),
  name: r.name,
  color: r.color,
  icon: r.icon,
  position: r.position,
  permissions: r.permissions.filter(isPermission),
  selfAssignable: !!r.selfAssignable,
  builtin: r.builtin,
  ...(counts ? { memberCount: counts.get(sid(r._id)) ?? 0 } : {}),
});

/** The community's Admin role (made the first time it's needed, at the top below the owner). */
export async function ensureAdminRole(communityId: Types.ObjectId): Promise<ICommunityRole> {
  const found = await CommunityRole.findOne({ communityId, builtin: "admin" }).lean<ICommunityRole>();
  if (found) return found;
  try {
    return (await CommunityRole.create({ communityId, name: "Admin", color: "#e67e22", position: ADMIN_RANK, permissions: ADMIN_PERMISSIONS, builtin: "admin" })).toObject();
  } catch {
    return (await CommunityRole.findOne({ communityId, builtin: "admin" }).lean<ICommunityRole>())!;
  }
}

/** Keep the Admin role in step with Membership.role (call after someone becomes, or stops being, an admin). */
export async function syncAdminRole(communityId: Types.ObjectId, userId: Types.ObjectId, isAdmin: boolean) {
  const admin = await ensureAdminRole(communityId);
  await Membership.updateOne({ userId, communityId, subcommunityId: null }, isAdmin ? { $addToSet: { roleIds: admin._id } } : { $pull: { roleIds: admin._id } });
}

export interface MemberStanding {
  rank: number;
  /** the colour of their highest coloured role (shown on their name), if any */
  color: string | null;
  roles: Pick<RoleDTO, "id" | "name" | "color" | "icon">[];
}

/** Each person's rank, name colour and roles in the community (one query each for memberships and roles). */
export async function standings(communityId: Types.ObjectId, userIds: (Types.ObjectId | string)[]): Promise<Map<string, MemberStanding>> {
  const out = new Map<string, MemberStanding>();
  const ids = [...new Set(userIds.map(String))];
  if (!ids.length) return out;
  const ms = await Membership.find({ communityId, subcommunityId: null, status: "active", userId: { $in: ids } }).select("userId role roleIds").lean<Pick<IMembership, "userId" | "role" | "roleIds">[]>();
  const roleIds = [...new Set(ms.flatMap((m) => (m.roleIds ?? []).map(String)))];
  const roles = roleIds.length ? await CommunityRole.find({ _id: { $in: roleIds } }).lean<ICommunityRole[]>() : [];
  const byId = new Map(roles.map((r) => [sid(r._id), r]));
  for (const m of ms) {
    const mine = (m.roleIds ?? []).flatMap((id) => byId.get(String(id)) ?? []).sort((a, b) => b.position - a.position);
    out.set(sid(m.userId), { rank: rolePowers(m.role, mine).rank, color: mine.find((r) => r.color)?.color ?? null, roles: mine.map((r) => ({ id: sid(r._id), name: r.name, color: r.color, icon: r.icon })) });
  }
  return out;
}

async function manage(viewer: IUser, slug: string): Promise<{ space: Space; access: SpaceAccess }> {
  const found = await resolveSpaceFor(viewer, slug);
  if (found.space.sub) throw badRequest("Roles belong to the community.");
  assertPerm(found.access, "manageRoles", "manage roles");
  return found;
}

/** The community's roles, top first, with how many hold each (anyone in it can see them). */
export async function listRoles(viewer: IUser, slug: string): Promise<{ items: RoleDTO[]; myRank: number; canManage: boolean; cap: number }> {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (!access.isMember && !access.canManage) throw forbidden("Join to see this community's roles.");
  await ensureAdminRole(space.community._id);
  const rows = await CommunityRole.find({ communityId: space.community._id }).sort({ position: -1, createdAt: 1 }).lean<ICommunityRole[]>();
  const counts = new Map<string, number>(
    (await Membership.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { communityId: space.community._id, subcommunityId: null, status: "active", roleIds: { $exists: true, $ne: [] } } }, { $unwind: "$roleIds" }, { $group: { _id: "$roleIds", n: { $sum: 1 } } }])).map((x) => [sid(x._id), x.n]),
  );
  return { items: rows.map((r) => toDto(r, counts)), myRank: access.rank ?? 0, canManage: !!access.perms?.includes("manageRoles"), cap: ROLE_CAP };
}

const cleanPerms = (p: string[] | undefined, mine: string[]) => [...new Set((p ?? []).filter(isPermission))].filter((x) => mine.includes(x));

export async function createRole(viewer: IUser, slug: string, input: z.infer<typeof roleInput>): Promise<RoleDTO> {
  const { space, access } = await manage(viewer, slug);
  const cid = space.community._id;
  if ((await CommunityRole.countDocuments({ communityId: cid })) >= ROLE_CAP) throw badRequest(`A community can have up to ${ROLE_CAP} roles.`);
  // a new role goes just under the highest role below yours (or at the bottom)
  const below = await CommunityRole.findOne({ communityId: cid, position: { $lt: access.rank ?? 0 } }).sort({ position: -1 }).lean<ICommunityRole>();
  const position = below ? Math.max(1, below.position - 1) : 1;
  if (position >= (access.rank ?? 0)) throw forbidden("You can only make roles below your own.");
  // you can't hand out powers you don't have
  const r = await CommunityRole.create({ communityId: cid, name: input.name, color: input.color ?? null, icon: input.icon || null, position, permissions: cleanPerms(input.permissions, access.perms ?? []), selfAssignable: !!input.selfAssignable });
  await renumber(cid);
  void ModAction.create({ communityId: cid, actorId: viewer._id, action: "role.create", targetType: "role", targetId: r._id, label: r.name, authorId: null }).catch(() => {});
  return toDto((await CommunityRole.findById(r._id).lean<ICommunityRole>())!);
}

async function loadBelow(cid: Types.ObjectId, access: SpaceAccess, id: string): Promise<ICommunityRole> {
  const r = await CommunityRole.findOne({ _id: id, communityId: cid }).lean<ICommunityRole>();
  if (!r) throw notFound("We couldn't find that role.");
  if (r.position >= (access.rank ?? 0)) throw forbidden("You can only change roles below your own.");
  return r;
}

export async function updateRole(viewer: IUser, slug: string, id: string, input: Partial<z.infer<typeof roleInput>>): Promise<RoleDTO> {
  const { space, access } = await manage(viewer, slug);
  const r = await loadBelow(space.community._id, access, id);
  const set: Partial<ICommunityRole> = {};
  if (input.name !== undefined) set.name = input.name;
  if (input.color !== undefined) set.color = input.color;
  if (input.icon !== undefined) set.icon = input.icon || null;
  if (input.selfAssignable !== undefined) set.selfAssignable = r.builtin ? false : input.selfAssignable;
  if (input.permissions !== undefined && !r.builtin) {
    // keep the powers you can't grant as they were; change only the ones you have
    const mine = access.perms ?? [];
    set.permissions = [...new Set([...r.permissions.filter((p) => !mine.includes(p as never)), ...cleanPerms(input.permissions, mine)])];
  }
  await CommunityRole.updateOne({ _id: r._id }, { $set: set });
  return toDto((await CommunityRole.findById(r._id).lean<ICommunityRole>())!);
}

export async function deleteRole(viewer: IUser, slug: string, id: string) {
  const { space, access } = await manage(viewer, slug);
  const r = await loadBelow(space.community._id, access, id);
  if (r.builtin) throw badRequest("The Admin role can't be deleted. Make admins members instead.");
  if (r.botAppId) throw badRequest("This is a bot's role. Remove the bot (Settings → Webhooks & bots) to remove it.");
  await Promise.all([CommunityRole.deleteOne({ _id: r._id }), Membership.updateMany({ communityId: space.community._id, roleIds: r._id }, { $pull: { roleIds: r._id } })]);
  await (await import("../models/Channel")).Channel.updateMany({ communityId: space.community._id }, { $pull: { overrides: { roleId: r._id }, categoryOverrides: { roleId: r._id } } });
  await (await import("../models/Channel")).ChannelCategory.updateMany({ communityId: space.community._id }, { $pull: { overrides: { roleId: r._id } } });
  void ModAction.create({ communityId: space.community._id, actorId: viewer._id, action: "role.delete", targetType: "role", targetId: r._id, label: r.name, authorId: null }).catch(() => {});
  return { deleted: true };
}

/** Reorder: `ids` top first. Only the roles below your own move; anything above stays where it is. */
export async function reorderRoles(viewer: IUser, slug: string, ids: string[]): Promise<RoleDTO[]> {
  const { space, access } = await manage(viewer, slug);
  const cid = space.community._id;
  const rows = await CommunityRole.find({ communityId: cid }).lean<ICommunityRole[]>();
  const movable = rows.filter((r) => r.position < (access.rank ?? 0));
  const order = ids.filter((id) => movable.some((r) => sid(r._id) === id));
  if (order.length !== movable.length) throw badRequest("Send every role below yours, in the new order.");
  // they keep the same set of positions, handed out in the new order
  const slots = movable.map((r) => r.position).sort((a, b) => b - a);
  await Promise.all(order.map((id, i) => CommunityRole.updateOne({ _id: id }, { $set: { position: slots[i] } })));
  return (await CommunityRole.find({ communityId: cid }).sort({ position: -1 }).lean<ICommunityRole[]>()).map((r) => toDto(r));
}

/** Positions 1, 2, 3… under whatever is above, without ties (the Admin role keeps its place unless moved). */
async function renumber(cid: Types.ObjectId) {
  const rows = await CommunityRole.find({ communityId: cid }).sort({ position: -1, createdAt: 1 }).lean<ICommunityRole[]>();
  const seen = new Set<number>();
  for (const r of rows) {
    let p = r.position;
    while (seen.has(p) && p > 1) p--;
    seen.add(p);
    if (p !== r.position) await CommunityRole.updateOne({ _id: r._id }, { $set: { position: p } });
  }
}

/**
 * Set which roles someone holds. You can add or take away only roles below your own, for someone below you; the
 * roles above yours they already hold stay. Giving or taking the Admin role makes them an admin or a member.
 */
export async function setMemberRoles(viewer: IUser, slug: string, userId: string, roleIds: string[]): Promise<{ roleIds: string[] }> {
  const { space, access } = await manage(viewer, slug);
  const cid = space.community._id;
  const m = await Membership.findOne({ userId, communityId: cid, subcommunityId: null, status: "active" }).lean<IMembership>();
  if (!m) throw notFound("That person isn't a member.");
  if (m.role === "owner") throw forbidden("The owner already has every power.");
  const myRank = access.rank ?? 0;
  const theirs = await standings(cid, [m.userId]);
  if (sid(m.userId) !== sid(viewer._id) && (theirs.get(sid(m.userId))?.rank ?? 0) >= myRank) throw forbidden("You can only change roles for people below you.");
  const all = await CommunityRole.find({ communityId: cid }).lean<ICommunityRole[]>();
  const byId = new Map(all.map((r) => [sid(r._id), r]));
  const wanted = new Set(roleIds.filter((id) => byId.has(id)));
  const keep = (m.roleIds ?? []).map(String).filter((id) => (byId.get(id)?.position ?? 0) >= myRank);
  // a bot's own role stays with the bot
  const give = [...wanted].filter((id) => byId.get(id)!.position < myRank && !byId.get(id)!.botAppId);
  const next = [...new Set([...keep, ...give])];
  const admin = all.find((r) => r.builtin === "admin");
  const isAdmin = !!admin && next.includes(sid(admin._id));
  await Membership.updateOne({ _id: m._id }, { $set: { roleIds: next.map((id) => new Types.ObjectId(id)), role: isAdmin ? "admin" : "member" } });
  void ModAction.create({ communityId: cid, actorId: viewer._id, action: "role.assign", targetType: "member", targetId: m.userId, label: next.map((id) => byId.get(id)?.name).filter(Boolean).join(", ") || "no roles", authorId: m.userId }).catch(() => {});
  return { roleIds: next };
}

export const PERMISSION_LIST = PERMISSIONS;
