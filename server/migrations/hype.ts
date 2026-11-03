import type { Connection } from "mongoose";

/**
 * One-off (Nov 2026): Hype (the currency you bought) is replaced by Lite and Pro plans. Everyone's leftover Hype
 * becomes days of Lite, at the old price: the ₦2,000 pack was 1,200 Hype and a month of Lite is ₦2,000, so
 * 1,200 Hype = 30 days, i.e. 40 Hype a day (rounded up, so any Hype at all is at least a day). Someone already on
 * a plan gets the days on top of it (on Pro, Pro just lasts that much longer). Their history gets a line saying
 * so. Designs already unlocked with Hype keep their end date. Runs once per database ("migration:hype-to-lite-v1").
 */
export const HYPE_MIGRATION = "migration:hype-to-lite-v1";
export const HYPE_PER_LITE_DAY = 40;

type Setting = { _id: string; value?: unknown; updatedAt?: Date };
type Row = { _id: unknown; hype?: number; plan?: string; planUntil?: Date | null };

const DAY_MS = 24 * 60 * 60 * 1000;

export async function migrateHype(conn: Connection): Promise<"migrated" | "already done"> {
  const db = conn.db;
  if (!db) throw new Error("Not connected.");
  const settings = db.collection<Setting>("appsettings");
  try {
    await settings.insertOne({ _id: HYPE_MIGRATION, value: { state: "running", startedAt: new Date() }, updatedAt: new Date() });
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return "already done";
    throw e;
  }
  const users = db.collection<Row>("users");
  const now = Date.now();
  let people = 0;
  for await (const u of users.find({ hype: { $gt: 0 } }).project<Row>({ hype: 1, plan: 1, planUntil: 1 })) {
    const hype = u.hype ?? 0;
    const days = Math.ceil(hype / HYPE_PER_LITE_DAY);
    const onPlan = u.plan && u.plan !== "free" && u.planUntil && +u.planUntil > now ? u.plan : null;
    const from = onPlan ? +u.planUntil! : now;
    const until = new Date(from + days * DAY_MS);
    // only if the balance is still what we read (never twice)
    const done = await users.updateOne({ _id: u._id, hype } as never, { $set: { hype: 0, plan: onPlan ?? "lite", planUntil: until } });
    if (!done.modifiedCount) continue;
    await db.collection("hypetxns").insertOne({ userId: u._id, amount: -hype, balanceAfter: 0, kind: "revoke", note: `Hype is gone: turned into ${days} ${days === 1 ? "day" : "days"} of ${onPlan === "pro" ? "Pro" : "Lite"}`, ref: "hype-to-lite", byId: null, createdAt: new Date() });
    await db.collection("subscriptions").updateOne({ userId: u._id }, { $setOnInsert: { plan: "lite", status: "non_renewing", source: "hype", amount: 0, paystack: { customerCode: null, subscriptionCode: null, emailToken: null, planCode: null }, cancelledAt: null, createdAt: new Date() }, $set: { updatedAt: new Date() } }, { upsert: true });
    await db.collection("subscriptions").updateOne({ userId: u._id, source: "hype" }, { $set: { currentPeriodEnd: until } });
    people++;
  }
  await settings.updateOne({ _id: HYPE_MIGRATION }, { $set: { value: { state: "done", people, finishedAt: new Date() }, updatedAt: new Date() } });
  return "migrated";
}
