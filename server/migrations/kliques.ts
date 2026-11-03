import type { Connection } from "mongoose";

/**
 * One-off (Nov 2026): crews become kliques.
 *  - every existing crew gets what a klique has: a title ("Going to <event>"), the event's interest, its cover
 *    picture and its place (the collections keep their old names: crews, crewmembers, crewmessages, crewreads)
 *  - "one per person per event" now only applies to kliques that have an event (community kliques have none),
 *    so the two unique indexes are rebuilt to match (production doesn't build indexes by itself)
 *  - the default community "Klique" is renamed "Klique HQ", so it doesn't read like a klique
 * It runs once per database: the first run claims "migration:kliques-v1" in app settings, later runs do nothing.
 */
export const KLIQUES_MIGRATION = "migration:kliques-v1";

type Setting = { _id: string; value?: unknown; updatedAt?: Date };
type EventRow = { _id: unknown; title?: string; interest?: string; coverImage?: string | null; country?: string; city?: string };

export async function migrateKliques(conn: Connection): Promise<"migrated" | "already done"> {
  const db = conn.db;
  if (!db) throw new Error("Not connected.");
  const settings = db.collection<Setting>("appsettings");
  try {
    await settings.insertOne({ _id: KLIQUES_MIGRATION, value: { state: "running", startedAt: new Date() }, updatedAt: new Date() });
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return "already done";
    throw e;
  }

  const crews = db.collection("crews");
  const members = db.collection("crewmembers");

  // 1. the indexes: one per person per event only where there is an event
  for (const [col, name] of [
    [crews, "eventId_1_hostId_1"],
    [members, "eventId_1_userId_1"],
  ] as const) {
    await col.dropIndex(name).catch(() => {});
  }
  await crews.createIndex({ eventId: 1, hostId: 1 }, { unique: true, name: "event_host_unique", partialFilterExpression: { eventId: { $type: "objectId" } } });
  await members.createIndex({ eventId: 1, userId: 1 }, { unique: true, name: "event_user_unique", partialFilterExpression: { eventId: { $type: "objectId" } } });
  await members.createIndex({ crewId: 1, userId: 1 }, { unique: true }).catch((e) => console.warn("[db] kliques: crewId+userId index:", e instanceof Error ? e.message : e));
  await crews.createIndex({ communityId: 1, meetupAt: 1 });
  await crews.createIndex({ country: 1, city: 1, meetupAt: 1 });
  await crews.createIndex({ hostId: 1, createdAt: -1 });

  // 2. old crews get a title, interest, cover and place from their event
  const old = await crews.find({ title: { $exists: false } }).project<{ _id: unknown; eventId: unknown; area?: string }>({ _id: 1, eventId: 1, area: 1 }).toArray();
  if (old.length) {
    const events = await db
      .collection<EventRow>("events")
      .find({ _id: { $in: old.map((c) => c.eventId) } } as never)
      .project<EventRow>({ title: 1, interest: 1, coverImage: 1, country: 1, city: 1 })
      .toArray();
    const byId = new Map(events.map((e) => [String(e._id), e]));
    for (const c of old) {
      const e = byId.get(String(c.eventId));
      await crews.updateOne(
        { _id: c._id } as never,
        {
          $set: {
            title: (e?.title ? `Going to ${e.title}` : `Going together from ${c.area ?? "town"}`).slice(0, 120),
            interest: e?.interest ?? "music",
            coverImage: e?.coverImage ?? null,
            womenOnly: false,
            country: e?.country ?? "NG",
            city: e?.city ?? "",
          },
        },
      );
    }
  }

  // 3. "Klique" → "Klique HQ" (only if it still has the old name)
  await db.collection("communities").updateOne({ slug: "klique", official: true, name: "Klique" }, { $set: { name: "Klique HQ" } });

  await settings.updateOne({ _id: KLIQUES_MIGRATION }, { $set: { value: { state: "done", crews: old.length, finishedAt: new Date() }, updatedAt: new Date() } });
  return "migrated";
}

/**
 * One-off (Nov 2026): "who can join" a klique grew from a women-only switch to Everyone / Women only / Men only /
 * Mixed. Women-only kliques say so in the new field too. Sizes stay as they were (the total, host included).
 * Runs once ("migration:klique-audience-v1").
 */
export async function migrateKliqueAudience(conn: Connection): Promise<"migrated" | "already done"> {
  const db = conn.db;
  if (!db) throw new Error("Not connected.");
  const settings = db.collection<Setting>("appsettings");
  try {
    await settings.insertOne({ _id: "migration:klique-audience-v1", value: { state: "running" }, updatedAt: new Date() });
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return "already done";
    throw e;
  }
  await db.collection("crews").updateMany({ womenOnly: true, audience: { $exists: false } }, { $set: { audience: "women" } });
  await db.collection("crews").updateMany({ audience: { $exists: false } }, { $set: { audience: "everyone", womenSpots: 0, menSpots: 0 } });
  await settings.updateOne({ _id: "migration:klique-audience-v1" }, { $set: { value: { state: "done" }, updatedAt: new Date() } });
  return "migrated";
}
