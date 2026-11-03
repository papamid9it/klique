import type { Connection } from "mongoose";

/**
 * One-off (Nov 2026): message requests. "People in my communities" (dmPolicy "shared") is gone; "shared" now means
 * "friends and klique mates only", which would be stricter than what people chose. Everyone on it moves to
 * "everyone, as message requests" (strangers can still only send one request). Runs once ("migration:dm-requests-v1").
 */
export async function migrateDm(conn: Connection): Promise<"migrated" | "already done"> {
  const db = conn.db;
  if (!db) throw new Error("Not connected.");
  const settings = db.collection<{ _id: string; value?: unknown; updatedAt?: Date }>("appsettings");
  try {
    await settings.insertOne({ _id: "migration:dm-requests-v1", value: { state: "running" }, updatedAt: new Date() });
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return "already done";
    throw e;
  }
  const r = await db.collection("users").updateMany({ $or: [{ dmPolicy: "shared" }, { dmPolicy: { $exists: false } }] }, { $set: { dmPolicy: "everyone" } });
  await settings.updateOne({ _id: "migration:dm-requests-v1" }, { $set: { value: { state: "done", people: r.modifiedCount }, updatedAt: new Date() } });
  return "migrated";
}
