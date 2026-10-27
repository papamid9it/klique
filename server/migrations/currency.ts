import type { Connection } from "mongoose";

/**
 * One-off (Oct 2026): Hype and points swap meanings.
 *  - Hype becomes the currency you buy (it was "points"): `User.points` moves to `User.hype`, packs bought keep
 *    their numbers (`pointpurchases.points` → `hype`), designs paid for are marked "hype", and the shop's
 *    settings (packs, prices, unlock length) move from "pointsConfig" to "walletConfig".
 *  - Points become earned reputation (it was "Hype"): `User.hype` moves to `User.points`, and what each action
 *    was worth moves from "ranksConfig" to "pointsEarning". Ranks are gone (`User.rank` is dropped).
 * It runs once per database: the first run claims "migration:currency-v2" in app settings, and every later run
 * (another server, the script) sees the claim and does nothing. Running the swap twice would undo it.
 */
export const CURRENCY_MIGRATION = "migration:currency-v2";

type Setting = { _id: string; value?: unknown; updatedAt?: Date };

export async function migrateCurrency(conn: Connection): Promise<"migrated" | "already done"> {
  const db = conn.db;
  if (!db) throw new Error("Not connected.");
  const settings = db.collection<Setting>("appsettings");
  try {
    await settings.insertOne({ _id: CURRENCY_MIGRATION, value: { state: "running", startedAt: new Date() }, updatedAt: new Date() });
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return "already done";
    throw e;
  }

  await db.collection("users").updateMany({}, [{ $set: { hype: { $ifNull: ["$points", 0] }, points: { $ifNull: ["$hype", 0] } } }, { $unset: "rank" }]);
  await db.collection("pointpurchases").updateMany({ points: { $exists: true } }, { $rename: { points: "hype" } });
  await db.collection("styleunlocks").updateMany({ source: "points" }, { $set: { source: "hype" } });

  const shop = await settings.findOne({ _id: "pointsConfig" });
  if (shop) {
    await settings.updateOne({ _id: "walletConfig" }, { $setOnInsert: { value: shop.value, updatedAt: new Date() } }, { upsert: true });
    await settings.deleteOne({ _id: "pointsConfig" });
  }
  const ranks = await settings.findOne({ _id: "ranksConfig" });
  if (ranks) {
    const actions = (ranks.value as { actions?: Record<string, number> } | undefined)?.actions;
    if (actions) await settings.updateOne({ _id: "pointsEarning" }, { $setOnInsert: { value: { actions }, updatedAt: new Date() } }, { upsert: true });
    await settings.deleteOne({ _id: "ranksConfig" });
  }

  await settings.updateOne({ _id: CURRENCY_MIGRATION }, { $set: { value: { state: "done", finishedAt: new Date() }, updatedAt: new Date() } });
  return "migrated";
}
