import type { Connection } from "mongoose";

/**
 * One-off (Nov 2026): the default mood is Paper Mono now (it was Monochrome). Monochrome was saved on every account
 * as the default, so there's no telling who picked it on purpose: everyone still on it moves to Paper Mono (anyone
 * can pick Monochrome again in Settings, Appearance). Accounts on any other mood chose it, and keep it.
 * Runs once per database ("migration:mood-paper-v1").
 */
export const MOOD_MIGRATION = "migration:mood-paper-v1";

export async function migrateMood(conn: Connection): Promise<"migrated" | "already done"> {
  const db = conn.db;
  if (!db) throw new Error("Not connected.");
  const settings = db.collection<{ _id: string; value?: unknown; updatedAt?: Date }>("appsettings");
  try {
    await settings.insertOne({ _id: MOOD_MIGRATION, value: { state: "running" }, updatedAt: new Date() });
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return "already done";
    throw e;
  }
  const r = await db.collection("users").updateMany({ $or: [{ mood: "monochrome" }, { mood: { $exists: false } }] }, { $set: { mood: "paper-mono" } });
  await settings.updateOne({ _id: MOOD_MIGRATION }, { $set: { value: { state: "done", people: r.modifiedCount }, updatedAt: new Date() } });
  return "migrated";
}

/**
 * One-off (Nov 2026): the default is "system" now (Paper Mono, or Monochrome on a device in dark mode). Paper Mono
 * was saved on every account as the old default, so everyone still on it moves to "system"; other moods were
 * chosen, and stay. Runs once ("migration:mood-system-v1").
 */
export async function migrateMoodSystem(conn: Connection): Promise<"migrated" | "already done"> {
  const db = conn.db;
  if (!db) throw new Error("Not connected.");
  const settings = db.collection<{ _id: string; value?: unknown; updatedAt?: Date }>("appsettings");
  try {
    await settings.insertOne({ _id: "migration:mood-system-v1", value: { state: "running" }, updatedAt: new Date() });
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return "already done";
    throw e;
  }
  const r = await db.collection("users").updateMany({ $or: [{ mood: "paper-mono" }, { mood: { $exists: false } }] }, { $set: { mood: "system" } });
  await settings.updateOne({ _id: "migration:mood-system-v1" }, { $set: { value: { state: "done", people: r.modifiedCount }, updatedAt: new Date() } });
  return "migrated";
}
