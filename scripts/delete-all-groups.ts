/**
 * One-off: groups were rebuilt (Nov 2026), and every old one goes: its channels, messages, events and memberships.
 * Communities stay. It only lists what it would delete unless you add --yes, and it refuses a database that looks
 * like production unless ALLOW_SEED=1 is set too.
 *
 *   npm run groups:delete             lists them
 *   npm run groups:delete -- --yes    deletes them
 */
import { config } from "dotenv";
import mongoose from "mongoose";
import { assertSafeSeedTarget } from "./seed-guard";

config({ path: ".env.local" });
config();

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  const go = process.argv.includes("--yes");
  if (go) assertSafeSeedTarget(uri);
  await mongoose.connect(uri);
  const { Subcommunity } = await import("../server/models/Subcommunity");
  const { purgeSpaceData } = await import("../server/services/helpers");
  console.log(`Connected to ${mongoose.connection.db!.databaseName}`);

  const groups = await Subcommunity.find({}).select("communityId name slug memberCount").lean<{ _id: mongoose.Types.ObjectId; communityId: mongoose.Types.ObjectId; name: string; slug: string; memberCount: number }[]>();
  console.log(`${groups.length} groups`);
  for (const g of groups) {
    console.log(`  ${g.name} (${g.slug}): ${g.memberCount} members`);
    if (!go) continue;
    await purgeSpaceData(g.communityId, g._id);
    await Subcommunity.deleteOne({ _id: g._id });
  }
  console.log(go ? `Deleted ${groups.length} groups.` : "Nothing deleted. Add --yes to delete them.");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
