/**
 * One-off (Oct 2026): bought "points" become Hype, earned "Hype" becomes points, and ranks go
 * (server/migrations/currency.ts). The app also does this by itself the first time it connects, so this is
 * only for doing it ahead of a deploy. It runs once per database; running it again does nothing.
 *
 *   npm run migrate:currency
 */
import { config } from "dotenv";
import mongoose from "mongoose";
import { createInterface } from "node:readline/promises";
import { migrateCurrency } from "../server/migrations/currency";

config({ path: ".env.local" });
config();

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);
  const host = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, "http://")).host;
  console.log(`About to swap Hype and points in the database at: ${host} (${mongoose.connection.name})`);
  if (!process.argv.includes("--yes")) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question("Go ahead? (y/N) ")).trim().toLowerCase();
    rl.close();
    if (answer !== "y" && answer !== "yes") {
      console.log("Nothing changed.");
      return;
    }
  }
  console.log((await migrateCurrency(mongoose.connection)) === "migrated" ? "Done: bought balances are Hype, earned scores are points." : "Already done on this database. Nothing changed.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
