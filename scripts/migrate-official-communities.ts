/**
 * One-off (Oct 2026): every event now lives in a community. Events that have none (posted by a site admin as
 * "public", or imported by the event finder) move into their city's official Klique community ("Klique Lagos"),
 * which is created when missing and owned by the first account listed in ADMIN_EMAILS. Their crews follow.
 * Safe to run more than once.
 *
 *   npm run migrate:official
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
  const { Event } = await import("../server/models/Event");
  const { Crew } = await import("../server/models/Crew");
  const { User } = await import("../server/models/User");
  const { officialCommunityFor } = await import("../server/services/official.service");

  const emails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const owner = emails.length ? await User.findOne({ email: { $in: emails } }).select("_id email").lean() : null;
  if (!owner) throw new Error("No account matches ADMIN_EMAILS. Sign up with one of those emails first: it will own the official communities.");
  console.log(`Official communities are owned by ${owner.email}`);

  const loose = await Event.find({ communityId: null }).lean();
  const perCommunity = new Map<string, number>();
  for (const e of loose) {
    const c = await officialCommunityFor(owner, { country: e.country ?? "NG", region: e.region ?? "", city: e.city, interest: e.interest });
    await Event.updateOne({ _id: e._id }, { $set: { communityId: c._id, subcommunityId: null, audience: "public" } });
    await Crew.updateMany({ eventId: e._id }, { $set: { communityId: c._id, subcommunityId: null } });
    perCommunity.set(c.name, (perCommunity.get(c.name) ?? 0) + 1);
  }

  console.log(`Events moved into a community: ${loose.length}`);
  for (const [name, n] of perCommunity) console.log(`  ${name}: ${n}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
