/**
 * One-off: groups became private and add-only (Oct 2026). Safe to run more than once.
 *  - every group is marked private
 *  - events in a group become visible to that group only
 *  - group invite links are revoked (they no longer work)
 *  - every community's own events match its privacy again (private community → members only)
 * Groups over the 50-person limit keep everyone; nobody new can be added until they're under it.
 *
 *   npm run migrate:groups
 */
import { config } from "dotenv";
import mongoose from "mongoose";

config({ path: ".env.local" });
config();

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  console.log(`Connected to ${db.databaseName}`);

  const groups = await db.collection("subcommunities").updateMany({ visibility: { $ne: "private" } }, { $set: { visibility: "private" } });
  const events = await db.collection("events").updateMany({ subcommunityId: { $ne: null }, audience: { $ne: "subcommunity" } }, { $set: { audience: "subcommunity" } });
  const invites = await db.collection("invitations").updateMany({ subcommunityId: { $ne: null }, revokedAt: null }, { $set: { revokedAt: new Date() } });
  // events posted directly in a community follow its privacy (the app keeps them in sync; this repairs old data)
  const privateIds = (await db.collection("communities").find({ privacy: "private" }).project({ _id: 1 }).toArray()).map((c) => c._id);
  const toPrivate = await db.collection("events").updateMany({ communityId: { $in: privateIds }, subcommunityId: null, audience: { $ne: "community" } }, { $set: { audience: "community" } });
  const toPublic = await db.collection("events").updateMany({ communityId: { $nin: [...privateIds, null] }, subcommunityId: null, audience: { $ne: "public" } }, { $set: { audience: "public" } });
  const full = await db.collection("subcommunities").find({ memberCount: { $gt: 50 } }).project({ name: 1, memberCount: 1 }).toArray();

  console.log(`Groups made private:        ${groups.modifiedCount}`);
  console.log(`Group events made private:  ${events.modifiedCount}`);
  console.log(`Group invite links revoked: ${invites.modifiedCount}`);
  console.log(`Community events fixed:     ${toPrivate.modifiedCount} made members-only, ${toPublic.modifiedCount} made public`);
  console.log(full.length ? `Over 50 people (kept, but no new adds): ${full.map((g) => `${g.name} (${g.memberCount})`).join(", ")}` : "No group is over 50 people.");
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
