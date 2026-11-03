import mongoose from "mongoose";
import { ApiError } from "./http/errors";
import { mongoUri } from "./env";
import { migrateCurrency } from "./migrations/currency";
import { migrateKliqueAudience, migrateKliques } from "./migrations/kliques";
import { migrateMediaSlots } from "./migrations/plans";
import { migrateRoles } from "./migrations/roles";
import { migrateHype } from "./migrations/hype";
import { migrateMood } from "./migrations/mood";
import { migrateDm } from "./migrations/dm";

/**
 * One cached connection per server process (survives Next.js dev hot reloads).
 */
interface Cache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}
const g = globalThis as unknown as { __kliqueMongoose?: Cache };
const cache: Cache = (g.__kliqueMongoose ??= { conn: null, promise: null });

export async function connectDb(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;
  if (!cache.promise) {
    cache.promise = mongoose
      .connect(mongoUri(), {
        serverSelectionTimeoutMS: 6000,
        maxPoolSize: 10,
        autoIndex: process.env.NODE_ENV !== "production",
      })
      // one-off data changes that must land before anything reads the data (each runs once per database)
      .then(async (m) => {
        const done = await migrateCurrency(m.connection);
        if (done === "migrated") console.log("[db] moved bought points to Hype and earned Hype to points");
        if ((await migrateKliques(m.connection)) === "migrated") console.log("[db] crews are kliques now; the default community is Klique HQ");
        if ((await migrateKliqueAudience(m.connection)) === "migrated") console.log("[db] kliques: who can join is Everyone / Women / Men / Mixed now");
        if ((await migrateRoles(m.connection)) === "migrated") console.log("[db] roles: admins now hold each community's built-in Admin role");
        if ((await migrateMediaSlots(m.connection)) === "migrated") console.log("[db] plans: gallery slots are Free 2, Lite 4, Pro 6 (any mix)");
        if ((await migrateHype(m.connection)) === "migrated") console.log("[db] leftover Hype turned into Lite days");
        if ((await migrateMood(m.connection)) === "migrated") console.log("[db] everyone on the old default mood is on Paper Mono now");
        if ((await migrateDm(m.connection)) === "migrated") console.log("[db] message requests: \"people in my communities\" moved to everyone-as-requests");
        return m;
      })
      .catch((err) => {
        cache.promise = null; // allow retry on the next request
        console.error("[db] connection failed:", err instanceof Error ? err.message : err);
        throw new ApiError(503, "We couldn't reach the database. Please try again in a moment.", {
          code: "db_unavailable",
        });
      });
  }
  cache.conn = await cache.promise;
  return cache.conn;
}
