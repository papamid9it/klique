import type { Connection } from "mongoose";

/**
 * One-off (Nov 2026): custom roles. Every community that has admins gets its built-in Admin role (position 1000,
 * every power but webhooks), and its admins hold it, so "admin" and the Admin role mean the same thing from now on.
 * Communities without admins get theirs the first time roles are opened. Runs once ("migration:roles-v1").
 */
export async function migrateRoles(conn: Connection): Promise<"migrated" | "already done"> {
  const db = conn.db;
  if (!db) throw new Error("Not connected.");
  const settings = db.collection<{ _id: string; value?: unknown; updatedAt?: Date }>("appsettings");
  try {
    await settings.insertOne({ _id: "migration:roles-v1", value: { state: "running" }, updatedAt: new Date() });
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return "already done";
    throw e;
  }
  const memberships = db.collection("memberships");
  const roles = db.collection("communityroles");
  const perms = ["manageChannels", "manageRoles", "deleteMessages", "timeout", "kick", "ban", "manageEvents", "mentionEveryone", "viewModLog"];
  const communityIds = await memberships.distinct("communityId", { subcommunityId: null, role: "admin", status: "active" });
  let n = 0;
  for (const communityId of communityIds) {
    let admin = await roles.findOne({ communityId, builtin: "admin" });
    if (!admin) {
      const now = new Date();
      const { insertedId } = await roles.insertOne({ communityId, name: "Admin", color: "#e67e22", icon: null, position: 1000, permissions: perms, selfAssignable: false, builtin: "admin", createdAt: now, updatedAt: now });
      admin = { _id: insertedId };
    }
    const r = await memberships.updateMany({ communityId, subcommunityId: null, role: "admin" }, { $addToSet: { roleIds: admin._id } });
    n += r.modifiedCount;
  }
  await settings.updateOne({ _id: "migration:roles-v1" }, { $set: { value: { state: "done", communities: communityIds.length, admins: n }, updatedAt: new Date() } });
  return "migrated";
}
