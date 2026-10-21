/**
 * One-off (Oct 2026): set up "Klique", the default community everyone is in.
 *  - creates it if it's missing (owned by the first account in ADMIN_EMAILS)
 *  - moves the events and crews of the old per-city official communities ("Klique Lagos", "Klique Accra"...)
 *    into it, then deletes those city communities (their chats and members go; everyone is in Klique anyway)
 *  - moves events that never had a community into it
 *  - adds every account to it
 * Safe to run more than once.
 *
 *   npm run migrate:klique
 */
import { config } from "dotenv";
import mongoose from "mongoose";

config({ path: ".env.local" });
config();

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);
  console.log(`Connected to ${mongoose.connection.name}`);

  // after the env is loaded: the services read it
  const { Community } = await import("../server/models/Community");
  const { Event } = await import("../server/models/Event");
  const { Crew } = await import("../server/models/Crew");
  const { Membership } = await import("../server/models/Membership");
  const { User } = await import("../server/models/User");
  const { ensureKlique } = await import("../server/services/klique.service");
  const { purgeCommunity } = await import("../server/services/communities.service");
  const { recountMembers } = await import("../server/services/helpers");

  const emails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const owner = emails.length ? await User.findOne({ email: { $in: emails } }).select("_id email").lean() : null;
  if (!owner) throw new Error("No account matches ADMIN_EMAILS. Sign up with one of those emails first: it will own Klique.");

  // the old one-official-community-per-city index would stop Klique sharing a city with "Klique Lagos"
  await Community.collection.dropIndex("country_1_city_1").then(() => console.log("Dropped the old per-city index")).catch(() => {});

  const klique = await ensureKlique(owner._id);
  if (!klique) throw new Error("Couldn't create Klique.");
  console.log(`Klique: /communities/${klique.slug} (owner ${owner.email})`);

  // 1. the old city communities: their events and crews move to Klique, then they go
  const olds = await Community.find({ official: true, _id: { $ne: klique._id } }).lean();
  for (const c of olds) {
    const moved = await Event.updateMany({ communityId: c._id, subcommunityId: null }, { $set: { communityId: klique._id, audience: "public" } });
    await Crew.updateMany({ communityId: c._id, subcommunityId: null }, { $set: { communityId: klique._id } });
    await purgeCommunity(c);
    console.log(`  ${c.name}: ${moved.modifiedCount} events moved into Klique, community removed`);
  }

  // 2. events that never had a community
  const loose = await Event.find({ communityId: null }).select("_id").lean();
  if (loose.length) {
    await Event.updateMany({ _id: { $in: loose.map((e) => e._id) } }, { $set: { communityId: klique._id, subcommunityId: null, audience: "public" } });
    await Crew.updateMany({ eventId: { $in: loose.map((e) => e._id) } }, { $set: { communityId: klique._id, subcommunityId: null } });
  }
  console.log(`Events without a community moved into Klique: ${loose.length}`);

  // 3. everyone joins (anyone banned from it stays banned)
  let added = 0;
  const cursor = User.find({}).select("_id").lean().cursor();
  let batch: { _id: mongoose.Types.ObjectId }[] = [];
  const flush = async () => {
    if (!batch.length) return;
    const r = await Membership.bulkWrite(
      batch.map((u) => ({
        updateOne: {
          filter: { userId: u._id, communityId: klique._id, subcommunityId: null },
          update: { $setOnInsert: { role: "member", status: "active" } },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    added += r.upsertedCount;
    batch = [];
  };
  for await (const u of cursor) {
    batch.push(u as { _id: mongoose.Types.ObjectId });
    if (batch.length >= 1000) await flush();
  }
  await flush();
  const total = await recountMembers(klique._id, null);
  console.log(`People added to Klique: ${added} (members now: ${total})`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
