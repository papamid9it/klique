/**
 * Create every index the models declare, on the database in MONGODB_URI. Run it once after deploying new features
 * to production (production doesn't build indexes by itself, server/db.ts `autoIndex`), and again any time: it only
 * ADDS missing indexes (createIndexes), never drops or changes existing ones.
 *
 *   npm run db:indexes
 *
 * It prints the database name (never the address) and, per collection, the indexes it added.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as never); // a MONGODB_URI already set in the shell wins
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

async function main() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error("Set MONGODB_URI first.");
  // load every model file so each schema (and its indexes) is registered
  const dir = path.join(process.cwd(), "server/models");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".ts") && x !== "define.ts")) await import(path.join(dir, f));
  await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 15_000 });
  const db = mongoose.connection.db!;
  console.log(`Database: ${db.databaseName}`);
  let added = 0;
  for (const name of mongoose.modelNames().sort()) {
    const model = mongoose.model(name);
    const coll = model.collection.collectionName;
    const before = new Set((await db.collection(coll).indexes().catch(() => [])).map((i) => i.name));
    try {
      await model.createIndexes();
    } catch (e) {
      console.warn(`  ${coll}: couldn't add an index (left as it is): ${(e as Error).message}`);
    }
    const after = (await db.collection(coll).indexes().catch(() => [])).map((i) => i.name).filter((n) => !before.has(n));
    if (after.length) {
      added += after.length;
      console.log(`  ${coll}: added ${after.join(", ")}`);
    }
  }
  console.log(added ? `Done: ${added} index${added === 1 ? "" : "es"} added.` : "Done: every index was already there.");
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("Failed:", (e as Error).message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
