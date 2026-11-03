import type { Connection } from "mongoose";

/**
 * One-off (Nov 2026): gallery slots are any mix of photos and videos, Free 2, Lite 4, Pro 6. Saved plan settings
 * (Admin → Plans) that are still an old default get the new numbers (an admin's own choice stays), and the old
 * separate photo and video caps are dropped. Runs once ("migration:media-slots-v3").
 */
export async function migrateMediaSlots(conn: Connection): Promise<"migrated" | "already done"> {
  const db = conn.db;
  if (!db) throw new Error("Not connected.");
  const settings = db.collection<{ _id: string; value?: unknown; updatedAt?: Date }>("appsettings");
  try {
    await settings.insertOne({ _id: "migration:media-slots-v3", value: { state: "running" }, updatedAt: new Date() });
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return "already done";
    throw e;
  }
  // only numbers that are still an old default change (Free 3; Lite 4 or 8; Pro 4 or 12): an admin's own choice stays
  const OLD: Record<"free" | "lite" | "pro", number[]> = { free: [3], lite: [4, 8], pro: [4, 12] };
  const NEW = { free: 2, lite: 4, pro: 6 };
  const row = await settings.findOne({ _id: "planConfig" });
  const value = row?.value && typeof row.value === "object" ? (row.value as { mediaSlots?: Partial<Record<keyof typeof NEW, unknown>> }) : null;
  if (value) {
    const now = value.mediaSlots ?? {};
    const next = Object.fromEntries((Object.keys(NEW) as (keyof typeof NEW)[]).map((p) => [p, typeof now[p] !== "number" || OLD[p].includes(now[p] as number) ? NEW[p] : now[p]]));
    await settings.updateOne({ _id: "planConfig" }, { $set: { "value.mediaSlots": next, updatedAt: new Date() }, $unset: { "value.mediaVideos": "", "value.mediaPhotos": "" } });
  }
  await settings.updateOne({ _id: "migration:media-slots-v3" }, { $set: { value: { state: "done" }, updatedAt: new Date() } });
  return "migrated";
}
