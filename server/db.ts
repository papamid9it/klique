import mongoose from "mongoose";
import { ApiError } from "./http/errors";
import { mongoUri } from "./env";
import { migrateCurrency } from "./migrations/currency";

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
